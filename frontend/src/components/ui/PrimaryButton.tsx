import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105 hover:shadow-[0_0_40px_rgba(102,252,241,0.6)]',
  secondary:
    'bg-web3-card/50 border border-white/[0.12] text-gray-200 hover:border-web3-accent/50',
  danger:
    'bg-gradient-to-r from-web3-danger to-red-600 text-white hover:scale-105 hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]',
  ghost:
    'bg-transparent border border-white/[0.12] text-gray-300 hover:text-white hover:border-web3-accent/40',
};

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => (
  <button
    type="button"
    className={[
      'group relative px-6 py-3 text-sm font-black rounded-xl overflow-hidden transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
      fullWidth ? 'w-full' : '',
      VARIANT_CLASSES[variant],
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
    <span className="relative flex items-center justify-center gap-2 uppercase tracking-wide">
      {children}
    </span>
  </button>
);
