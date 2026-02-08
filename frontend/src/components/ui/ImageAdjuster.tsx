import React from 'react';
import { ImageMeta } from '../../types';
import { ImageWithMeta } from './ImageWithMeta';

interface ImageAdjusterProps {
  src: string;
  meta: ImageMeta;
  onChange: (meta: ImageMeta) => void;
  label?: string;
  previewSize?: number;
  shape?: 'circle' | 'square';
}

export const ImageAdjuster: React.FC<ImageAdjusterProps> = ({
  src,
  meta,
  onChange,
  label = 'Image Display',
  previewSize = 96,
  shape = 'circle',
}) => {
  const fit = meta.fit || 'contain';
  const scale = meta.scale ?? 1;
  const offsetX = meta.x ?? 0;
  const offsetY = meta.y ?? 0;

  return (
    <div className="mt-3 bg-black/20 border border-white/[0.12] rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">{label}</div>
      <div className="flex items-center gap-4">
        <div
          className={`border border-white/[0.12] bg-black/30 ${
            shape === 'circle' ? 'rounded-full' : 'rounded-xl'
          }`}
          style={{ width: previewSize, height: previewSize }}
        >
          <ImageWithMeta
            src={src}
            meta={meta}
            className={`w-full h-full ${
              shape === 'circle' ? 'rounded-full' : 'rounded-xl'
            }`}
          />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Fit</div>
            <div className="flex items-center gap-2">
              {(['contain', 'cover'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange({ ...meta, fit: option })}
                  className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border transition ${
                    fit === option
                      ? 'bg-web3-accent/20 text-web3-accent border-web3-accent/40'
                      : 'bg-white/[0.03] text-gray-400 border-white/[0.08] hover:text-white'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Zoom</div>
            <input
              type="range"
              min={0.8}
              max={1.8}
              step={0.05}
              value={scale}
              onChange={(event) =>
                onChange({ ...meta, scale: Number(event.target.value) })
              }
              className="w-full"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Position X</div>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={offsetX}
              onChange={(event) =>
                onChange({ ...meta, x: Number(event.target.value) })
              }
              className="w-full"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Position Y</div>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={offsetY}
              onChange={(event) =>
                onChange({ ...meta, y: Number(event.target.value) })
              }
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
