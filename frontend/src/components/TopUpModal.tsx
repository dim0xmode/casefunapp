import React, { useState } from 'react';
import { PrimaryButton } from './ui/PrimaryButton';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTopUp: (amount: number) => void;
  isAdmin: boolean;
}

export const TopUpModal: React.FC<TopUpModalProps> = ({ isOpen, onClose, onTopUp, isAdmin }) => {
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const value = Number(amount.replace(/,/g, '.').trim());
    if (!Number.isFinite(value) || value <= 0) return;
    onTopUp(value);
    setAmount('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-modal-fade" onClick={onClose}>
      <div
        className="bg-web3-card/90 border border-white/[0.12] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] px-8 py-6 max-w-sm w-[90%] animate-modal-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Top up balance</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isAdmin && (
            <div className="text-[11px] uppercase tracking-widest text-gray-500">
              Only admins can top up
            </div>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2">Amount (₮)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="0"
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-white font-mono text-lg"
            />
          </div>
          <div className="flex gap-3">
            <PrimaryButton variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </PrimaryButton>
            <PrimaryButton
              type="submit"
              disabled={!isAdmin || !amount.trim() || Number(amount.replace(/,/g, '.')) <= 0}
              variant={isAdmin ? 'primary' : 'secondary'}
              className="flex-1"
            >
              {isAdmin ? 'Top up' : 'Admins only'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
};
