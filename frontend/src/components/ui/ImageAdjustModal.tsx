import React, { useEffect, useRef, useState } from 'react';
import { ImageMeta } from '../../types';
import { ImageWithMeta } from './ImageWithMeta';
import { PrimaryButton } from './PrimaryButton';

interface ImageAdjustModalProps {
  open: boolean;
  src: string;
  initialMeta: ImageMeta;
  defaultMeta: ImageMeta;
  shape?: 'circle' | 'square';
  title?: string;
  onSave: (meta: ImageMeta) => void;
  onClose: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const ImageAdjustModal: React.FC<ImageAdjustModalProps> = ({
  open,
  src,
  initialMeta,
  defaultMeta,
  shape = 'square',
  title = 'Adjust Image',
  onSave,
  onClose,
}) => {
  const [draftMeta, setDraftMeta] = useState<ImageMeta>(initialMeta);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setDraftMeta(initialMeta);
    }
  }, [open, initialMeta, src]);

  if (!open) return null;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: draftMeta.x ?? 0,
      baseY: draftMeta.y ?? 0,
      pointerId: event.pointerId,
    };
    frameRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!frameRef.current || !dragRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    const nextX = dragRef.current.baseX + (deltaX / rect.width) * 100;
    const nextY = dragRef.current.baseY + (deltaY / rect.height) * 100;
    setDraftMeta((prev) => ({
      ...prev,
      x: clamp(nextX, -50, 50),
      y: clamp(nextY, -50, 50),
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!frameRef.current || !dragRef.current) return;
    frameRef.current.releasePointerCapture(dragRef.current.pointerId);
    dragRef.current = null;
  };

  const fit = draftMeta.fit || defaultMeta.fit || 'contain';
  const scale = draftMeta.scale ?? 1;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[92%] max-w-3xl bg-black/60 border border-white/[0.12] rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase tracking-widest text-gray-400">{title}</div>
          <button
            onClick={onClose}
            className="text-xs uppercase tracking-widest text-gray-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
          <div className="flex flex-col items-center">
            <div
              ref={frameRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`relative w-[280px] h-[280px] bg-black/40 border border-white/[0.12] overflow-hidden ${
                shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
              } cursor-grab active:cursor-grabbing touch-none`}
            >
              <ImageWithMeta src={src} meta={draftMeta} className="w-full h-full" />
              <div className="absolute inset-0 border border-white/20 pointer-events-none"></div>
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-500 text-center">
              Drag image to position
            </div>

            <div className="mt-4 w-full max-w-sm">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                <span>Zoom</span>
                <span>{Math.round(scale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={2}
                step={0.01}
                value={scale}
                onChange={(event) =>
                  setDraftMeta((prev) => ({ ...prev, scale: Number(event.target.value) }))
                }
                className="w-full"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              {(['contain', 'cover'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDraftMeta((prev) => ({ ...prev, fit: option }))}
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

          <div className="flex flex-col items-center gap-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Preview</div>
            <div
              className={`w-24 h-24 border border-white/[0.12] bg-black/30 overflow-hidden ${
                shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
              }`}
            >
              <ImageWithMeta src={src} meta={draftMeta} className="w-full h-full" />
            </div>
            <button
              type="button"
              onClick={() => setDraftMeta(defaultMeta)}
              className="mt-1 text-[10px] uppercase tracking-widest text-gray-500 hover:text-white"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <PrimaryButton variant="ghost" onClick={onClose}>
            Cancel
          </PrimaryButton>
          <PrimaryButton onClick={() => onSave(draftMeta)}>Save</PrimaryButton>
        </div>
      </div>
    </div>
  );
};
