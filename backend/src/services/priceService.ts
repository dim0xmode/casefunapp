import { getPriceFeedContract } from './blockchain.js';

type EthPrice = {
  price: number;
  updatedAt: number;
};

const PRICE_CACHE_TTL_MS = 10_000;
const PRICE_FETCH_TIMEOUT_MS = 2_500;

let cachedPrice: { value: EthPrice; expiresAt: number } | null = null;
let inflightPriceFetch: Promise<EthPrice | null> | null = null;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('price_fetch_timeout')), timeoutMs).unref();
    }),
  ]);
};

export const getEthUsdPrice = async () => {
  const now = Date.now();
  if (cachedPrice && cachedPrice.expiresAt > now) {
    return cachedPrice.value;
  }
  if (inflightPriceFetch) {
    return inflightPriceFetch;
  }

  const feed = getPriceFeedContract();
  if (!feed) return null;

  inflightPriceFetch = (async () => {
    try {
      const [roundData, decimals] = await Promise.all([
        withTimeout(feed.latestRoundData(), PRICE_FETCH_TIMEOUT_MS),
        withTimeout(feed.decimals(), PRICE_FETCH_TIMEOUT_MS),
      ]);
      const answer = Number(roundData.answer);
      if (!Number.isFinite(answer) || answer <= 0) return null;

      const price = answer / 10 ** Number(decimals);
      const nextValue: EthPrice = {
        price,
        updatedAt: Number(roundData.updatedAt) * 1000,
      };
      cachedPrice = {
        value: nextValue,
        expiresAt: Date.now() + PRICE_CACHE_TTL_MS,
      };
      return nextValue;
    } catch {
      return cachedPrice?.value || null;
    } finally {
      inflightPriceFetch = null;
    }
  })();

  return inflightPriceFetch;
};
