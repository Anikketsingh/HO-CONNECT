import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { apiSend } from './api';

const TOKEN_KEY = 'hoc-push-token';

/**
 * Remote push does not work in Expo Go on Android (since SDK 53); it needs a development or release build.
 * The web version of the app has no push notifications.
 */
export const pushSupported =
  Platform.OS !== 'web' && !(Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android');

/** Asks permission, gets this phone's push token, and tells the API. Quietly does nothing where push isn't available. */
export async function registerForPush(): Promise<void> {
  if (!pushSupported) return;
  const projectId = (Constants.expoConfig?.extra as { easProjectId?: string } | undefined)?.easProjectId;
  if (!projectId) return;
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Updates', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiSend('/v1/partner/push-token', { method: 'POST', json: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/** On log out: stop this phone receiving the account's notifications. */
export async function unregisterPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await apiSend('/v1/partner/push-token/remove', { method: 'POST', json: { token } });
  } catch {
    // Offline: the server drops the token the next time a push to it fails.
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}
