export const RARITY_COLORS = {
  COMMON: '#9CA3AF',
  UNCOMMON: '#10B981',
  RARE: '#8B5CF6',
  LEGENDARY: '#F59E0B',
  MYTHIC: '#EF4444',
};

export const getRarityByValue = (value: number) => {
  if (value < 5) return 'COMMON';
  if (value < 20) return 'UNCOMMON';
  if (value < 50) return 'RARE';
  if (value < 100) return 'LEGENDARY';
  return 'MYTHIC';
};
