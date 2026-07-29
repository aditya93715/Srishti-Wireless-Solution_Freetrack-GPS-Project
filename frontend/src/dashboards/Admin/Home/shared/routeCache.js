// ─────────────────────────────────────────────────────────────────────────────
// routeCache.js
// In-memory route store, OSRM road-snap helpers, and pushRoutePoint
// Place at: frontend/src/dashboards/Admin/Home/shared/routeCache.js
// ─────────────────────────────────────────────────────────────────────────────

export const TRAIL_MAX       = 800;
export const PACKET_BREAK_MS = 90_000;

// States where the vehicle is considered NOT moving
export const NON_MOVING_STATES = new Set(['idle', 'stopped', 'unreachable', 'inactive', 'new']);

// The global route cache — keyed by vehicle number string
export const routeCache = new Map();

// ── Geometry helpers ──────────────────────────────────────────────────────────
export function calcDist(la1, lo1, la2, lo2) {
  const R = 6371;
  const dLa = (la2 - la1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calcBearing(la1, lo1, la2, lo2) {
  const dLo  = (lo2 - lo1) * Math.PI / 180;
  const la1r = la1 * Math.PI / 180;
  const la2r = la2 * Math.PI / 180;
  return (
    (Math.atan2(
      Math.sin(dLo) * Math.cos(la2r),
      Math.cos(la1r) * Math.sin(la2r) - Math.sin(la1r) * Math.cos(la2r) * Math.cos(dLo)
    ) * 180 / Math.PI + 360) % 360
  );
}

// Smooth heading interpolation — picks shortest angular path
export function shortestAngle(from, to) {
  const diff = ((to - (from % 360) + 540) % 360) - 180;
  return from + diff;
}

// ── OSRM helpers ──────────────────────────────────────────────────────────────
export async function osrmSnapToRoad(lat, lng) {
  try {
    const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.waypoints?.[0]) return null;
    const [sLng, sLat] = data.waypoints[0].location;
    return { lat: sLat, lng: sLng };
  } catch { return null; }
}

export async function osrmRoute(fromLat, fromLng, toLat, toLng, gpsHeading) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;

    const pts = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    if (pts.length < 2) return null;

    if (gpsHeading !== undefined) {
      const routeBearing = calcBearing(pts[0].lat, pts[0].lng, pts[1].lat, pts[1].lng);
      const diff = Math.abs(((routeBearing - gpsHeading + 540) % 360) - 180);
      if (diff > 80) return null;
    }

    const gpsDist   = calcDist(fromLat, fromLng, toLat, toLng);
    const routeDist = (data.routes[0].distance || 0) / 1000;
    if (gpsDist > 0.02 && routeDist > gpsDist * 4) return null;

    return pts;
  } catch { return null; }
}

// ── Route entry management ────────────────────────────────────────────────────
function resetRouteEntry(name, lat, lng, ts) {
  const fresh = {
    positions:     [{ lat, lng, ts }],
    roadPath:      [{ lat, lng }],
    totalDistance: 0,
    heading:       0,
    startTime:     ts,
    lastUpdate:    ts,
    lastState:     'running',
    _snapped:      false,
    _pending:      false,
  };
  routeCache.set(name, fresh);

  osrmSnapToRoad(lat, lng)
    .then(snapped => {
      const r = routeCache.get(name);
      if (!r) return;
      if (snapped) r.roadPath[0] = snapped;
      r._snapped = true;
    })
    .catch(() => {
      const r = routeCache.get(name);
      if (r) r._snapped = true;
    });
}

// Main entry point — called every time a new GPS packet arrives for a vehicle
export function pushRoutePoint(name, lat, lng, ts = Date.now(), state = 'running') {
  const existing = routeCache.get(name);

  if (!existing) {
    resetRouteEntry(name, lat, lng, ts);
    routeCache.get(name).lastState = state;
    return;
  }

  const r         = existing;
  const prevState = r.lastState || 'running';
  const isMoving  = !NON_MOVING_STATES.has(state);
  const wasMoved  = !NON_MOVING_STATES.has(prevState);

  // State transitioned from non-moving → moving: start a fresh trip
  if (isMoving && !wasMoved) {
    resetRouteEntry(name, lat, lng, ts);
    routeCache.get(name).lastState = state;
    return;
  }

  // Long time gap while moving: start a fresh trip
  if (ts - (r.lastUpdate || 0) > PACKET_BREAK_MS && isMoving) {
    resetRouteEntry(name, lat, lng, ts);
    routeCache.get(name).lastState = state;
    return;
  }

  // Non-moving states — update state/time but don't add route points
  if (!isMoving) {
    r.lastState  = state;
    r.lastUpdate = ts;
    return;
  }

  r.lastState = state;

  const last = r.positions[r.positions.length - 1];
  const dist = calcDist(last.lat, last.lng, lat, lng);
  if (dist < 0.01) return; // < 10 m — ignore jitter

  const rawBearing = calcBearing(last.lat, last.lng, lat, lng);
  r.heading = shortestAngle(r.heading, rawBearing);

  r.positions.push({ lat, lng, ts });
  r.totalDistance += dist;
  r.lastUpdate = ts;
  if (r.positions.length > 2000) r.positions = r.positions.slice(-1500);

  // Async road-snap
  if (!r._pending) {
    r._pending = true;
    const fromPt  = r.roadPath[r.roadPath.length - 1] || last;
    const gpsHead = rawBearing;
    osrmRoute(fromPt.lat, fromPt.lng, lat, lng, gpsHead)
      .then(snapped => {
        r._pending = false;
        if (snapped && snapped.length >= 2) r.roadPath.push(...snapped.slice(1));
        else                                r.roadPath.push({ lat, lng });
        if (r.roadPath.length > 8000) r.roadPath = r.roadPath.slice(-6000);
      })
      .catch(() => {
        r._pending = false;
        r.roadPath.push({ lat, lng });
      });
  }
}

export function getRoute(name) {
  return routeCache.get(name) || null;
}