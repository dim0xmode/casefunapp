import { AppError } from '../middleware/errorHandler.js';

type DropInput = {
  name: string;
  value: number;
  currency: string;
  rarity: string;
  color: string;
  image?: string | null;
};

type DropWithProbability = DropInput & {
  probability: number;
};

const EPS = 1e-9;

const roundProbabilityPercent = (value: number) => Math.round(value * 1000000) / 10000;

export const calculateDropProbabilities = (
  drops: DropInput[],
  casePriceUsdt: number,
  rtuPercent: number,
  tokenPriceUsdt: number
): DropWithProbability[] => {
  if (!Array.isArray(drops) || drops.length === 0) {
    throw new AppError('At least one drop is required', 400);
  }
  if (!Number.isFinite(casePriceUsdt) || casePriceUsdt <= 0) {
    throw new AppError('Invalid case price', 400);
  }
  if (!Number.isFinite(rtuPercent) || rtuPercent <= 0 || rtuPercent > 100) {
    throw new AppError('Invalid RTU percent', 400);
  }
  if (!Number.isFinite(tokenPriceUsdt) || tokenPriceUsdt <= 0) {
    throw new AppError('Invalid token price', 400);
  }

  const values = drops.map((drop) => Number(drop.value || 0));
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new AppError('Drop values must be positive', 400);
  }

  const unique = new Set(values);
  if (unique.size !== values.length) {
    throw new AppError('Drop values must be unique', 400);
  }

  const targetUsdt = casePriceUsdt * (rtuPercent / 100);
  const monetaryValues = values.map((value) => value * tokenPriceUsdt);
  const minValue = Math.min(...monetaryValues);
  const maxValue = Math.max(...monetaryValues);

  if (targetUsdt < minValue - EPS || targetUsdt > maxValue + EPS) {
    throw new AppError(
      `RTU cannot be reached with selected drops. Target ${targetUsdt.toFixed(4)} is outside allowed range ${minValue.toFixed(4)} - ${maxValue.toFixed(4)}.`,
      400
    );
  }

  const withMeta = drops.map((drop, idx) => {
    const monetary = monetaryValues[idx];
    return {
      ...drop,
      value: values[idx],
      monetary,
      weight: 1 / monetary,
      idx,
    };
  });

  const exact = withMeta.filter((entry) => Math.abs(entry.monetary - targetUsdt) <= EPS);
  if (exact.length > 0) {
    const p = 100 / exact.length;
    return withMeta.map((entry) => ({
      name: entry.name,
      value: entry.value,
      currency: entry.currency,
      rarity: entry.rarity,
      color: entry.color,
      image: entry.image || null,
      probability: exact.some((item) => item.idx === entry.idx) ? roundProbabilityPercent(p) : 0,
    }));
  }

  const loss = withMeta.filter((entry) => entry.monetary < targetUsdt);
  const win = withMeta.filter((entry) => entry.monetary > targetUsdt);

  if (loss.length === 0 || win.length === 0) {
    throw new AppError(
      'RTU cannot be reached with selected drops. Add values both below and above the target or adjust RTU.',
      400
    );
  }

  const sumWeights = (group: typeof withMeta) => group.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedAverage = (group: typeof withMeta) => {
    const weightSum = sumWeights(group);
    const weighted = group.reduce((sum, entry) => sum + entry.monetary * entry.weight, 0);
    return weighted / weightSum;
  };

  const avgLoss = weightedAverage(loss);
  const avgWin = weightedAverage(win);
  const denominator = avgWin - avgLoss;
  if (denominator <= EPS) {
    throw new AppError('Cannot calculate probabilities for selected drops', 400);
  }

  let pWin = (targetUsdt - avgLoss) / denominator;
  let pLoss = 1 - pWin;

  if (!Number.isFinite(pWin) || !Number.isFinite(pLoss)) {
    throw new AppError('Cannot calculate probabilities for selected drops', 400);
  }
  if (pWin < -EPS || pLoss < -EPS) {
    throw new AppError('RTU cannot be reached with selected drops. Try different drops or RTU.', 400);
  }

  pWin = Math.min(1, Math.max(0, pWin));
  pLoss = Math.min(1, Math.max(0, pLoss));

  const sumLossWeights = sumWeights(loss);
  const sumWinWeights = sumWeights(win);

  const probabilities = withMeta.map((entry) => {
    if (entry.monetary < targetUsdt) {
      return pLoss * (entry.weight / sumLossWeights);
    }
    return pWin * (entry.weight / sumWinWeights);
  });

  const sumP = probabilities.reduce((sum, value) => sum + value, 0);
  const normalized = probabilities.map((value) => value / (sumP || 1));

  const expectedUsdt = normalized.reduce(
    (sum, p, idx) => sum + monetaryValues[idx] * p,
    0
  );
  if (Math.abs(expectedUsdt - targetUsdt) > 1e-4) {
    throw new AppError('Probability solver failed to match target RTU', 400);
  }

  return withMeta.map((entry, idx) => ({
    name: entry.name,
    value: entry.value,
    currency: entry.currency,
    rarity: entry.rarity,
    color: entry.color,
    image: entry.image || null,
    probability: roundProbabilityPercent(normalized[idx] * 100),
  }));
};
