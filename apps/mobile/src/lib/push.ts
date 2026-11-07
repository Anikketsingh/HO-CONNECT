import { router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from './auth';
import { pushSupported, registerForPush } from './push-token';

function open(url: unknown) {
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
}

/** Registers this phone for notifications once the user is a partner, and opens the right screen when one is tapped. */
export function usePush() {
  const { state } = useAuth();
  const isPartner = state.status === 'ready' && state.me.kind === 'partner';

  useEffect(() => {
    if (isPartner) void registerForPush().catch(() => {});
  }, [isPartner]);

  useEffect(() => {
    if (!pushSupported) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    void import('expo-notifications').then((N) => {
      if (cancelled) return;
      N.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
      const sub = N.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data?.url));
      remove = () => sub.remove();
      // The app was opened by tapping a notification.
      void N.getLastNotificationResponseAsync().then((r) => r && open(r.notification.request.content.data?.url));
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);
}
