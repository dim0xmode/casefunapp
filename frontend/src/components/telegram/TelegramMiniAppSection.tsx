import React from 'react';
import { TelegramMiniAppView } from '../TelegramMiniAppView';

type TelegramMiniAppViewProps = React.ComponentProps<typeof TelegramMiniAppView>;

interface BridgeCardProps {
  title: string;
  description: string;
  error?: string | null;
  children?: React.ReactNode;
}

interface TelegramMiniAppSectionProps {
  showTelegramBridgeReturnHelper: boolean;
  showTelegramWalletBridgeRunner: boolean;
  showTelegramTopUpBridgeRunner: boolean;
  walletLinkBot: string;
  telegramAuthError: string | null;
  onOpenTelegramFromBridgeHelper: () => void | Promise<void>;
  miniAppViewProps: TelegramMiniAppViewProps;
}

const BridgeCard: React.FC<BridgeCardProps> = ({ title, description, error, children }) => (
  <div className="mx-auto w-full max-w-[560px] px-2 py-2">
    <div className="rounded-[24px] border border-web3-accent/35 bg-[#0B1018] p-4">
      <div className="text-[11px] uppercase tracking-widest text-web3-accent font-bold">{title}</div>
      <div className="text-sm text-gray-200 mt-2">{description}</div>
      {children}
      {error && <div className="mt-3 text-[11px] uppercase tracking-widest text-red-300">{error}</div>}
    </div>
  </div>
);

export const TelegramMiniAppSection: React.FC<TelegramMiniAppSectionProps> = ({
  showTelegramBridgeReturnHelper,
  showTelegramWalletBridgeRunner,
  showTelegramTopUpBridgeRunner,
  walletLinkBot,
  telegramAuthError,
  onOpenTelegramFromBridgeHelper,
  miniAppViewProps,
}) => {
  if (showTelegramBridgeReturnHelper) {
    const botUsername = walletLinkBot || 'casefun_bot';
    return (
      <div className="animate-fade-in">
        <BridgeCard
          title="Return to Telegram"
          description="Return to Telegram Mini App to continue."
          error={telegramAuthError}
        >
          <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-500">Bot: @{botUsername}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onOpenTelegramFromBridgeHelper()}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-web3-accent to-web3-success text-black text-[11px] uppercase tracking-widest font-black"
            >
              Open Telegram Mini App
            </button>
            <a
              href={`https://t.me/${botUsername}?startapp=linked`}
              className="px-4 py-2 rounded-lg border border-white/[0.14] text-gray-200 text-[11px] uppercase tracking-widest font-black"
            >
              Open via browser link
            </a>
          </div>
        </BridgeCard>
      </div>
    );
  }

  if (showTelegramWalletBridgeRunner) {
    const botUsername = walletLinkBot || 'casefun_bot';
    return (
      <div className="animate-fade-in">
        <BridgeCard
          title="Linking wallet"
          description="Waiting for wallet signature in this wallet browser."
          error={telegramAuthError}
        >
          <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-500">
            After signing, tap return button.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onOpenTelegramFromBridgeHelper()}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-web3-accent to-web3-success text-black text-[11px] uppercase tracking-widest font-black"
            >
              Open Telegram Mini App
            </button>
            <a
              href={`https://t.me/${botUsername}?startapp=linked`}
              className="px-4 py-2 rounded-lg border border-white/[0.14] text-gray-200 text-[11px] uppercase tracking-widest font-black"
            >
              Open via browser link
            </a>
          </div>
        </BridgeCard>
      </div>
    );
  }

  if (showTelegramTopUpBridgeRunner) {
    return (
      <div className="animate-fade-in">
        <BridgeCard
          title="Top up in wallet"
          description="Confirm transaction in wallet app. After confirmation, you will be returned to Telegram."
          error={telegramAuthError}
        />
      </div>
    );
  }

  return (
    <div className="h-full animate-fade-in">
      <TelegramMiniAppView {...miniAppViewProps} />
    </div>
  );
};
