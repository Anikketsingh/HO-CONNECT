import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import type { ExpoConfig } from 'expo/config';

// One .env for the whole repo. Only public values go into the app:
// the Supabase URL, the publishable (anon) key and, optionally, a fixed API URL.
config({ path: ['.env', '../../.env'], quiet: true });

/** The EAS project (expo.dev → @anikket.singh/ho-connect). Not a secret; EAS build and push tokens need it. */
const EAS_PROJECT_ID = '8a2e39ba-f72a-457e-b337-6cb0abc6b174';

/**
 * Firebase config for Android push (FCM). Not in git: on EAS build servers it comes from the file
 * environment variable GOOGLE_SERVICES_JSON; locally from apps/mobile/google-services.json if present.
 */
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ?? (existsSync(join(__dirname, 'google-services.json')) ? './google-services.json' : undefined);

const appConfig: ExpoConfig = {
  name: 'HO Connect',
  slug: 'ho-connect',
  owner: 'anikket.singh',
  scheme: 'hoconnect',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // Web: the same partner app as a website (for partners without Android, e.g. on iPhone), deployed on Vercel.
  platforms: ['ios', 'android', 'web'],
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.hairoriginals.connect', supportsTablet: false },
  android: {
    package: 'com.hairoriginals.connect',
    ...(googleServicesFile ? { googleServicesFile } : {}),
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#F7EFEC' },
    // Only the camera (to photograph documents). Gallery photos use Android's system picker, which needs no permission,
    // so the broad storage and photo permissions Google Play restricts are blocked.
    permissions: ['CAMERA'],
    blockedPermissions: [
      'RECORD_AUDIO',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
    ],
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/icon.png', name: 'HO Connect', shortName: 'HO Connect', themeColor: '#905254', backgroundColor: '#F7EFEC' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#F7EFEC', image: './assets/splash-icon.png', imageWidth: 220 }],
    ['expo-notifications', { color: '#905254', icon: './assets/notification-icon.png' }],
    [
      'expo-image-picker',
      {
        cameraPermission: 'HO Connect uses the camera so you can photograph documents for your partner application.',
        photosPermission: 'HO Connect needs access to your photos so you can upload documents for your partner application.',
        microphonePermission: false,
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
    // Leave unset in development: the app then calls the API on the computer running `expo start`.
    // (Empty string, not null: Expo's config serialiser turns null into {}.)
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
    // Needed to get a push token. EXPO_PUBLIC_EAS_PROJECT_ID can override it (for example for a test project).
    easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || EAS_PROJECT_ID,
    eas: { projectId: EAS_PROJECT_ID },
    // The public website address (privacy policy). In development it is worked out from the API address.
    webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_URL ?? '',
  },
};

export default appConfig;
