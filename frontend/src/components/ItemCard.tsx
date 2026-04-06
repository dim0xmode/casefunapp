import React from 'react';
import { Item } from '../types';
import { ImageWithMeta } from './ui/ImageWithMeta';

type ItemCardSize = 'sm' | 'md' | 'lg';

interface ItemCardProps {
  item: Item;
  size?: ItemCardSize;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  showSelectedBadge?: boolean;
  status?: 'normal' | 'burnt';
  className?: string;
  hideValue?: boolean;
  currencyPrefix?: string;
  compactContent?: boolean;
}

type CardSizeStyle = {
  padding: string;
  circle: string;
  value: string;
  currency: string;
  emoji: string;
  logo: string;
  valueGap: string;
};

const sizeStyles: Record<ItemCardSize, CardSizeStyle> = {
  sm: {
    padding: 'p-2',
    circle: 'w-12 h-12 text-xl',
    value: 'text-sm',
    currency: 'text-[10px]',
    emoji: 'text-xl',
    logo: 'text-[9px]',
    valueGap: 'mt-2',
  },
  md: {
    padding: 'p-3',
    circle: 'w-16 h-16 text-2xl',
    value: 'text-sm',
    currency: 'text-xs',
    emoji: 'text-2xl',
    logo: 'text-[10px]',
    valueGap: 'mt-2',
  },
  lg: {
    padding: 'p-4',
    circle: 'w-24 h-24 text-4xl',
    value: 'text-base',
    currency: 'text-sm',
    emoji: 'text-4xl',
    logo: 'text-[10px]',
    valueGap: 'mt-2',
  },
};

const compactStyles: Record<ItemCardSize, CardSizeStyle> = {
  sm: {
    padding: 'p-1.5',
    circle: 'w-9 h-9 text-base',
    value: 'text-[11px]',
    currency: 'text-[9px]',
    emoji: 'text-lg',
    logo: 'text-[8px]',
    valueGap: 'mt-1',
  },
  md: {
    padding: 'p-2',
    circle: 'w-12 h-12 text-xl',
    value: 'text-xs',
    currency: 'text-[10px]',
    emoji: 'text-xl',
    logo: 'text-[9px]',
    valueGap: 'mt-1.5',
  },
  lg: {
    padding: 'p-3',
    circle: 'w-16 h-16 text-2xl',
    value: 'text-sm',
    currency: 'text-xs',
    emoji: 'text-3xl',
    logo: 'text-[10px]',
    valueGap: 'mt-1.5',
  },
};

const compactShellMinHeights: Record<ItemCardSize, string> = {
  sm: 'min-h-[102px]',
  md: 'min-h-[122px]',
  lg: 'min-h-[186px]',
};

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  size = 'md',
  selected = false,
  disabled = false,
  onClick,
  showSelectedBadge = false,
  status = 'normal',
  className = '',
  hideValue = false,
  currencyPrefix = '$',
  compactContent = false,
}) => {
  const styles = compactContent ? compactStyles[size] : sizeStyles[size];
  const isInteractive = Boolean(onClick) && !disabled;
  const isImage = item.image?.startsWith('http') || item.image?.startsWith('/') || item.image?.startsWith('data:');
  const displayValue = Number.isFinite(Number(item.value)) ? Number(item.value).toFixed(2) : '0.00';
  const usdtVal = Number(item.valueUsdt || 0) || Number(item.value || 0) * Number(item.tokenPrice || 0);
  const showUsdt = usdtVal > 0 && Number(item.tokenPrice || 0) > 0;

  return (
    <div
      onClick={isInteractive ? onClick : undefined}
      className={[
        'group relative rounded-xl border-2 border-white/[0.06] bg-web3-card/50 backdrop-blur-sm',
        `${showSelectedBadge ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 flex flex-col items-center justify-center`,
        styles.padding,
        compactContent ? compactShellMinHeights[size] : '',
        isInteractive ? 'cursor-pointer hover:border-web3-accent/50 hover:bg-web3-card/70 hover:shadow-[0_0_20px_rgba(102,252,241,0.15)]' : 'cursor-default',
        selected
          ? compactContent
            ? 'border-web3-accent shadow-[0_0_18px_rgba(102,252,241,0.22)] ring-1 ring-web3-accent/35'
            : 'border-web3-accent shadow-[0_0_20px_rgba(102,252,241,0.2)] scale-105 z-10'
          : '',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        status === 'burnt' ? 'opacity-50' : '',
        className,
      ].join(' ')}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-web3-accent/[0.04] to-web3-purple/[0.04] group-hover:from-web3-accent/10 group-hover:to-web3-purple/10 transition-all duration-300"></div>

      {showSelectedBadge && selected && (
        <div className="absolute -top-3 bg-web3-accent text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-lg">
          Selected
        </div>
      )}

      {status === 'burnt' && (
        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-red-500"></div>
      )}

      <div
        className={`relative z-10 ${styles.circle} aspect-square shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-web3-purple/30 to-web3-accent/30 border-2 shadow-[0_0_8px_rgba(102,252,241,0.12)] flex items-center justify-center`}
        style={{ borderColor: item.color }}
      >
        {item.image ? (
          isImage ? (
            <ImageWithMeta
              src={item.image}
              meta={item.imageMeta}
              className="w-full h-full rounded-full"
              imgClassName="w-full h-full"
            />
          ) : (
            <span className={styles.emoji}>{item.image}</span>
          )
        ) : (
          <span className={`${styles.logo} uppercase tracking-widest text-gray-500`}>Logo</span>
        )}
      </div>
      {!hideValue && (
        <div className={`relative z-10 ${styles.valueGap} text-center`}>
          <div className={`font-bold text-white ${styles.value}`}>{displayValue}</div>
          <div className={`text-gray-400 ${styles.currency}`}>{currencyPrefix}{item.currency}</div>
          {showUsdt && (
            <div className={`text-web3-accent/70 ${styles.currency} mt-0.5`}>≈ {usdtVal.toFixed(2)} USDT</div>
          )}
        </div>
      )}
    </div>
  );
};
