import { getPriceFeedContract } from './blockchain.js';

type NativePrice = {
  price: number;
  updatedAt: number;
};

const PRICE_CACHE_TTL_MS = 10_000;
const PRICE_FETCH_TIMEOUT_MS = 2_500;

let cachedPrice: { value: NativePrice; expiresAt: number } | null = null;
let inflightPriceFetch: Promise<NativePrice | null> | null = null;
let cachedTonPrice: { value: NativePrice; expiresAt: number } | null = null;
let inflightTonPriceFetch: Promise<NativePrice | null> | null = null;

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
      const nextValue: NativePrice = {
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

const TON_PRICE_FALLBACK = 5; // ~$5 per TON on testnet — used if CoinGecko unavailable.

/**
 * Fetch TON/USD price from CoinGecko (no API key required).
 * Cached for 10s. Falls back to a sane default if the network is unavailable
 * so deposits keep working on testnet.
 */
export const getTonUsdPrice = async (): Promise<NativePrice | null> => {
  const now = Date.now();
  if (cachedTonPrice && cachedTonPrice.expiresAt > now) {
    return cachedTonPrice.value;
  }
  if (inflightTonPriceFetch) {
    return inflightTonPriceFetch;
  }

  inflightTonPriceFetch = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PRICE_FETCH_TIMEOUT_MS);
      try {
        const resp = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
          { signal: controller.signal }
        );
        if (!resp.ok) throw new Error(`coingecko_${resp.status}`);
        const data: any = await resp.json();
        const price = Number(data?.['the-open-network']?.usd);
        if (!Number.isFinite(price) || price <= 0) throw new Error('invalid_price');

        const next: NativePrice = { price, updatedAt: Date.now() };
        cachedTonPrice = { value: next, expiresAt: Date.now() + PRICE_CACHE_TTL_MS };
        return next;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      if (cachedTonPrice?.value) return cachedTonPrice.value;
      // Fallback so testnet top-ups don't break when CoinGecko is rate-limited.
      const fallback: NativePrice = { price: TON_PRICE_FALLBACK, updatedAt: Date.now() };
      cachedTonPrice = { value: fallback, expiresAt: Date.now() + PRICE_CACHE_TTL_MS };
      return fallback;
    } finally {
      inflightTonPriceFetch = null;
    }
  })();

  return inflightTonPriceFetch;
};
