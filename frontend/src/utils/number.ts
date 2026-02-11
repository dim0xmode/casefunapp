export const formatShortfallUp = (value: number): string => {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const roundedUp = Math.ceil(safeValue * 100) / 100;
  return roundedUp.toFixed(2);
};
