const LEVEL_THRESHOLDS = [50, 75, 100, 150, 200, 300, 400, 500, 750, 1000];
const CUMULATIVE: number[] = [];
LEVEL_THRESHOLDS.reduce((sum, v) => { const c = sum + v; CUMULATIVE.push(c); return c; }, 0);

export const getLevelInfo = (cfp: number) => {
  let level = 0;
  for (let i = 0; i < CUMULATIVE.length; i++) {
    if (cfp >= CUMULATIVE[i]) level = i + 1;
    else break;
  }
  const isMaxLevel = level >= CUMULATIVE.length;
  const currentFloor = level > 0 ? CUMULATIVE[level - 1] : 0;
  const nextCeil = isMaxLevel ? CUMULATIVE[CUMULATIVE.length - 1] : CUMULATIVE[level];
  const xpInLevel = cfp - currentFloor;
  const xpNeeded = nextCeil - currentFloor;
  const progress = isMaxLevel ? 100 : Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
  return { level, progress, xpInLevel, xpNeeded, isMaxLevel, totalCfp: cfp, nextLevelCfp: nextCeil };
};

export const formatCfp = (value: number): string => {
  const n = Math.round(value * 10) / 10;
  return n % 1 === 0 ? String(n) : n.toFixed(1);
};

export const formatShortfallUp = (value: number): string => {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const roundedUp = Math.ceil(safeValue * 100) / 100;
  return roundedUp.toFixed(2);
};

/**
 * Sanitize a numeric text input:
 *  - converts comma to dot
 *  - strips non-digit/dot chars
 *  - keeps only the first dot
 *  - auto-prefixes a dot when typing "012" -> "0.12" (digit after leading zero)
 *  - clamps to N decimal places (default 5)
 */
export const sanitizeDecimalInput = (raw: string, maxDecimals = 5): string => {
  let s = String(raw ?? '').replace(/,/g, '.').replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  if (s.length > 1 && s[0] === '0' && s[1] !== '.') {
    s = '0.' + s.slice(1);
  }
  const dot = s.indexOf('.');
  if (dot !== -1 && s.length - dot - 1 > maxDecimals) {
    s = s.slice(0, dot + 1 + maxDecimals);
  }
  return s;
};

/**
 * Round a number to at most N decimal places, stripping trailing zeros.
 * Returns a clean string for display.
 */
export const formatDecimal = (value: number, maxDecimals = 5): string => {
  if (!Number.isFinite(value)) return '0';
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round(value * factor) / factor;
  if (rounded === 0) return '0';
  return rounded.toFixed(maxDecimals).replace(/0+$/, '').replace(/\.$/, '');
};

/**
 * Format a token value preserving all significant digits, stripping
 * trailing zeros AND floating-point noise (e.g. 0.060000000000005 → "0.06").
 */
export const formatTokenValue = (value: number | string): string => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0';

  const cleaned = parseFloat(num.toPrecision(12));

  if (Math.abs(cleaned) < 1e-7) {
    const str = cleaned.toFixed(20);
    return str.replace(/0+$/, '').replace(/\.$/, '');
  }

  const str = String(cleaned);
  if (str.includes('.')) {
    return str.replace(/0+$/, '').replace(/\.$/, '');
  }
  return str;
};
