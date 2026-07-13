// Keeps time calculations (case open windows / expiry) resilient to a skewed
// client clock. The browser clock can be minutes off, which would make a fresh
// case look already-expired or show the wrong remaining time. We anchor to the
// server clock by tracking the offset between server time and the local clock.

let offsetMs = 0; // serverNow - clientNow

/**
 * Record the server's current time (ms epoch) to derive the clock offset.
 * Call this whenever the backend hands us an authoritative timestamp.
 */
export const syncServerTime = (serverTimeMs?: number | null) => {
  if (typeof serverTimeMs !== 'number' || !Number.isFinite(serverTimeMs)) return;
  offsetMs = serverTimeMs - Date.now();
};

/** Current time aligned to the server clock. */
export const serverNow = () => Date.now() + offsetMs;
