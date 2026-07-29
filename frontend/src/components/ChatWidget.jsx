// src/components/ChatWidget.jsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Lottie from "lottie-react";
import { useTheme } from "../context/ThemeContext";
// Real axios instance — confirmed at src/api/axiosConfig.js. It already
// attaches the correct token (localStorage 'fleet_token') and handles
// baseURL ('/api'), so we use it directly instead of a guessed bridge.
import api from "../api/axiosConfig";
import botAnimation from "../assets/chatbot.json";

const BOT_NAME = "Fleet Assist";

// ─────────────────────────────────────────────────────────────────────────
// Many free Lottie bot/chat icons ship with a solid-color circle or square
// baked in as a background layer, separate from the actual player's own
// background (which is already transparent). This strips those layers out:
//  - `ty: 1` = a solid-color layer (the most common "bg" culprit)
//  - any layer whose name hints it's a background/backdrop shape
// If your file uses a different structure and this over/under-strips,
// open the .json, find the offending layer under `layers`, and either
// delete it or set its `"hd": true` (hidden) by hand instead.
// ─────────────────────────────────────────────────────────────────────────
function stripBackgroundLayers(data) {
  if (!data || !Array.isArray(data.layers)) return data;
  const cleaned = {
    ...data,
    layers: data.layers.filter(layer => {
      const isSolid = layer.ty === 1;
      const nameHints = /bg|background|backdrop|circle.?bg|bg.?circle/i.test(layer.nm || "");
      return !isSolid && !nameHints;
    }),
  };
  return cleaned;
}

