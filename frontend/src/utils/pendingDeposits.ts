const STORAGE_KEY = 'casefun:pendingDepositsByWallet';

type PendingMap = Record<string, string[]>;

const normalize = (address?: string | null) => (address || '').trim().toLowerCase();

const readMap = (): PendingMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as PendingMap;
  } catch {
    return {};
  }
};

const writeMap = (value: PendingMap) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

export const getPendingDepositHashes = (walletAddress?: string | null): string[] => {
  const key = normalize(walletAddress);
  if (!key) return [];
  const map = readMap();
  const list = map[key];
  return Array.isArray(list) ? list.filter(Boolean) : [];
};

export const addPendingDepositHash = (walletAddress: string | null | undefined, txHash: string) => {
  const key = normalize(walletAddress);
  const hash = String(txHash || '').trim();
  if (!key || !hash) return;
  const map = readMap();
  const current = Array.isArray(map[key]) ? map[key] : [];
  if (!current.includes(hash)) {
    map[key] = [hash, ...current];
    writeMap(map);
  }
};

export const removePendingDepositHash = (walletAddress: string | null | undefined, txHash: string) => {
  const key = normalize(walletAddress);
  const hash = String(txHash || '').trim();
  if (!key || !hash) return;
  const map = readMap();
  const current = Array.isArray(map[key]) ? map[key] : [];
  map[key] = current.filter((item) => item !== hash);
  writeMap(map);
};
