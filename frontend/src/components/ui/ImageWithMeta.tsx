import React from 'react';
import { ImageMeta } from '../../types';
import { resolveAssetUrl } from '../../services/api';

interface ImageWithMetaProps {
  src: string;
  meta?: ImageMeta;
  className?: string;
  imgClassName?: string;
}

export const ImageWithMeta: React.FC<ImageWithMetaProps> = ({
  src,
  meta,
  className = '',
  imgClassName = '',
}) => {
  const fit = meta?.fit || 'cover';
  const scale = meta?.scale ?? 1;
  const offsetX = meta?.x ?? 0;
  const offsetY = meta?.y ?? 0;
  const resolved = src.startsWith('/') ? resolveAssetUrl(src) : src;

  return (
    <div className={`overflow-hidden ${className}`}>
      <img
        src={resolved}
        alt="image"
        className={`w-full h-full ${imgClassName}`}
        style={{
          objectFit: fit,
          transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
          transformOrigin: 'center',
        }}
      />
    </div>
  );
};
