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

export const formatShortfallUp = (value: number): string => {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const roundedUp = Math.ceil(safeValue * 100) / 100;
  return roundedUp.toFixed(2);
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
