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
