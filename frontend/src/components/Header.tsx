import React, { useEffect, useRef, useState } from 'react';
import { Home, Briefcase, Zap, Swords, Wallet, User as UserIcon, PlusSquare, Shield, Volume2, VolumeX } from 'lucide-react';
import { User } from '../types';
import { ImageWithMeta } from './ui/ImageWithMeta';
import { getAudioSettings, setAudioMuted, setAudioVolume, subscribeAudioSettings } from '../utils/audio';

interface HeaderProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenWalletConnect: () => void;
  balance: number;
  onOpenTopUp: (prefillUsdt?: number) => void;
  onLogout: () => void;
  onDisconnectWallet: () => void;
  walletAddress?: string | null;
  isConnected?: boolean;
  formatAddress?: (address: string | null) => string;
  isAuthLoading?: boolean;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab,
  setActiveTab,
  onOpenWalletConnect,
  balance,
  onOpenTopUp,
  onLogout,
  onDisconnectWallet,
  walletAddress = null,
  isConnected = false,
  formatAddress = (value) => value || '',
  isAuthLoading = false,
  isAuthenticated = false,
  isAdmin = false,
}) => {
  const [soundOpen, setSoundOpen] = useState(false);
  const [audio, setAudio] = useState(getAudioSettings());
  const soundRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return subscribeAudioSettings(setAudio);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!soundRef.current) return;
      if (!soundRef.current.contains(event.target as Node)) {
        setSoundOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const volumePercent = Math.round((audio.volume || 0) * 100);

  return (
    <header className="h-20 border-b border-white/[0.08] fixed top-0 left-0 right-0 z-50 flex items-center px-6 justify-between flex-shrink-0" style={{
      backgroundColor: 'rgba(11, 12, 16, 0.5)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(110%)',
      backdropFilter: 'blur(24px) saturate(180%) brightness(110%)'
    }}>
      
      <div className="flex items-center gap-10 relative z-10">
        {/* Logo with soft effects */}
        <div 
          onClick={() => setActiveTab('home')}
          className="group text-3xl font-black tracking-tighter flex items-center gap-3 text-white cursor-pointer transition-all duration-300 hover:scale-105 select-none relative"
        >
          {/* Soft logo glow */}
          <div className="absolute -inset-2 bg-gradient-to-r from-web3-accent/10 to-web3-purple/10 rounded-lg opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500"></div>
          
          <span className="relative">
            CASE<span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">FUN</span>
          </span>
        </div>
        
        {/* Navigation with modern style */}
        <nav className="hidden md:flex gap-2">
          {[
            { id: 'home', label: 'Home', icon: Home },
            { id: 'createcase', label: 'Create', icon: PlusSquare },
            { id: 'case', label: 'Case', icon: Briefcase },
            { id: 'upgrade', label: 'Upgrade', icon: Zap },
            { id: 'casebattle', label: 'Case Battle', icon: Swords },
            ...(user.role === 'ADMIN' ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-300 overflow-hidden group ${
                activeTab === item.id 
                  ? 'text-white bg-gradient-to-r from-web3-accent/15 to-web3-purple/15 border border-web3-accent/30 shadow-[0_0_15px_rgba(102,252,241,0.15)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10'
              }`}
            >
              {/* Soft shine effect on hover */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
              
              {/* Soft active indicator */}
              {activeTab === item.id && (
                <div className="absolute inset-0 bg-gradient-to-r from-web3-accent/5 to-web3-purple/5 animate-pulse"></div>
              )}
              
              <item.icon 
                size={18} 
                className={`relative z-10 transition-all duration-300 ${
                  activeTab === item.id 
                    ? 'text-web3-accent drop-shadow-[0_0_6px_rgba(102,252,241,0.5)]' 
                    : 'group-hover:scale-110'
                }`} 
              />
              <span className="relative z-10 font-bold text-sm tracking-wide">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative" ref={soundRef}>
            <button
              onClick={() => setSoundOpen((prev) => !prev)}
              className="h-10 w-10 rounded-xl border border-white/[0.12] bg-black/30 hover:bg-black/40 text-gray-300 hover:text-white transition-all flex items-center justify-center"
              title="Sound settings"
              aria-label="Sound settings"
            >
              {audio.muted || audio.volume <= 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {soundOpen && (
              <div className="absolute right-0 top-12 w-64 rounded-xl border border-white/[0.14] bg-black/90 backdrop-blur-md p-3 shadow-[0_12px_30px_rgba(0,0,0,0.45)] z-[90]">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Sound</div>
                <button
                  onClick={() => setAudioMuted(!audio.muted)}
                  className={`w-full mb-3 px-3 py-2 rounded-lg border text-xs uppercase tracking-widest transition ${
                    audio.muted
                      ? 'border-red-500/40 bg-red-500/15 text-red-300'
                      : 'border-web3-accent/40 bg-web3-accent/15 text-web3-accent'
                  }`}
                >
                  {audio.muted ? 'Sound Off' : 'Sound On'}
                </button>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                  <span>Volume</span>
                  <span>{audio.muted ? 0 : volumePercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audio.muted ? 0 : volumePercent}
                  onChange={(e) => setAudioVolume(Number(e.target.value) / 100)}
                  className="w-full accent-cyan-300 cursor-pointer"
                />
              </div>
            )}
          </div>
          <a
            href="https://x.com/casefunnet"
            target="_blank"
            rel="noreferrer"
            className="h-10 px-3 rounded-xl border border-white/[0.12] bg-black/30 hover:bg-black/40 text-gray-300 hover:text-white transition-all flex items-center gap-2"
            title="Casefun on X"
            aria-label="Casefun on X"
          >
            <svg viewBox="0 0 1200 1227" className="w-4 h-4 fill-current" aria-hidden="true">
              <path d="M714.163 519.284L1160.89 0H1055.14L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.748L515.454 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.06 687.828L521.627 619.936L144.011 79.6944H306.615L611.333 515.664L658.766 583.556L1055.19 1150.69H892.586L569.06 687.854V687.828Z" />
            </svg>
          </a>
          {/* Balance */}
          <div className="h-10 px-4 rounded-xl bg-web3-card/60 border border-gray-700/50 backdrop-blur-sm flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-white tabular-nums">{balance.toLocaleString('en-US')}₮</span>
            {isAuthLoading && (
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Syncing…</span>
            )}
          </div>
          {/* Top-up */}
          <button
            onClick={onOpenTopUp}
            className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all bg-web3-accent/20 border-web3-accent/40 text-web3-accent hover:bg-web3-accent/30 hover:scale-105"
            title="Top up"
            aria-label="Top up balance"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>

          {isConnected && walletAddress && isAuthenticated ? (
            <div className="group relative flex items-center gap-3 px-5 py-2.5 rounded-xl bg-gradient-to-r from-web3-card/60 to-web3-card/40 border border-web3-accent/25 backdrop-blur-sm hover:border-web3-accent/40 transition-all duration-300 shadow-[0_0_15px_rgba(102,252,241,0.1)]">
              {/* Soft animated glow */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-web3-accent to-web3-success rounded-xl opacity-10 group-hover:opacity-20 blur-md transition-opacity duration-500"></div>
              
              <div className="relative flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-web3-success shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
                <span className="font-mono text-sm text-white font-bold tracking-wider">{formatAddress(walletAddress)}</span>
                <button
                  onClick={() => {
                    onLogout();
                    onDisconnectWallet();
                  }}
                  className="text-gray-400 hover:text-white hover:bg-white/10 transition-all text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center"
                  title="Disconnect wallet"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenWalletConnect}
              className="group relative flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black font-black uppercase tracking-wider text-xs overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_rgba(102,252,241,0.4)]"
            >
              {/* Soft shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              
              <Wallet size={16} strokeWidth={3} className="relative z-10" />
              <span className="relative z-10">Connect Wallet</span>
              
              {/* Soft pulse ring */}
              <span className="absolute -inset-1 rounded-xl bg-web3-accent/20 animate-ping opacity-50"></span>
            </button>
          )}

          {/* Profile button with soft style */}
          <div 
            onClick={() => setActiveTab('profile')} 
            className="cursor-pointer group relative"
            title="Personal Account"
          >
            <div className={`absolute -inset-1.5 rounded-full bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple opacity-0 group-hover:opacity-50 blur-lg transition-all duration-500 ${activeTab === 'profile' ? 'opacity-40 animate-pulse' : ''}`}></div>
            <div className="relative">
              <div className={`w-11 h-11 rounded-full border-2 bg-gradient-to-br from-web3-card to-web3-card/50 backdrop-blur-sm flex items-center justify-center transition-all duration-300 ${
                activeTab === 'profile' 
                  ? 'border-web3-accent shadow-[0_0_15px_rgba(102,252,241,0.3)] scale-110' 
                  : 'border-gray-700/50 group-hover:border-web3-accent/60 group-hover:scale-110'
              }`}>
                {user?.avatar ? (
                  <ImageWithMeta
                    src={user.avatar}
                    meta={user.avatarMeta}
                    className="w-full h-full rounded-full"
                  />
                ) : (
                  <UserIcon 
                    size={20} 
                    className={`transition-all duration-300 ${
                      activeTab === 'profile' 
                        ? 'text-web3-accent drop-shadow-[0_0_6px_rgba(102,252,241,0.5)]' 
                        : 'text-gray-400 group-hover:text-web3-accent'
                    }`} 
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
