import React, { useEffect, useMemo, useState } from 'react';
import { BrowserProvider, parseEther } from 'ethers';
import { PrimaryButton } from './ui/PrimaryButton';
import { api } from '../services/api';
import { addPendingDepositHash, getPendingDepositHashes, removePendingDepositHash } from '../utils/pendingDeposits';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBalanceUpdate: (nextBalance: number) => void;
  isAuthenticated: boolean;
  onConnectWallet: () => void;
  initialUsdtAmount?: number | null;
  walletAddress?: string | null;
}

export const TopUpModal: React.FC<TopUpModalProps> = ({
  isOpen,
  onClose,
  onBalanceUpdate,
  isAuthenticated,
  onConnectWallet,
  initialUsdtAmount,
  walletAddress,
}) => {
  const [usdtAmount, setUsdtAmount] = useState('');
  const [ethAmount, setEthAmount] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);

  const chainId = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
  const treasuryAddress = String(import.meta.env.VITE_TREASURY_ADDRESS || '');
  const rpcUrl = String(import.meta.env.VITE_RPC_URL || '');
  const explorerUrl = String(import.meta.env.VITE_EXPLORER_URL || '');

  const parsedUsdt = useMemo(() => Number(usdtAmount.replace(/,/g, '.').trim()), [usdtAmount]);
  const parsedEth = useMemo(() => Number(ethAmount.replace(/,/g, '.').trim()), [ethAmount]);
  const activeWalletAddress = useMemo(() => (walletAddress || '').toLowerCase(), [walletAddress]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setPriceError(null);
    api.getEthPrice()
      .then((response) => {
        if (!active) return;
        if (response.data?.price) {
          setPrice(response.data.price);
        }
      })
      .catch(() => {
        if (!active) return;
        setPriceError('Price feed unavailable');
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (price && Number.isFinite(parsedUsdt) && parsedUsdt > 0) {
      const nextEth = parsedUsdt / price;
      setEthAmount(nextEth.toFixed(6));
    }
  }, [price]);

  useEffect(() => {
    if (!isOpen) return;
    const safeInitial =
      typeof initialUsdtAmount === 'number' && Number.isFinite(initialUsdtAmount)
        ? Math.max(0, initialUsdtAmount)
        : 0;
    if (safeInitial <= 0) return;
    setUsdtAmount(safeInitial.toFixed(2));
    if (price && Number.isFinite(price) && price > 0) {
      setEthAmount((safeInitial / price).toFixed(6));
    } else {
      setEthAmount('');
    }
  }, [isOpen, initialUsdtAmount, price]);

  useEffect(() => {
    if (!isOpen) return;
    const pending = getPendingDepositHashes(activeWalletAddress);
    if (pending.length > 0) {
      setPendingHash(pending[0]);
      setStatusMessage('Pending top up found. Check status to sync balance.');
    }
  }, [isOpen, activeWalletAddress]);

  const hasEthereum = typeof window !== 'undefined' && Boolean(window.ethereum?.request);

  const ensureChain = async () => {
    if (!hasEthereum || !window.ethereum) return false;
    const targetHex = `0x${chainId.toString(16)}`;
    try {
      const current = await window.ethereum.request({ method: 'eth_chainId' });
      if (current === targetHex) return true;
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetHex }],
      });
      return true;
    } catch (error: any) {
      if (error?.code !== 4902) return false;
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: targetHex,
              chainName: 'Sepolia',
              rpcUrls: rpcUrl ? [rpcUrl] : [],
              nativeCurrency: { name: 'SepoliaETH', symbol: 'SEP', decimals: 18 },
              blockExplorerUrls: explorerUrl ? [explorerUrl] : [],
            },
          ],
        });
        return true;
      } catch {
        return false;
      }
    }
  };

  const handleUsdtChange = (value: string) => {
    const next = value.replace(/[^\d.,]/g, '');
    setUsdtAmount(next);
    setStatusMessage(null);
    if (!price) return;
    const numeric = Number(next.replace(/,/g, '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setEthAmount('');
      return;
    }
    setEthAmount((numeric / price).toFixed(6));
  };

  const handleEthChange = (value: string) => {
    const next = value.replace(/[^\d.,]/g, '');
    setEthAmount(next);
    setStatusMessage(null);
    if (!price) return;
    const numeric = Number(next.replace(/,/g, '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setUsdtAmount('');
      return;
    }
    setUsdtAmount((numeric * price).toFixed(2));
  };

  const confirmDeposit = async (txHash: string) => {
    try {
      const response = await api.confirmDeposit(txHash);
      if (response.data?.pending) {
        setPendingHash(txHash);
        setStatusMessage(`Waiting confirmations (${response.data.confirmations || 0})`);
        return;
      }
      if (typeof response.data?.balance === 'number') {
        onBalanceUpdate(response.data.balance);
        setPendingHash(null);
        setStatusMessage('Top up confirmed');
        setUsdtAmount('');
        setEthAmount('');
        removePendingDepositHash(activeWalletAddress, txHash);
      }
    } catch (error: any) {
      setStatusMessage(error?.message || 'Confirmation failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onConnectWallet();
      return;
    }
    if (!hasEthereum) {
      setStatusMessage('MetaMask not found');
      return;
    }
    if (!treasuryAddress) {
      setStatusMessage('Treasury address is missing');
      return;
    }
    if (!Number.isFinite(parsedEth) || parsedEth <= 0) return;
    const rawEth = ethAmount.replace(/,/g, '.').trim();
    if (!rawEth) return;

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const ok = await ensureChain();
      if (!ok) {
        setStatusMessage('Switch to Sepolia to continue');
        return;
      }
      const provider = new BrowserProvider(window.ethereum as any);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: treasuryAddress,
        value: parseEther(rawEth),
      });
      setPendingHash(tx.hash);
      addPendingDepositHash(activeWalletAddress, tx.hash);
      setStatusMessage('Transaction sent. Waiting for confirmation...');
      await confirmDeposit(tx.hash);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Top up failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const canSubmit = isAuthenticated && Number.isFinite(parsedEth) && parsedEth > 0 && !isSubmitting;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 animate-fade-in" onMouseDown={onClose}>
      <div
        className="bg-web3-card/95 border border-white/[0.12] rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] px-8 py-6 max-w-md w-[92%] animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Top up balance</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isAuthenticated && (
            <div className="text-[11px] uppercase tracking-widest text-gray-500">
              Connect wallet to top up
            </div>
          )}
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-white/[0.12] bg-black/30 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                  <svg width="18" height="28" viewBox="0 0 24 36" fill="none">
                    <path d="M12 0L11 4.2V23.4L12 24.3L24 18L12 0Z" fill="#66FCF1" />
                    <path d="M12 0L0 18L12 24.3V14.5V0Z" fill="#A5F3FC" />
                    <path d="M12 26.7L11.4 27.4V36L12 36L24 20.4L12 26.7Z" fill="#66FCF1" />
                    <path d="M12 36V26.7L0 20.4L12 36Z" fill="#A5F3FC" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">You pay</div>
                  <div className="text-sm font-bold text-white">ETH (Sepolia)</div>
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={ethAmount}
                onChange={(e) => handleEthChange(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-white font-mono text-lg"
              />
            </div>

            <div className="rounded-2xl border border-white/[0.12] bg-black/30 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-web3-accent/40 to-web3-success/40 border border-white/20 flex items-center justify-center text-sm font-black text-white">
                  ₮
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">You get</div>
                  <div className="text-sm font-bold text-white">Balance (₮)</div>
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={usdtAmount}
                onChange={(e) => handleUsdtChange(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-white font-mono text-lg"
              />
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500">
            {price ? `1 ETH ≈ ${price.toFixed(2)} ₮` : priceError || 'Loading price...'}
          </div>
          {statusMessage && (
            <div className="text-[11px] uppercase tracking-widest text-gray-400">{statusMessage}</div>
          )}
          <div className="flex gap-3">
            <PrimaryButton variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </PrimaryButton>
            {pendingHash ? (
              <PrimaryButton
                type="button"
                onClick={() => confirmDeposit(pendingHash)}
                className="flex-1"
                variant="secondary"
                disabled={isSubmitting}
              >
                Check status
              </PrimaryButton>
            ) : (
              <PrimaryButton
                type="submit"
                disabled={!canSubmit}
                variant="primary"
                className="flex-1"
              >
                {isAuthenticated ? (isSubmitting ? 'Processing...' : 'Top up') : 'Connect'}
              </PrimaryButton>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
