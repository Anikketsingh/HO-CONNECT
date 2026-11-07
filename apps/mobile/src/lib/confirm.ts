import { Alert } from 'react-native';
import { t } from '@/i18n';

/** Asks the user to confirm an action. Resolves true if they did. The web version is confirm.web.ts. */
export function confirmAction(opts: { title: string; message: string; confirmLabel: string; destructive?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: t('Cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
