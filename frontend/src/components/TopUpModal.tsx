import React, { useEffect, useMemo, useState } from 'react';
import { BrowserProvider, parseEther } from 'ethers';
import { PrimaryButton } from './ui/PrimaryButton';
import { api } from '../services/api';
import { addPendingDepositHash, getPendingDepositHashes, removePendingDepositHash } from '../utils/pendingDeposits';
import { sanitizeDecimalInput } from '../utils/number';

type ChainTab = 'EVM' | 'TON';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBalanceUpdate: (nextBalance: number) => void;
  onTopUpConfirmed?: () => void | Promise<void>;
  isAuthenticated: boolean;
  onConnectWallet: () => void;
  initialUsdtAmount?: number | null;
  walletAddress?: string | null;
  externalProvider?: any;
  tonAddress?: string | null;
  onLinkTonWallet?: () => void;
}

export const TopUpModal: React.FC<TopUpModalProps> = ({
  isOpen,
  onClose,
  onBalanceUpdate,
  onTopUpConfirmed,
  isAuthenticated,
  onConnectWallet,
  initialUsdtAmount,
  walletAddress,
  externalProvider,
  tonAddress,
  onLinkTonWallet,
}) => {
  const [chain, setChain] = useState<ChainTab>('EVM');

  // EVM state
  const [usdtAmount, setUsdtAmount] = useState('');
  const [ethAmount, setEthAmount] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);

  // TON state
  const [tonUsdtAmount, setTonUsdtAmount] = useState('');
  const [tonNativeAmount, setTonNativeAmount] = useState('');
  const [tonPrice, setTonPrice] = useState<number | null>(null);
  const [tonPriceError, setTonPriceError] = useState<string | null>(null);
  const [tonTreasury, setTonTreasury] = useState<string | null>(null);
  const [tonTreasuryNetwork, setTonTreasuryNetwork] = useState<'testnet' | 'mainnet'>('testnet');
  const [tonTreasuryError, setTonTreasuryError] = useState<string | null>(null);
  const [isTonSubmitting, setIsTonSubmitting] = useState(false);
  const [tonStatus, setTonStatus] = useState<string | null>(null);
  const [tonPending, setTonPending] = useState<{ sentAtUnix: number; expectedTon: number } | null>(null);
  const [tonNetworkMismatch, setTonNetworkMismatch] = useState(false);

  const chainId = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
  const treasuryAddress = String(import.meta.env.VITE_TREASURY_ADDRESS || '');
  const rpcUrl = String(import.meta.env.VITE_RPC_URL || '');
  const explorerUrl = String(import.meta.env.VITE_EXPLORER_URL || '');
  const sepoliaFaucetUrl = 'https://sepolia-faucet.pk910.de/';
  const tonFaucetUrl = 'https://t.me/testgiver_ton_bot';

  const parsedUsdt = useMemo(() => Number(usdtAmount.replace(/,/g, '.').trim()), [usdtAmount]);
  const parsedEth = useMemo(() => Number(ethAmount.replace(/,/g, '.').trim()), [ethAmount]);
  const parsedTonUsdt = useMemo(() => Number(tonUsdtAmount.replace(/,/g, '.').trim()), [tonUsdtAmount]);
  const parsedTon = useMemo(() => Number(tonNativeAmount.replace(/,/g, '.').trim()), [tonNativeAmount]);
  const activeWalletAddress = useMemo(() => (walletAddress || '').toLowerCase(), [walletAddress]);

  // Load EVM price.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setPriceError(null);
    api.getEthPrice()
      .then((response) => {
        if (!active) return;
        if (response.data?.price) setPrice(response.data.price);
      })
      .catch(() => {
        if (!active) return;
        setPriceError('Price feed unavailable');
      });
    return () => { active = false; };
  }, [isOpen]);

  // Load TON price + treasury address.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setTonPriceError(null);
    setTonTreasuryError(null);
    api.getTonPrice()
      .then((r) => { if (active && r.data?.price) setTonPrice(r.data.price); })
      .catch(() => { if (active) setTonPriceError('TON price unavailable'); });
    api.getTonTreasuryAddress()
      .then((r) => {
        if (!active) return;
        if (r.data?.address) setTonTreasury(r.data.address);
        if (r.data?.network === 'mainnet' || r.data?.network === 'testnet') {
          setTonTreasuryNetwork(r.data.network);
        }
      })
      .catch(() => { if (active) setTonTreasuryError('TON treasury unavailable'); });
    return () => { active = false; };
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
    if (tonPrice && Number.isFinite(parsedTonUsdt) && parsedTonUsdt > 0) {
      setTonNativeAmount((parsedTonUsdt / tonPrice).toFixed(4));
    }
  }, [tonPrice]);

  useEffect(() => {
    if (!isOpen) return;
    const safeInitial =
      typeof initialUsdtAmount === 'number' && Number.isFinite(initialUsdtAmount)
        ? Math.max(0, initialUsdtAmount)
        : 0;
    if (safeInitial <= 0) return;
    setUsdtAmount(safeInitial.toFixed(2));
    setTonUsdtAmount(safeInitial.toFixed(2));
    if (price && price > 0) setEthAmount((safeInitial / price).toFixed(6));
    if (tonPrice && tonPrice > 0) setTonNativeAmount((safeInitial / tonPrice).toFixed(4));
  }, [isOpen, initialUsdtAmount, price, tonPrice]);

  useEffect(() => {
    if (!isOpen) return;
    const pending = getPendingDepositHashes(activeWalletAddress);
    if (pending.length > 0) {
      setPendingHash(pending[0]);
      setStatusMessage('Pending top up found. Check status to sync balance.');
    }
  }, [isOpen, activeWalletAddress]);

  const hasEthereum = typeof window !== 'undefined' && Boolean(window.ethereum?.request);
  const hasProvider = hasEthereum || Boolean(externalProvider);

  const resolveProvider = (): any => {
    if (hasEthereum && window.ethereum) return window.ethereum;
    if (externalProvider) return externalProvider;
    return null;
  };

  const ensureChain = async () => {
    const provider = resolveProvider();
    if (!provider) return false;
    const targetHex = `0x${chainId.toString(16)}`;
    try {
      const current = await provider.request({ method: 'eth_chainId' });
      if (current === targetHex || Number(current) === chainId) return true;
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetHex }],
      });
      return true;
    } catch (error: any) {
      if (error?.code !== 4902) return false;
      try {
        await provider.request({
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
    const next = sanitizeDecimalInput(value, 6);
    setUsdtAmount(next);
    setStatusMessage(null);
    if (!price) return;
    const numeric = Number(next);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setEthAmount('');
      return;
    }
    setEthAmount((numeric / price).toFixed(6));
  };

  const handleEthChange = (value: string) => {
    const next = sanitizeDecimalInput(value, 6);
    setEthAmount(next);
    setStatusMessage(null);
    if (!price) return;
    const numeric = Number(next);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setUsdtAmount('');
      return;
    }
    setUsdtAmount((numeric * price).toFixed(2));
  };

  const handleTonUsdtChange = (value: string) => {
    const next = sanitizeDecimalInput(value, 6);
    setTonUsdtAmount(next);
    setTonStatus(null);
    if (!tonPrice) return;
    const numeric = Number(next);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setTonNativeAmount('');
      return;
    }
    setTonNativeAmount((numeric / tonPrice).toFixed(4));
  };

  const handleTonNativeChange = (value: string) => {
    const next = sanitizeDecimalInput(value, 6);
    setTonNativeAmount(next);
    setTonStatus(null);
    if (!tonPrice) return;
    const numeric = Number(next);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setTonUsdtAmount('');
      return;
    }
    setTonUsdtAmount((numeric * tonPrice).toFixed(2));
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
        if (onTopUpConfirmed) {
          void Promise.resolve(onTopUpConfirmed()).catch(() => {});
        }
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
    const rawEth = ethAmount.replace(/,/g, '.').trim();
    if (!rawEth) return;
    const activeProvider = resolveProvider();
    if (!activeProvider) {
      const inTelegramMiniApp = Boolean((window as any)?.Telegram?.WebApp);
      setStatusMessage(
        inTelegramMiniApp
          ? 'Connect wallet in Mini App first, then retry top up.'
          : 'MetaMask not found'
      );
      return;
    }
    if (!treasuryAddress) {
      setStatusMessage('Treasury address is missing');
      return;
    }
    if (!Number.isFinite(parsedEth) || parsedEth <= 0) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const ok = await ensureChain();
      if (!ok) {
        setStatusMessage('Switch to Sepolia to continue');
        return;
      }
      const ethProvider = new BrowserProvider(activeProvider);
      await ethProvider.send('eth_requestAccounts', []);
      const signer = await ethProvider.getSigner();
      const signerAddress = String(await signer.getAddress()).toLowerCase();
      if (
        activeWalletAddress &&
        activeWalletAddress.startsWith('0x') &&
        signerAddress &&
        signerAddress !== activeWalletAddress
      ) {
        setStatusMessage('Connected wallet does not match linked wallet. Switch wallet and retry.');
        return;
      }
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

  // ──────────────────────────── TON submit ────────────────────────────
  const pollTonDeposit = async (sentAtUnix: number, expectedTon: number) => {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const r = await api.confirmTonDeposit(sentAtUnix, expectedTon);
        if (r.data?.pending) {
          setTonStatus(`Waiting on TON network… (${i + 1})`);
        } else if (typeof r.data?.balance === 'number') {
          onBalanceUpdate(r.data.balance);
          setTonStatus('Top up confirmed');
          setTonUsdtAmount('');
          setTonNativeAmount('');
          setTonPending(null);
          if (onTopUpConfirmed) void Promise.resolve(onTopUpConfirmed()).catch(() => {});
          return true;
        }
      } catch (err: any) {
        setTonStatus(err?.message || 'Confirmation error — retrying');
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    setTonStatus('Still pending. Press "Check status" to sync later.');
    return false;
  };

  const handleTonCheckStatus = async () => {
    if (!tonPending) return;
    setTonStatus('Checking on chain…');
    try {
      const r = await api.confirmTonDeposit(tonPending.sentAtUnix, tonPending.expectedTon);
      if (r.data?.pending) {
        setTonStatus('Still pending — try again in a moment.');
      } else if (typeof r.data?.balance === 'number') {
        onBalanceUpdate(r.data.balance);
        setTonStatus('Top up confirmed');
        setTonUsdtAmount('');
        setTonNativeAmount('');
        setTonPending(null);
        if (onTopUpConfirmed) void Promise.resolve(onTopUpConfirmed()).catch(() => {});
      }
    } catch (err: any) {
      // Fall back to broader scan if confirm endpoint failed.
      try {
        const scan = await api.scanTonDeposit();
        if (scan.data?.found && typeof scan.data?.balance === 'number') {
          onBalanceUpdate(scan.data.balance);
          setTonStatus('Top up confirmed');
          setTonUsdtAmount('');
          setTonNativeAmount('');
          setTonPending(null);
          if (onTopUpConfirmed) void Promise.resolve(onTopUpConfirmed()).catch(() => {});
        } else {
          setTonStatus('No new deposit found yet.');
        }
      } catch (scanErr: any) {
        setTonStatus(err?.message || scanErr?.message || 'Status check failed');
      }
    }
  };

  const handleTonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onConnectWallet();
      return;
    }
    if (!tonAddress) {
      setTonStatus('Link your TON wallet first');
      onLinkTonWallet?.();
      return;
    }
    if (!tonTreasury) {
      setTonStatus(tonTreasuryError || 'TON treasury unavailable');
      return;
    }
    if (!Number.isFinite(parsedTon) || parsedTon <= 0) return;

    setIsTonSubmitting(true);
    setTonStatus(null);
    setTonNetworkMismatch(false);
    try {
      const { sendTonTransfer, TonNetworkMismatchError } = await import('../utils/tonConnect');
      const sentAtUnix = Math.floor(Date.now() / 1000);
      const nano = BigInt(Math.floor(parsedTon * 1e9));
      setTonStatus('Opening TON wallet…');
      try {
        await sendTonTransfer(tonTreasury, nano, 'casefun-topup', tonTreasuryNetwork);
      } catch (err: any) {
        if (err instanceof TonNetworkMismatchError) {
          setTonNetworkMismatch(true);
          setTonStatus(err.message);
          return;
        }
        throw err;
      }
      setTonPending({ sentAtUnix, expectedTon: parsedTon });
      setTonStatus('Transaction signed. Confirming on chain…');
      await pollTonDeposit(sentAtUnix, parsedTon);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/wrong network/i.test(msg)) {
        setTonNetworkMismatch(true);
        setTonStatus(`Your TON wallet is on the wrong network. Switch to ${tonTreasuryNetwork === 'testnet' ? 'Testnet' : 'Mainnet'} account in your wallet and reconnect.`);
      } else if (/reject|cancel|dismiss/i.test(msg)) {
        setTonStatus('Cancelled in wallet');
      } else {
        setTonStatus(msg || 'TON top up failed');
      }
    } finally {
      setIsTonSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const canSubmitEvm = isAuthenticated && hasProvider && Number.isFinite(parsedEth) && parsedEth > 0 && !isSubmitting;
  const canSubmitTon = isAuthenticated && Boolean(tonAddress) && Boolean(tonTreasury) && Number.isFinite(parsedTon) && parsedTon > 0 && !isTonSubmitting;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 animate-fade-in overflow-y-auto py-4" onMouseDown={onClose}>
      <div
        className="bg-web3-card/95 border border-white/[0.12] rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] px-8 py-6 max-w-md w-[92%] animate-scale-in my-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Top up balance</div>

        <div className="flex gap-1 mb-4 bg-black/30 rounded-xl p-1">
          {(['EVM', 'TON'] as ChainTab[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChain(c)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                chain === c ? 'bg-web3-accent text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {c === 'EVM' ? 'EVM (ETH)' : 'TON'}
            </button>
          ))}
        </div>

        {chain === 'EVM' && (
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
                    <div className="text-[10px] text-gray-400 mt-1">
                      Need test ETH? Use{' '}
                      <a href={sepoliaFaucetUrl} target="_blank" rel="noreferrer" className="text-web3-accent hover:text-white transition underline decoration-dotted">
                        faucet
                      </a>.
                    </div>
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
              <PrimaryButton variant="ghost" onClick={onClose} className="flex-1">Cancel</PrimaryButton>
              {pendingHash ? (
                <PrimaryButton type="button" onClick={() => confirmDeposit(pendingHash)} className="flex-1" variant="secondary" disabled={isSubmitting}>
                  Check status
                </PrimaryButton>
              ) : (
                <PrimaryButton type="submit" disabled={!canSubmitEvm} variant="primary" className="flex-1">
                  {isAuthenticated ? (isSubmitting ? 'Processing...' : 'Top up') : 'Connect'}
                </PrimaryButton>
              )}
            </div>
          </form>
        )}

        {chain === 'TON' && (
          <form onSubmit={handleTonSubmit} className="space-y-4">
            {!isAuthenticated && (
              <div className="text-[11px] uppercase tracking-widest text-gray-500">
                Connect wallet to top up
              </div>
            )}
            {isAuthenticated && !tonAddress && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
                Link your TON wallet first to deposit.
                {onLinkTonWallet && (
                  <button type="button" onClick={onLinkTonWallet} className="ml-2 underline text-amber-100">Link now</button>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-white/[0.12] bg-black/30 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[#0098EA]/20 border border-[#0098EA]/40 flex items-center justify-center text-lg font-black text-[#0098EA]">
                    T
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">You pay</div>
                    <div className="text-sm font-bold text-white">TON ({tonTreasuryNetwork === 'testnet' ? 'Testnet' : 'Mainnet'})</div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      Need test TON? Use{' '}
                      <a href={tonFaucetUrl} target="_blank" rel="noreferrer" className="text-web3-accent hover:text-white transition underline decoration-dotted">
                        faucet
                      </a>.
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tonNativeAmount}
                  onChange={(e) => handleTonNativeChange(e.target.value)}
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
                  value={tonUsdtAmount}
                  onChange={(e) => handleTonUsdtChange(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-white font-mono text-lg"
                />
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              {tonPrice ? `1 TON ≈ ${tonPrice.toFixed(2)} ₮` : tonPriceError || 'Loading TON price...'}
            </div>
            {tonNetworkMismatch && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200 leading-relaxed">
                Your TON wallet is on the wrong network. We need <b>{tonTreasuryNetwork === 'testnet' ? 'Testnet' : 'Mainnet'}</b>.
                <br />
                In Tonkeeper: <b>Settings → enable “Show Testnet account”</b>, switch to that account, then press Reconnect below.
              </div>
            )}
            {tonStatus && (
              <div className="text-[11px] uppercase tracking-widest text-gray-400">{tonStatus}</div>
            )}
            <div className="flex gap-3">
              <PrimaryButton variant="ghost" onClick={onClose} className="flex-1">Cancel</PrimaryButton>
              {tonNetworkMismatch ? (
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={isTonSubmitting}
                  onClick={async () => {
                    try {
                      const { disconnectTon } = await import('../utils/tonConnect');
                      await disconnectTon();
                    } catch {
                      // ignore
                    }
                    setTonNetworkMismatch(false);
                    setTonStatus('Disconnected. Tap "Top up" again to reconnect.');
                    onLinkTonWallet?.();
                  }}
                >
                  Reconnect TON
                </PrimaryButton>
              ) : tonPending ? (
                <PrimaryButton type="button" onClick={handleTonCheckStatus} variant="secondary" className="flex-1" disabled={isTonSubmitting}>
                  Check status
                </PrimaryButton>
              ) : (
                <PrimaryButton type="submit" disabled={!canSubmitTon} variant="primary" className="flex-1">
                  {isAuthenticated ? (isTonSubmitting ? 'Processing...' : 'Top up') : 'Connect'}
                </PrimaryButton>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
