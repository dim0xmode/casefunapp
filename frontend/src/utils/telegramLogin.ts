const TELEGRAM_WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';

export interface TelegramLegacyLoginPayload {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

export interface TelegramOidcLoginPayload {
  id_token: string;
}

export type TelegramLoginPayload = TelegramOidcLoginPayload | TelegramLegacyLoginPayload;

let scriptLoadPromise: Promise<void> | null = null;

const ensureTelegramWidgetScript = async () => {
  const hasApi = typeof window !== 'undefined' && Boolean((window as any).Telegram?.Login?.auth);
  if (hasApi) return;

  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${TELEGRAM_WIDGET_SRC}"]`) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load Telegram widget script.')), {
          once: true,
        });
        return;
      }

      const script = document.createElement('script');
      script.src = TELEGRAM_WIDGET_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Telegram widget script.'));
      document.head.appendChild(script);
    });
  }

  await scriptLoadPromise;

  const ready = Boolean((window as any).Telegram?.Login?.auth);
  if (!ready) {
    throw new Error('Telegram login widget is unavailable.');
  }
};

export const requestTelegramLoginPopup = async (clientId: number): Promise<TelegramLoginPayload> => {
  if (!Number.isFinite(clientId) || clientId <= 0) {
    throw new Error('Telegram client/bot ID is not configured.');
  }

  await ensureTelegramWidgetScript();

  const loginApi = (window as any)?.Telegram?.Login;
  if (!loginApi?.auth) {
    throw new Error('Telegram login API is unavailable.');
  }

  const shouldFallbackToBotId = (message: string) => /bot[\s_]?id required/i.test(message || '');

  const openAuthPopup = (options: {
    client_id?: number;
    bot_id?: number;
    request_access?: Array<'phone' | 'write'> | 'write' | boolean;
    lang?: string;
    nonce?: string;
  }) =>
    new Promise<TelegramLoginCallbackData>((resolve, reject) => {
      try {
        loginApi.auth(options, (data: TelegramLoginCallbackData | null | undefined) => {
          if (!data) {
            reject(new Error('Telegram authorization was cancelled.'));
            return;
          }
          resolve(data);
        });
      } catch (error: any) {
        reject(new Error(error?.message || 'Telegram login popup failed.'));
      }
    });

  const normalizePayload = (data: TelegramLoginCallbackData): TelegramLoginPayload => {
    if (data.id_token) {
      return { id_token: data.id_token };
    }
    if (!data.hash || !data.auth_date || !data.id) {
      throw new Error('Telegram returned incomplete auth data.');
    }
    return data as TelegramLegacyLoginPayload;
  };

  try {
    const primary = await openAuthPopup({ client_id: clientId, request_access: ['write'], lang: 'en' });
    if (primary.error) {
      if (!shouldFallbackToBotId(primary.error)) {
        throw new Error(primary.error);
      }
      const legacy = await openAuthPopup({ bot_id: clientId, request_access: 'write', lang: 'en' });
      if (legacy.error) {
        throw new Error(legacy.error);
      }
      return normalizePayload(legacy);
    }
    return normalizePayload(primary);
  } catch (error: any) {
    if (!shouldFallbackToBotId(String(error?.message || ''))) {
      throw error;
    }
    const legacy = await openAuthPopup({ bot_id: clientId, request_access: 'write', lang: 'en' });
    if (legacy.error) {
      throw new Error(legacy.error);
    }
    return normalizePayload(legacy);
  }
};

interface TelegramLoginCallbackData extends Partial<TelegramLegacyLoginPayload> {
  id_token?: string;
  error?: string;
}

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: {
            client_id?: number;
            bot_id?: number;
            request_access?: Array<'phone' | 'write'> | 'write' | boolean;
            lang?: string;
            nonce?: string;
          },
          callback: (data: TelegramLoginCallbackData | null | undefined) => void
        ) => void;
      };
      WebApp?: {
        initData?: string;
      };
    };
  }
}
