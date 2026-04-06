import { useEffect, useRef } from 'react';

export const useWakeLock = () => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquire = async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      /* user denied or unsupported */
    }
  };

  useEffect(() => {
    acquire();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        acquire();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);
};
