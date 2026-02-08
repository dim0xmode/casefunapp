import React from 'react';
import { useAdminAction } from '../../hooks/useAdminAction';

interface AdminActionButtonProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  balance: number;
  cost: number;
  onConnect: () => void;
  onTopUp: () => void;
  onAction: () => void;
  readyLabel: React.ReactNode;
  connectLabel?: React.ReactNode;
  adminsOnlyLabel?: React.ReactNode;
  topUpLabel?: (shortfall: number) => React.ReactNode;
  labelOverride?: React.ReactNode;
  forceLabel?: boolean;
  className?: string;
  disabled?: boolean;
  showPing?: boolean;
}

export const AdminActionButton: React.FC<AdminActionButtonProps> = ({
  isAuthenticated,
  isAdmin,
  balance,
  cost,
  onConnect,
  onTopUp,
  onAction,
  readyLabel,
  connectLabel = 'Connect Wallet',
  adminsOnlyLabel = 'Admins only',
  topUpLabel = (shortfall) => `Need ${shortfall.toFixed(1)} ₮ more • Top up`,
  labelOverride,
  forceLabel = false,
  className = '',
  disabled = false,
  showPing = false,
}) => {
  const action = useAdminAction({ isAuthenticated, isAdmin, balance, cost });
  const isDisabled = disabled || action.state === 'admins-only';

  const label =
    action.state === 'connect'
      ? connectLabel
      : action.state === 'admins-only'
      ? adminsOnlyLabel
      : action.state === 'topup'
      ? topUpLabel(action.shortfall)
      : readyLabel;

  const finalLabel = forceLabel && labelOverride !== undefined ? labelOverride : label;

  const handleClick = () => {
    if (isDisabled) return;
    if (action.state === 'connect') {
      onConnect();
      return;
    }
    if (action.state === 'topup') {
      onTopUp();
      return;
    }
    if (action.state === 'ready') {
      onAction();
    }
  };

  const stateClass =
    action.state === 'connect' || action.state === 'ready'
      ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
      : 'bg-gray-700/80 text-gray-400 border border-red-500/40 hover:border-red-500/60';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={[
        'relative transition disabled:opacity-50 disabled:cursor-not-allowed',
        stateClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {finalLabel}
      {showPing && action.state === 'ready' && !isDisabled ? (
        <span className="absolute -inset-2 rounded-xl bg-web3-accent/30 animate-ping opacity-75 pointer-events-none"></span>
      ) : null}
    </button>
  );
};
