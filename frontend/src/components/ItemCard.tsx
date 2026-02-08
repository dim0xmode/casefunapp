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
}

const sizeStyles: Record<ItemCardSize, { padding: string; circle: string; value: string; currency: string }> = {
  sm: {
    padding: 'p-2',
    circle: 'w-12 h-12 text-xl',
    value: 'text-sm',
    currency: 'text-[10px]',
  },
  md: {
    padding: 'p-3',
    circle: 'w-16 h-16 text-2xl',
    value: 'text-sm',
    currency: 'text-xs',
  },
  lg: {
    padding: 'p-4',
    circle: 'w-24 h-24 text-4xl',
    value: 'text-base',
    currency: 'text-sm',
  },
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
}) => {
  const styles = sizeStyles[size];
  const isInteractive = Boolean(onClick) && !disabled;
  const isImage = item.image?.startsWith('http') || item.image?.startsWith('/') || item.image?.startsWith('data:');

  return (
    <div
      onClick={isInteractive ? onClick : undefined}
      className={[
        'group relative rounded-xl border-2 border-white/[0.06] bg-web3-card/50 backdrop-blur-sm',
        `${showSelectedBadge ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 flex flex-col items-center justify-center`,
        styles.padding,
        isInteractive ? 'cursor-pointer hover:border-web3-accent/50 hover:bg-web3-card/70 hover:shadow-[0_0_20px_rgba(102,252,241,0.15)]' : 'cursor-default',
        selected ? 'border-web3-accent shadow-[0_0_20px_rgba(102,252,241,0.2)] scale-105 z-10' : '',
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
        className={`relative z-10 ${styles.circle} rounded-full overflow-hidden bg-gradient-to-br from-web3-purple/30 to-web3-accent/30 border-2 shadow-[0_0_8px_rgba(102,252,241,0.12)] flex items-center justify-center`}
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
            <span className="text-3xl">{item.image}</span>
          )
        ) : (
          <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>
        )}
      </div>
      {!hideValue && (
        <div className="relative z-10 mt-2 text-center">
          <div className={`font-bold text-white ${styles.value}`}>{item.value}</div>
          <div className={`text-gray-400 ${styles.currency}`}>{currencyPrefix}{item.currency}</div>
        </div>
      )}
    </div>
  );
};
