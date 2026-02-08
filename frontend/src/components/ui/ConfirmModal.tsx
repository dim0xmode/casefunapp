import React from 'react';
import { PrimaryButton } from './PrimaryButton';

interface ConfirmModalProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  className = '',
}) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 rounded-2xl">
    <div className={['w-[420px] px-12 py-10 rounded-3xl bg-black/70 border border-white/[0.12] shadow-[0_10px_30px_rgba(0,0,0,0.35)] text-center backdrop-blur-2xl', className].join(' ')}>
      <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">{title}</div>
      <div className="text-lg font-black text-white mb-6">{message}</div>
      <div className="flex items-center justify-center gap-3">
        <PrimaryButton variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </PrimaryButton>
        <PrimaryButton onClick={onConfirm}>{confirmLabel}</PrimaryButton>
      </div>
    </div>
  </div>
);
