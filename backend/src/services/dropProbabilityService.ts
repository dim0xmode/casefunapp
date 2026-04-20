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

/**
 * Honest RTU-based drop chances:
 *   1) Target = casePrice * RTU%
 *   2) Split lots into Loss group (value < Target) and Win group (value > Target)
 *      using monetary value (drop tokens × token price USDT).
 *   3) Lot weight = 1 / monetaryValue (cheaper drops are more likely inside group)
 *   4) Group probabilities solved so that E[lot] = Target:
 *        Pwin  = (Target - Aloss) / (Awin - Aloss)
 *        Ploss = 1 - Pwin
 *      where Aloss/Awin are weighted average monetary values of each group.
 *   5) Each lot probability = Pgroup × (Wlot / ΣWgroup), normalized to 1.
 *
 * Returns probabilities in [0..1] with sum ≈ 1, or null if math fails (caller
 * should fall back to a simpler picker so drops never get stuck).
 */
export const computeRtuDropChances = (
  drops: { value: number }[],
  casePriceUsdt: number,
  rtuPercent: number,
  tokenPriceUsdt: number,
): number[] | null => {
  if (!Array.isArray(drops) || drops.length === 0) return null;
  if (!Number.isFinite(casePriceUsdt) || casePriceUsdt <= 0) return null;
  if (!Number.isFinite(rtuPercent) || rtuPercent <= 0 || rtuPercent > 100) return null;
  if (!Number.isFinite(tokenPriceUsdt) || tokenPriceUsdt <= 0) return null;

  const monetary = drops.map((drop) => Number(drop.value || 0) * tokenPriceUsdt);
  if (monetary.some((value) => !Number.isFinite(value) || value <= 0)) return null;

  const target = casePriceUsdt * (rtuPercent / 100);
  const minValue = Math.min(...monetary);
  const maxValue = Math.max(...monetary);
  if (target < minValue - EPS || target > maxValue + EPS) return null;

  if (drops.length === 1) return [1];

  const exact: number[] = [];
  monetary.forEach((value, idx) => {
    if (Math.abs(value - target) <= EPS) exact.push(idx);
  });
  if (exact.length > 0) {
    const probs = monetary.map(() => 0);
    const p = 1 / exact.length;
    exact.forEach((idx) => {
      probs[idx] = p;
    });
    return probs;
  }

  const lossIdx: number[] = [];
  const winIdx: number[] = [];
  monetary.forEach((value, idx) => {
    if (value < target) lossIdx.push(idx);
    else winIdx.push(idx);
  });
  if (lossIdx.length === 0 || winIdx.length === 0) return null;

  const weights = monetary.map((value) => 1 / value);
  const sumLossW = lossIdx.reduce((sum, idx) => sum + weights[idx], 0);
  const sumWinW = winIdx.reduce((sum, idx) => sum + weights[idx], 0);
  if (sumLossW <= 0 || sumWinW <= 0) return null;

  const avgLoss = lossIdx.reduce((sum, idx) => sum + monetary[idx] * weights[idx], 0) / sumLossW;
  const avgWin = winIdx.reduce((sum, idx) => sum + monetary[idx] * weights[idx], 0) / sumWinW;
  const denominator = avgWin - avgLoss;
  if (denominator <= EPS) return null;

  let pWin = (target - avgLoss) / denominator;
  if (!Number.isFinite(pWin)) return null;
  pWin = Math.min(1, Math.max(0, pWin));
  const pLoss = 1 - pWin;

  const probs = monetary.map((_, idx) => {
    if (lossIdx.includes(idx)) return pLoss * (weights[idx] / sumLossW);
    return pWin * (weights[idx] / sumWinW);
  });

  const sum = probs.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) return null;
  return probs.map((value) => value / sum);
};

/**
 * Picks a drop using the honest RTU-based chances. Falls back to a *bounded*
 * inverse-monetary-value weighted random when the formula can't be solved
 * (e.g. legacy cases where target sits outside [Vmin, Vmax] in USDT).
 *
 * Safety cap: the fallback NEVER considers drops whose monetary value exceeds
 * `casePriceUsdt * 2` — otherwise a broken case with a $600 token can still
 * pay out hundreds of dollars per $1 open, as happened on prod with BINANCE.
 */
export const pickDropByRtu = <T extends { value: number }>(
  drops: T[],
  casePriceUsdt: number,
  rtuPercent: number,
  tokenPriceUsdt: number,
): { drop: T; probabilities: number[]; usedFallback: boolean } => {
  if (drops.length === 0) {
    throw new AppError('Cannot pick drop from empty list', 500);
  }
  if (drops.length === 1) {
    return { drop: drops[0], probabilities: [1], usedFallback: false };
  }

  let probabilities = computeRtuDropChances(drops, casePriceUsdt, rtuPercent, tokenPriceUsdt);
  let usedFallback = false;

  if (!probabilities) {
    usedFallback = true;
    const tokenPrice = Number.isFinite(tokenPriceUsdt) && tokenPriceUsdt > 0 ? tokenPriceUsdt : 1;
    const cap = Number.isFinite(casePriceUsdt) && casePriceUsdt > 0 ? casePriceUsdt * 2 : Infinity;

    // Prefer drops that pay out at most 2× case price. If *every* drop exceeds
    // the cap (legacy broken case), fall back to picking the globally cheapest
    // drop deterministically — never sample expensive ones.
    const monetaryValues = drops.map((drop) => Number(drop.value || 0) * tokenPrice);
    const eligibleIdx = monetaryValues
      .map((value, idx) => ({ value, idx }))
      .filter(({ value }) => Number.isFinite(value) && value > 0 && value <= cap)
      .map(({ idx }) => idx);

    if (eligibleIdx.length === 0) {
      const cheapestIdx = monetaryValues.reduce(
        (best, value, idx) => (value > 0 && value < monetaryValues[best] ? idx : best),
        0,
      );
      probabilities = drops.map((_, idx) => (idx === cheapestIdx ? 1 : 0));
    } else {
      const inv = drops.map((_, idx) => {
        if (!eligibleIdx.includes(idx)) return 0;
        const m = monetaryValues[idx];
        return m > 0 ? 1 / m : 0;
      });
      const total = inv.reduce((a, b) => a + b, 0);
      probabilities = total > 0 ? inv.map((value) => value / total) : drops.map(() => 1 / drops.length);
    }
  }

  const random = Math.random();
  let cumulative = 0;
  for (let i = 0; i < drops.length; i += 1) {
    cumulative += probabilities[i];
    if (random <= cumulative) {
      return { drop: drops[i], probabilities, usedFallback };
    }
  }
  return { drop: drops[drops.length - 1], probabilities, usedFallback };
};