// Small reusable wrapper so every bot-avatar spot (FAB, message header,
// typing indicator) renders the same Lottie animation at whatever size is passed in.
function BotAvatar({ size = 20 }) {
  const cleanAnimation = useMemo(() => stripBackgroundLayers(botAnimation), []);
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <Lottie animationData={cleanAnimation} loop autoplay style={{ width: size, height: size }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 1 — verify the logged-in user's password before allowing any data
// queries. Returns a short-lived chatToken on success, stored for the
// remainder of this chat session (cleared on tab close, same as messages).
// Uses the real `api` axios instance — a genuine 401 here means the main
// login session itself is invalid, and axiosConfig.js's own interceptor
// already handles that globally (clears fleet_token, redirects to /login).
// Wrong CHAT password is deliberately 400 from the backend, not 401, so it
// never triggers that global logout — it's just "try again."
// ─────────────────────────────────────────────────────────────────────────
async function verifyPassword(password) {
  try {
    const { data } = await api.post("/dashboard/chat/verify-password", { password });
    return { ok: true, chatToken: data.chatToken };
  } catch (err) {
    const message = err.response?.data?.message || "Incorrect password. Please try again.";
    return { ok: false, message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — once verified, every real message goes through here with the
// chatToken attached. A 403 with chatUnverified:true means the 20-minute
// chat token expired — re-prompt for password, but stay logged in. A 401
// means the main login session died — axiosConfig.js's interceptor already
// redirects to /login in that case; we just also reset local chat state.
// ─────────────────────────────────────────────────────────────────────────
async function getReply(userText, chatToken) {
  try {
    const { data } = await api.post(
      "/dashboard/chat",
      { message: userText },
      { headers: { "x-chat-token": chatToken } }
    );
    return { text: data.reply || "I couldn't find anything matching that.", needsReverify: false, fullReset: false };
  } catch (err) {
    const status = err.response?.status;
    const data   = err.response?.data;

    if (status === 401) {
      return { text: "Your session has expired — please log in again to keep chatting.", needsReverify: true, fullReset: true };
    }
    if (status === 403 && data?.chatUnverified) {
      return { text: data.message || "Please re-enter your password to continue.", needsReverify: true, fullReset: false };
    }
    return { text: "Sorry, I couldn't reach support right now. Please try again in a moment.", needsReverify: false, fullReset: false };
  }
}

const STORAGE_KEY = "fleet_chat_history_v1";

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const WELCOME_MSG = {
  id: "welcome",
  from: "bot",
  text: "Hi! Please enter your password to continue.",
  time: Date.now(),
};

const CHAT_TOKEN_KEY = "fleet_chat_token_v1";

export default function ChatWidget() {
  const theme = useTheme();
  const activeColor = theme?.activeColor || "#2563eb";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadHistory() || [WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const [chatToken, setChatToken] = useState(() => {
    try { return localStorage.getItem(CHAT_TOKEN_KEY) || null; } catch { return null; }
  });

  // ── Full reset — called on logout, or when the main session (not just the
  // chat step-up token) expires. Wipes transcript + verification entirely,
  // so the next chat open starts clean with the password prompt again. ────
  const resetChatSession = useCallback(() => {
    setMessages([{ ...WELCOME_MSG, id: `welcome-${Date.now()}`, time: Date.now() }]);
    setChatToken(null);
    setInput("");
    setOpen(false);
    setUnread(0);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CHAT_TOKEN_KEY);
    } catch {}
  }, []);

  // Listen for a logout event dispatched elsewhere in the app (see note
  // below on wiring this into your real logout handler).
  useEffect(() => {
    window.addEventListener("app:logout", resetChatSession);
    return () => window.removeEventListener("app:logout", resetChatSession);
  }, [resetChatSession]);

  // ── Manual "clear chat" — triggered by the refresh button in the header.
  // Same wipe as resetChatSession, but keeps the panel OPEN (unlike the
  // logout reset, which also closes it) so the person can start typing
  // their password again right away. ─────────────────────────────────────
  const clearChat = useCallback(() => {
    setMessages([{ ...WELCOME_MSG, id: `welcome-${Date.now()}`, time: Date.now() }]);
    setChatToken(null);
    setInput("");
    setTyping(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CHAT_TOKEN_KEY);
    } catch {}
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const verified = !!chatToken;

  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typing, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setTyping(true);

    if (!verified) {
      // Password step — show a masked placeholder in the transcript instead
      // of the real password, and never write it to localStorage history.
      setMessages(prev => [...prev, { id: `u-${Date.now()}`, from: "user", text: "•".repeat(Math.min(text.length, 12)), time: Date.now() }]);
      const result = await verifyPassword(text);
      if (result.ok) {
        setChatToken(result.chatToken);
        try { localStorage.setItem(CHAT_TOKEN_KEY, result.chatToken); } catch {}
        setMessages(prev => [...prev, { id: `b-${Date.now()}`, from: "bot", text: "Great, you're verified ✅ What can I help you with?", time: Date.now() }]);
      } else {
        setMessages(prev => [...prev, { id: `b-${Date.now()}`, from: "bot", text: result.message, time: Date.now() }]);
      }
      setTyping(false);
      if (!open) setUnread(n => n + 1);
      return;
    }

    // Normal, verified chat
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, from: "user", text, time: Date.now() }]);
    try {
      const { text: replyText, needsReverify, fullReset } = await getReply(text, chatToken);
      if (fullReset) {
        // Main login session expired — wipe the chat entirely so next login
        // starts clean, rather than leaving a half-verified stale state.
        setMessages(prev => [...prev, { id: `b-${Date.now()}`, from: "bot", text: replyText, time: Date.now() }]);
        setTyping(false);
        setTimeout(resetChatSession, 1200); // brief pause so the message is readable before it clears
        return;
      }
      setMessages(prev => [...prev, { id: `b-${Date.now()}`, from: "bot", text: replyText, time: Date.now() }]);
      if (needsReverify) {
        setChatToken(null);
        try { localStorage.removeItem(CHAT_TOKEN_KEY); } catch {}
      }
      if (!open) setUnread(n => n + 1);
    } finally {
      setTyping(false);
    }
  }, [input, open, verified, chatToken, resetChatSession]);

  const handleKeyDown = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const formatTime = ts => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ position: "fixed", right: 18, bottom: 4, zIndex: 10000, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes chatPop     { from { opacity:0; transform:translateY(16px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes chatDot     { 0%,60%,100% { opacity:0.25; transform:translateY(0); } 30% { opacity:1; transform:translateY(-3px); } }
        @keyframes chatBadgeIn { from { transform:scale(0); } to { transform:scale(1); } }
        @keyframes chatFabIn   { from { opacity:0; transform:scale(0.7); } to { opacity:1; transform:scale(1); } }
        .chat-scroll::-webkit-scrollbar        { width:5px; }
        .chat-scroll::-webkit-scrollbar-thumb  { background:#cbd5e1; border-radius:3px; }
        .chat-send-btn:hover:not(:disabled)    { filter:brightness(1.08); }
        .chat-icon-btn:hover                   { background:#eef2f7; }
        .chat-fab:hover                        { transform:translateY(-2px) scale(1.04); }
      `}</style>

      {/* ── Chat panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            width: 420,
            maxWidth: "calc(100vw - 44px)",
            height: 600,
            maxHeight: "calc(100vh - 110px)",
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 20px 56px rgba(0,0,0,0.24)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            marginBottom: 14,
            animation: "chatPop 0.18s ease",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* Header — "Chat with us" style */}
          <div
            style={{
              background: activeColor,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Chat with us</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={clearChat}
                title="Clear chat and start over"
                aria-label="Clear chat"
                style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "rgba(255,255,255,0.18)", border: "none", color: "#fff",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "rgba(255,255,255,0.18)", border: "none", color: "#fff",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Message list */}
          <div ref={listRef} className="chat-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12, background: "#f8fafc" }}>
            {messages.map((m, idx) => {
              const showBotHeader = m.from === "bot" && messages[idx - 1]?.from !== "bot";
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.from === "user" ? "flex-end" : "flex-start" }}>
                  {showBotHeader && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, marginLeft: 2 }}>
                      <BotAvatar size={20} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{BOT_NAME}</span>
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: "82%",
                      padding: "9px 13px",
                      borderRadius: m.from === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                      background: m.from === "user" ? activeColor : "#eef2f7",
                      color: m.from === "user" ? "#fff" : "#1e293b",
                      fontSize: 13,
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                    }}
                  >
                    {m.text}
                  </div>
                  <span style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 3, padding: "0 3px" }}>{formatTime(m.time)}</span>
                </div>
              );
            })}

            {typing && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, marginLeft: 2 }}>
                  <BotAvatar size={20} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{BOT_NAME}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 14px", borderRadius: "14px 14px 14px 3px", background: "#eef2f7", width: "fit-content" }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#94a3b8", animation: `chatDot 1.1s ${i * 0.15}s infinite ease-in-out` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input row — emoji / text / send */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderTop: "1px solid #eef1f5", background: "#fff", flexShrink: 0 }}>
            <button className="chat-icon-btn" title="Emoji" style={iconBtnStyle}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            <input
              ref={inputRef}
              type={verified ? "text" : "password"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={verified ? "Type something to send…" : "Enter your password…"}
              style={{
                flex: 1, border: "none", outline: "none", fontSize: 12.5,
                fontFamily: "inherit", color: "#1e293b", padding: "8px 4px",
                background: "transparent",
              }}
            />
            <button
              className="chat-send-btn"
              onClick={send}
              disabled={!input.trim()}
              aria-label="Send message"
              style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: "transparent", border: "none",
                cursor: input.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "filter 0.15s",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? activeColor : "#c7cdd6"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Floating action button ────────────────────────────────────────
          Only rendered when the panel is CLOSED — the panel's own header
          already has a close (✕) button, so we don't need a second one here. */}
      {!open && (
        <button
          className="chat-fab"
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          style={{
            width: 180, height: 180,
            background: "transparent",
            border: "none",
            filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.3))",
            cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", transition: "transform 0.15s",
            marginLeft: "auto", animation: "chatFabIn 0.2s ease",
          }}
        >
          <BotAvatar size={180} />
          {unread > 0 && (
            <span
              style={{
                position: "absolute", top: 2, right: 2, minWidth: 20, height: 20, borderRadius: 10,
                background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px",
                border: "2px solid #fff", animation: "chatBadgeIn 0.2s ease",
              }}
            >
              {unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

const iconBtnStyle = {
  width: 30, height: 30, borderRadius: "50%", border: "none", background: "transparent",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0, transition: "background 0.15s",
};