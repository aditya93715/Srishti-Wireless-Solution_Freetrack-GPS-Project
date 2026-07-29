// backend/controllers/chatController.js
'use strict';

const bcrypt = require('bcryptjs'); // npm install bcryptjs if not already installed
const jwt    = require('jsonwebtoken');
const axios  = require('axios');

const User                = require('../models/User');
const VehicleLatestStatus = require('../models/VehicleLatestStatus');
const DeviceMaster         = require('../models/DeviceMaster');

// ─────────────────────────────────────────────────────────────────────────────
// § A  CHAT SESSION TOKEN (step-up auth)
//      A short-lived, purpose-scoped JWT, separate from the login JWT.
//      Proves "this user re-entered their password within the last N minutes"
//      without needing server-side session storage.
// ─────────────────────────────────────────────────────────────────────────────
// Matches your main login session's lifetime (JWT_EXPIRES_IN in .env,
// currently 7d) instead of a short 20-minute window — so the person is
// only asked for their password once per login, not repeatedly during
// the same session. It still resets on real logout (see ChatWidget.jsx's
// app:logout listener) or if they explicitly clear the chat.
const CHAT_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '7d';

function issueChatToken(user) {
  return jwt.sign(
    { id: user._id.toString(), user_id: user.user_id, purpose: 'chat_verified' },
    process.env.JWT_SECRET,
    { expiresIn: CHAT_TOKEN_TTL }
  );
}

