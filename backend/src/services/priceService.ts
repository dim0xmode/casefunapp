import { getPriceFeedContract } from './blockchain.js';

export const getEthUsdPrice = async () => {
  const feed = getPriceFeedContract();
  if (!feed) return null;
  const [roundData, decimals] = await Promise.all([
    feed.latestRoundData(),
    feed.decimals(),
  ]);
  const answer = Number(roundData.answer);
  if (!Number.isFinite(answer) || answer <= 0) return null;
  const price = answer / 10 ** Number(decimals);
  return {
    price,
    updatedAt: Number(roundData.updatedAt) * 1000,
  };
};
