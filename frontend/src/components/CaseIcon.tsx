import React from 'react';
import { ImageMeta } from '../types';
import { ImageWithMeta } from './ui/ImageWithMeta';

type CaseIconSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<CaseIconSize, { img: string; emoji: string }> = {
  sm: { img: 'w-8 h-8', emoji: 'text-lg' },
  md: { img: 'w-10 h-10', emoji: 'text-2xl' },
  lg: { img: 'w-14 h-14', emoji: 'text-4xl' },
};

interface CaseIconProps {
  value?: string;
  size?: CaseIconSize;
  meta?: ImageMeta;
  className?: string;
}

export const CaseIcon: React.FC<CaseIconProps> = ({
  value = '',
  size = 'md',
  meta,
  className = '',
}) => {
  if (!value) {
    return <span className={`text-[10px] uppercase tracking-widest text-gray-500 ${className}`}>Logo</span>;
  }

  if (value.startsWith('http') || value.startsWith('/')) {
    return (
      <ImageWithMeta
        src={value}
        meta={meta}
        className={`${SIZE_CLASS[size].img} ${className}`}
      />
    );
  }

  return <span className={`${SIZE_CLASS[size].emoji} ${className}`}>{value}</span>;
};
