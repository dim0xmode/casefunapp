export const formatShortfallUp = (value: number): string => {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const roundedUp = Math.ceil(safeValue * 100) / 100;
  return roundedUp.toFixed(2);
};

/**
 * Format a token value preserving all significant digits and stripping
 * trailing zeros.  0.0050 → "0.005", 0.000000000005 → "0.000000000005"
 */
export const formatTokenValue = (value: number | string): string => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0';

  if (Math.abs(num) < 1e-7) {
    const str = num.toFixed(20);
    return str.replace(/0+$/, '').replace(/\.$/, '');
  }

  const str = String(num);
  if (str.includes('.')) {
    return str.replace(/0+$/, '').replace(/\.$/, '');
  }
  return str;
};
