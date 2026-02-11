export const RTU_UPGRADE_RESERVE_PERCENT = 10;
export const RTU_DYNAMIC_OPEN_BUFFER_PERCENT = 20;
export const RTU_MIN_OPEN_TARGET_PERCENT = 1;

export const getDynamicOpenRtuPercent = (declaredRtuPercent: number) => {
  return Math.max(RTU_MIN_OPEN_TARGET_PERCENT, declaredRtuPercent - RTU_DYNAMIC_OPEN_BUFFER_PERCENT);
};

export const getTargetTokenByRtu = (
  casePriceUsdt: number,
  rtuPercent: number,
  tokenPriceUsdt: number
) => {
  if (!Number.isFinite(casePriceUsdt) || casePriceUsdt <= 0) return 0;
  if (!Number.isFinite(rtuPercent) || rtuPercent <= 0) return 0;
  if (!Number.isFinite(tokenPriceUsdt) || tokenPriceUsdt <= 0) return 0;
  return (casePriceUsdt * (rtuPercent / 100)) / tokenPriceUsdt;
};