// Exported as middleware — routes file wires this in front of POST /chat
// NOTE: deliberately 403, not 401 — the frontend's shared axios instance
// (axiosConfig.js) force-logs-out the user on ANY 401 response, globally.
// A missing/expired *chat* token is not the same as an invalid *login*
// token, so it must never use 401 or it would wrongly kick the user out
// of the whole dashboard just because their 20-minute chat window lapsed.
function requireChatToken(req, res, next) {
  const token = req.headers['x-chat-token'];
  if (!token) {
    return res.status(403).json({ success: false, chatUnverified: true, message: 'Password verification required.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'chat_verified' || decoded.user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, chatUnverified: true, message: 'Password verification required.' });
    }
    next();
  } catch {
    return res.status(403).json({ success: false, chatUnverified: true, message: 'Password verification expired — please re-enter your password.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § B  SMALL LOCAL HELPERS (self-contained — not imported from Dashboardroutes.js
//      on purpose, since that file doesn't export fmtDate/memGet and reaching
//      into another file's private scope would be fragile)
// ─────────────────────────────────────────────────────────────────────────────
const pad = (n, l = 2) => String(n).padStart(l, '0');

function fmtDate(d) {
  if (!d) return '--';
  const dt = new Date(d);
  if (isNaN(dt)) return '--';
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} `
       + `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function parseAux1(aux1) {
  const result = { battery: null, temperature: null, humidity: null };
  if (!aux1 || typeof aux1 !== 'string' || aux1.trim() === '' || aux1.startsWith('|')) return result;
  try {
    const parts = aux1.split('|');
    if (parts.length >= 2) {
      const batt = parseFloat(parts[1]);
      if (!isNaN(batt)) result.battery = Math.min(100, Math.max(0, Math.round(batt)));
    }
    if (parts.length >= 4) {
      const temp = parseFloat(parts[3]);
      if (!isNaN(temp)) result.temperature = parseFloat(temp.toFixed(2));
    }
    if (parts.length >= 5) {
      const hum = parseFloat(parts[4]);
      if (!isNaN(hum)) result.humidity = Math.min(100, Math.max(0, Math.round(hum)));
    }
  } catch {}
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// § C  HIERARCHY-SCOPED QUERY HELPERS
//      Same role conditions your /filters/dealers and /filters/users routes
//      already use — reused here so the chat can never see outside a user's
//      own subtree. An admin has no code path that accepts an arbitrary
//      target ID — everything is derived from req.user's own id.
// ─────────────────────────────────────────────────────────────────────────────
async function getSubordinateUsers(reqUser) {
  const { role, user_id } = reqUser;

  if (role === 'super_admin') {
    return User.find({
      active: { $ne: false },
      $or: [{ role: 'admin' }, { role: 'dealer' }, { role: 'user' }],
    }).select('user_id username fullName name role adminId dealerId').lean();
  }

  if (role === 'admin') {
    return User.find({
      active: { $ne: false },
      $or: [{ role: 'dealer' }, { role: 'user' }],
      $and: [{ $or: [{ adminId: user_id }, { createdBy: user_id }, { parentId: user_id }] }],
    }).select('user_id username fullName name role adminId dealerId').lean();
  }

  if (role === 'dealer') {
    return User.find({
      active: { $ne: false },
      role: 'user',
      $or: [{ dealerId: user_id }, { createdBy: user_id }, { parentId: user_id }],
    }).select('user_id username fullName name role adminId dealerId').lean();
  }

  return []; // plain 'user' role → no subordinates
}

async function findSubordinateByName(reqUser, nameQuery) {
  const subs = await getSubordinateUsers(reqUser);
  const q = nameQuery.trim().toLowerCase();
  return subs.find(u =>
    (u.fullName || '').toLowerCase().includes(q) ||
    (u.name || '').toLowerCase().includes(q) ||
    (u.username || '').toLowerCase().includes(q)
  ) || null;
}

function vehicleFilterForSubordinate(subordinateUser) {
  if (subordinateUser.role === 'dealer') return { dealerId: subordinateUser.user_id };
  if (subordinateUser.role === 'user')   return { userId:   subordinateUser.user_id };
  if (subordinateUser.role === 'admin')  return { adminId:  subordinateUser.user_id };
  return { _id: null };
}

function buildChatBaseFilter(reqUser) {
  const { role, user_id } = reqUser;
  switch (role) {
    case 'super_admin': return {};
    case 'admin':        return { adminId:  user_id };
    case 'dealer':        return { dealerId: user_id };
    case 'user':           return { userId:   user_id };
    default:                return { _id: null };
  }
}

const CHAT_VEHICLE_REGEX = /\b[A-Z]{2}\s?-?\d{1,2}\s?-?[A-Z]{0,3}\s?-?\d{3,4}\b/i;
const CHAT_IMEI_REGEX    = /\b\d{14,16}\b/;

// ─────────────────────────────────────────────────────────────────────────────
// § C.1  OPTIONAL LLM INTENT CLASSIFIER (Groq — free API, real open-source
//        Llama model). Used ONLY when the regex-based checks above find
//        nothing recognizable — e.g. "yo whats up with my fleet today"
//        instead of the exact phrase "how many vehicles are running".
//
//        IMPORTANT SECURITY BOUNDARY: this function classifies intent and
//        extracts a name/plate the person is asking about — it NEVER runs
//        a database query itself, and it is never given DB access or your
//        schema. handleChat() takes its output and re-runs it through the
//        exact same scoped, hierarchy-safe queries used everywhere else in
//        this file. A prompt-injected message can only ever confuse the
//        *classification*, never bypass the *scoping*.
//
// Setup: sign up free at https://console.groq.com, create an API key, add
// GROQ_API_KEY=... to your backend .env. If it's not set, or the call
// fails/times out, this silently returns null and handleChat() falls back
// to the honest "I couldn't match that" message — never fake data.
// ─────────────────────────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

async function classifyIntentWithLLM(message) {
  if (!GROQ_API_KEY) return null;
  try {
    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content:
              'You classify a fleet-tracking chat message into EXACTLY one intent. ' +
              'Reply with ONLY compact JSON, no prose, no markdown fences. Shape:\n' +
              '{"intent":"greeting"|"fleet_count"|"org_count"|"list_dealers"|"list_users"|"vehicle_for_person"|"unknown","person":"<name or empty string>"}\n' +
              '- greeting: any casual hello/hi/hey/namaste-type message with no real question\n' +
              '- fleet_count: asking how many vehicles are running/stopped/idle/total in their own fleet\n' +
              '- org_count: asking how many dealers/users/admins they have\n' +
              '- list_dealers: asking to list/show their dealers\n' +
              '- list_users: asking to list/show their users\n' +
              '- vehicle_for_person: asking how many vehicles a specific named person/dealer/user has — extract that name into "person"\n' +
              '- unknown: anything else, including vehicle numbers/IMEIs (those are handled separately, never classify them)\n' +
              'Never invent a person name if none is mentioned — leave "person" as "".',
          },
          { role: 'user', content: message },
        ],
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 6000 }
    );

    const raw = data?.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = raw.replace(/^```json\s*|```$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const validIntents = ['greeting', 'fleet_count', 'org_count', 'list_dealers', 'list_users', 'vehicle_for_person', 'unknown'];
    if (!validIntents.includes(parsed.intent)) return null;
    return { intent: parsed.intent, person: typeof parsed.person === 'string' ? parsed.person.trim() : '' };
  } catch (err) {
    console.error('[chatController.classifyIntentWithLLM]', err.message);
    return null; // graceful degradation — never block the chat on an LLM hiccup
  }
}

function formatChatVehicleReply(doc) {
  const lastHB   = doc.packetTime || doc.updatedAt || null;
  const diffMin  = lastHB ? (Date.now() - new Date(lastHB).getTime()) / 60_000 : 9999;
  const ignition = doc.ignition === 1 || doc.ignition === true;
  const spd      = doc.speed || 0;

  let state = doc.state || 'unreachable';
  if (!lastHB)                          state = 'new';
  else if (diffMin > 60)                state = 'unreachable';
  else if (doc.overspeed || spd > 80)   state = 'overspeed';
  else if (ignition && spd > 0)         state = 'running';
  else if (ignition && spd === 0)       state = 'idle';
  else                                  state = 'stopped';

  const aux1Data   = parseAux1(doc.aux1 || '');
  const btrPercent = aux1Data.battery !== null
    ? aux1Data.battery
    : Math.min(100, Math.max(0, Math.round(doc.internalBattV || 0)));

  const address = doc.address && doc.address !== '--' ? doc.address : null;
  const coords  = (doc.lat != null && doc.lng != null)
    ? `${Number(doc.lat).toFixed(6)}, ${Number(doc.lng).toFixed(6)}`
    : null;

  const lines = [
    `Here's the latest on ${doc.vehicle}:`,
    `• Status: ${state}`,
    `• Last update: ${lastHB ? fmtDate(lastHB) : 'no recent data'}`,
    `• Speed: ${spd} km/h`,
  ];
  if (coords)  lines.push(`• Location (lat, lng): ${coords}`);
  if (address) lines.push(`• Address: ${address}`);
  if (!coords && !address) lines.push(`• Location: not available`);
  lines.push(`• Battery: ${btrPercent}%`);
  lines.push(`• Driver: ${doc.driverName || '--'}`);

  return lines.join('\n');
}

// ── Fallback formatter for a vehicle that exists in Device_Master but has
// no VehicleLatestStatus doc yet (device registered, no GPS packet received
// so far). Shows what we actually know instead of a false "not found". ────
function formatDeviceOnlyReply(device) {
  return [
    `Found ${device.vehicle_no} in your account, but it hasn't sent any GPS data yet.`,
    `• Status: no data received yet`,
    `• Driver: ${device.driver_name || '--'}`,
    `• Branch: ${device.branch || '--'}`,
    `• Vehicle type: ${device.vehicle_type || '--'}`,
    `• Locked: ${device.locked ? 'yes' : 'no'}`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// § D  CONTROLLER: POST /dashboard/chat/verify-password
// ─────────────────────────────────────────────────────────────────────────────
async function verifyPassword(req, res) {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    // ⚠️ Fetch WITH the password field — your normal `protect` middleware
    // deliberately excludes it, so we query fresh here.
    const fullUser = await User.findById(req.user._id).select('+password +passwordHash');
    if (!fullUser) {
      return res.status(400).json({ success: false, message: 'User not found.' });
    }

    // ⚠️ CONFIRM THIS MATCHES YOUR authController.js login logic.
    // If your login route compares passwords differently, mirror that here
    // instead of guessing — this must use the exact same hashing method.
    // Your User_Master data has a mix: some accounts have a real bcrypt hash
    // in passwordHash (e.g. "$2a$10$..."), others (older/legacy accounts)
    // only have a plain-text password field with passwordHash empty.
    // bcrypt.compare() only works against an actual bcrypt hash — calling it
    // on plain text always returns false, so we detect which case we're in.
    const looksLikeBcryptHash = str => typeof str === 'string' && /^\$2[aby]\$\d{2}\$/.test(str);

    let matches = false;
    if (looksLikeBcryptHash(fullUser.passwordHash)) {
      matches = await bcrypt.compare(password, fullUser.passwordHash);
    } else {
      // Legacy account — direct comparison against the plain-text field.
      // ⚠️ If your real authController.js login route does something
      // different for these legacy accounts, mirror that here instead.
      matches = password === fullUser.password;
    }

    if (!matches) {
      return res.status(400).json({ success: false, message: 'Incorrect password.' });
    }

    const chatToken = issueChatToken(fullUser);
    return res.json({ success: true, chatToken, expiresIn: CHAT_TOKEN_TTL });
  } catch (err) {
    console.error('[chatController.verifyPassword]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § E  CONTROLLER: POST /dashboard/chat
// ─────────────────────────────────────────────────────────────────────────────
async function handleChat(req, res) {
  try {
    const message = (req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    const lower      = message.toLowerCase();
    const reqUser     = req.user;
    const baseFilter  = buildChatBaseFilter(reqUser);

    // ── 1. Vehicle number or IMEI mentioned ────────────────────────────────
    const plateMatch = message.match(CHAT_VEHICLE_REGEX);
    const imeiMatch  = message.match(CHAT_IMEI_REGEX);

    if (plateMatch || imeiMatch) {
      const query = { ...baseFilter };
      if (imeiMatch) {
        query.imei = imeiMatch[0];
      } else {
        const plate = plateMatch[0].replace(/[\s-]/g, '').toUpperCase();
        query.vehicle = { $regex: new RegExp(`^${plate}$`, 'i') };
      }

      const doc = await VehicleLatestStatus.findOne(query).lean();
      if (doc) {
        return res.json({ success: true, reply: formatChatVehicleReply(doc) });
      }

      // No VehicleLatestStatus doc — could mean the vehicle genuinely
      // doesn't exist, OR it exists in Device_Master but has never sent a
      // GPS packet yet. Check Device_Master before saying "not found".
      // ⚠️ Device_Master uses `user_id` (snake_case), NOT `userId` like
      // VehicleLatestStatus — that field-name mismatch was the actual bug.
      const dmFilter = { active: true };
      switch (reqUser.role) {
        case 'super_admin': break;
        case 'admin':  dmFilter.adminId  = reqUser.user_id; break;
        case 'dealer': dmFilter.dealerId = reqUser.user_id; break;
        case 'user':   dmFilter.user_id  = reqUser.user_id; break;
        default:       dmFilter._id = null;
      }
      if (imeiMatch) {
        dmFilter.IMEI_No = imeiMatch[0];
      } else {
        const plate = plateMatch[0].replace(/[\s-]/g, '').toUpperCase();
        dmFilter.vehicle_no = { $regex: new RegExp(`^${plate}$`, 'i') };
      }

      const device = await DeviceMaster.findOne(dmFilter).lean();
      if (device) {
        return res.json({ success: true, reply: formatDeviceOnlyReply(device) });
      }

      return res.json({
        success: true,
        reply: `No data found for "${(plateMatch || imeiMatch)[0]}" in your account.`,
      });
    }

    // ── 2. Fleet-wide state counts, scoped to caller's own fleet ───────────
    if (lower.includes('how many') && (lower.includes('vehicle') || lower.includes('running') || lower.includes('stopped') || lower.includes('idle'))
        && !lower.includes('dealer') && !lower.includes('user') && !lower.includes('admin')) {
      const [all, running, stopped, idle, unreachable] = await Promise.all([
        VehicleLatestStatus.countDocuments({ ...baseFilter }),
        VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'running' }),
        VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'stopped' }),
        VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'idle' }),
        VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'unreachable' }),
      ]);
      return res.json({
        success: true,
        reply: `In your fleet right now: ${all} total, ${running} running, ${stopped} stopped, ${idle} idle, ${unreachable} unreachable.`,
      });
    }

    // ── 3. "How many dealers/users/admins do I have" ───────────────────────
    if (lower.includes('how many') && (lower.includes('dealer') || lower.includes('user') || lower.includes('admin'))) {
      if (reqUser.role === 'user') {
        return res.json({ success: true, reply: "Your account doesn't manage any dealers, users, or admins." });
      }
      const subs = await getSubordinateUsers(reqUser);
      const dealers = subs.filter(u => u.role === 'dealer').length;
      const users    = subs.filter(u => u.role === 'user').length;
      const admins   = subs.filter(u => u.role === 'admin').length;
      const parts = [];
      if (reqUser.role === 'super_admin') parts.push(`${admins} admins`);
      if (dealers) parts.push(`${dealers} dealers`);
      if (users)    parts.push(`${users} users`);
      return res.json({
        success: true,
        reply: parts.length ? `You have ${parts.join(', ')} under your account.` : "No dealers or users found under your account yet.",
      });
    }

    // ── 4. "List my dealers" / "list my users" ─────────────────────────────
    if (lower.includes('list') && (lower.includes('dealer') || lower.includes('user') || lower.includes('admin'))) {
      if (reqUser.role === 'user') {
        return res.json({ success: true, reply: "Your account doesn't manage any dealers, users, or admins." });
      }
      const subs = await getSubordinateUsers(reqUser);
      const wanted = lower.includes('dealer') ? 'dealer' : lower.includes('admin') ? 'admin' : 'user';
      const filtered = subs.filter(u => u.role === wanted);
      if (!filtered.length) {
        return res.json({ success: true, reply: `No ${wanted}s found under your account.` });
      }
      const names = filtered.map(u => `• ${u.fullName || u.name || u.username}`).join('\n');
      return res.json({ success: true, reply: `Your ${wanted}s:\n${names}` });
    }

    // ── 5. "How many vehicles does [name] have" — named subordinate lookup ─
    const vehicleForMatch = lower.match(/vehicles?\s+(?:does|for|of|under)\s+([a-z0-9 ._-]+?)(?:\s+have)?\??$/i);
    if (vehicleForMatch) {
      if (reqUser.role === 'user') {
        return res.json({ success: true, reply: "Your account doesn't manage any dealers or users." });
      }
      const target = await findSubordinateByName(reqUser, vehicleForMatch[1]);
      if (!target) {
        return res.json({ success: true, reply: `I couldn't find "${vehicleForMatch[1].trim()}" under your account.` });
      }
      const count = await VehicleLatestStatus.countDocuments(vehicleFilterForSubordinate(target));
      return res.json({
        success: true,
        reply: `${target.fullName || target.name || target.username} (${target.role}) has ${count} vehicle${count === 1 ? '' : 's'}.`,
      });
    }

    // ── 6. Greetings / help ─────────────────────────────────────────────────
    if (/\b(hi+|he+llo?|he+y+|yo|namaste)\b/i.test(lower)) {
      return res.json({
        success: true,
        reply: "What can I help you with? You can ask about a vehicle number, fleet counts, or your dealers/users.",
      });
    }

    // ── 7. LLM fallback — only reached if nothing above matched. Classifies
    // loose/casual phrasing ("yo hows my fleet doing today?") into one of
    // our known intents, then re-runs it through the SAME scoped queries
    // used above. If GROQ_API_KEY isn't set, or the call fails, this
    // silently returns null and falls through to the honest message below.
    const llmResult = await classifyIntentWithLLM(message);
    if (llmResult) {
      if (llmResult.intent === 'greeting') {
        return res.json({
          success: true,
          reply: "What can I help you with? You can ask about a vehicle number, fleet counts, or your dealers/users.",
        });
      }
      if (llmResult.intent === 'fleet_count') {
        const [all, running, stopped, idle, unreachable] = await Promise.all([
          VehicleLatestStatus.countDocuments({ ...baseFilter }),
          VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'running' }),
          VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'stopped' }),
          VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'idle' }),
          VehicleLatestStatus.countDocuments({ ...baseFilter, state: 'unreachable' }),
        ]);
        return res.json({
          success: true,
          reply: `In your fleet right now: ${all} total, ${running} running, ${stopped} stopped, ${idle} idle, ${unreachable} unreachable.`,
        });
      }
      if (llmResult.intent === 'org_count' && reqUser.role !== 'user') {
        const subs = await getSubordinateUsers(reqUser);
        const dealers = subs.filter(u => u.role === 'dealer').length;
        const users   = subs.filter(u => u.role === 'user').length;
        const admins  = subs.filter(u => u.role === 'admin').length;
        const parts = [];
        if (reqUser.role === 'super_admin') parts.push(`${admins} admins`);
        if (dealers) parts.push(`${dealers} dealers`);
        if (users)   parts.push(`${users} users`);
        return res.json({
          success: true,
          reply: parts.length ? `You have ${parts.join(', ')} under your account.` : "No dealers or users found under your account yet.",
        });
      }
      if ((llmResult.intent === 'list_dealers' || llmResult.intent === 'list_users') && reqUser.role !== 'user') {
        const subs = await getSubordinateUsers(reqUser);
        const wanted = llmResult.intent === 'list_dealers' ? 'dealer' : 'user';
        const filtered = subs.filter(u => u.role === wanted);
        return res.json({
          success: true,
          reply: filtered.length
            ? `Your ${wanted}s:\n${filtered.map(u => `• ${u.fullName || u.name || u.username}`).join('\n')}`
            : `No ${wanted}s found under your account.`,
        });
      }
      if (llmResult.intent === 'vehicle_for_person' && llmResult.person && reqUser.role !== 'user') {
        const target = await findSubordinateByName(reqUser, llmResult.person);
        if (!target) {
          return res.json({ success: true, reply: `I couldn't find "${llmResult.person}" under your account.` });
        }
        const count = await VehicleLatestStatus.countDocuments(vehicleFilterForSubordinate(target));
        return res.json({
          success: true,
          reply: `${target.fullName || target.name || target.username} (${target.role}) has ${count} vehicle${count === 1 ? '' : 's'}.`,
        });
      }
      // intent === 'unknown', or a role-gated intent that doesn't apply to
      // this user (e.g. a plain 'user' asking an org_count question) —
      // fall through to the honest message below rather than guessing.
    }

    // ── 8. Honest fallback — never a fake canned answer ────────────────────
    return res.json({
      success: true,
      reply: "I couldn't match that to anything I can look up. Try a vehicle number/IMEI, \"how many vehicles are running\", \"list my dealers\", or \"how many users does [name] have\".",
    });
  } catch (err) {
    console.error('[chatController.handleChat]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  requireChatToken,
  verifyPassword,
  handleChat,
};