import React, { useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { api } from '../services/api';

type FeedbackTopic = 'BUG_REPORT' | 'EARLY_ACCESS' | 'PARTNERSHIP';

interface FeedbackWidgetProps {
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
}

const TOPIC_OPTIONS: Array<{ id: FeedbackTopic; label: string }> = [
  { id: 'BUG_REPORT', label: 'Bug report' },
  { id: 'EARLY_ACCESS', label: 'Early access request' },
  { id: 'PARTNERSHIP', label: 'Partnership' },
];

export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({
  isAuthenticated,
  onOpenWalletConnect,
}) => {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<FeedbackTopic>('BUG_REPORT');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const charsLeft = useMemo(() => 500 - message.length, [message.length]);

  const resetForm = () => {
    setTopic('BUG_REPORT');
    setContact('');
    setMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    const safeContact = contact.trim();
    const safeMessage = message.trim();
    if (!safeContact || safeMessage.length === 0 || safeMessage.length > 500) {
      setStatus('Please fill all fields correctly.');
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      await api.sendFeedback({
        topic,
        contact: safeContact,
        message: safeMessage,
      });
      setStatus('Message sent. Thank you.');
      resetForm();
    } catch (error: any) {
      setStatus(error?.message || 'Failed to send message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[70]">
      {open ? (
        <div className="w-[340px] max-w-[92vw] rounded-2xl border border-white/[0.12] bg-web3-card/95 shadow-[0_20px_50px_rgba(0,0,0,0.45)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-widest text-gray-400">Feedback</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg border border-white/[0.12] bg-black/30 text-gray-300 hover:text-white"
              aria-label="Close feedback form"
            >
              <X size={14} className="mx-auto" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Topic</div>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as FeedbackTopic)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-sm"
              >
                {TOPIC_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Telegram</div>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="@username"
                maxLength={100}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Message</div>
                <div className={`text-[10px] ${charsLeft < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {charsLeft}
                </div>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={5}
                placeholder="Write your message..."
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-sm resize-none"
              />
            </div>
            {status && <div className="text-[11px] text-gray-300">{status}</div>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black font-black uppercase tracking-widest text-xs disabled:opacity-60"
            >
              {isAuthenticated ? (submitting ? 'Sending...' : 'Send') : 'Connect wallet'}
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full border border-web3-accent/40 bg-web3-card/90 text-web3-accent shadow-[0_12px_30px_rgba(0,0,0,0.35)] hover:scale-105 transition-all"
          title="Feedback"
          aria-label="Open feedback form"
        >
          <MessageCircle size={22} className="mx-auto" />
        </button>
      )}
    </div>
  );
};
