import { BodoniModa_500Medium } from '@expo-google-fonts/bodoni-moda';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { LanguageProvider } from '@/i18n';
import { AuthProvider } from '@/lib/auth';
import { usePush } from '@/lib/push';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

function PushSetup() {
  usePush();
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    BodoniModa_500Medium,
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <LanguageProvider>
      <AuthProvider>
        <PushSetup />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'fade' }} />
      </AuthProvider>
    </LanguageProvider>
  );
}
