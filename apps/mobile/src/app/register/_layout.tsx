import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Button, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { RegistrationProvider, useRegistration } from '@/lib/registration';
import { colors } from '@/theme';
import { t } from '@/i18n';

function Gate() {
  const { state } = useAuth();
  const { loaded, error, options, application, retry } = useRegistration();

  if (state.status === 'signed_out') return <Redirect href="/login" />;
  if (state.status === 'ready' && state.me.kind === 'admin') return <Redirect href="/home" />;
  // Once submitted (or approved), the application is read-only: back to the status screen.
  if (application && !application.canEdit) return <Redirect href="/home" />;

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error && !options) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ padding: 24 }}>
          <Title>{t("Can't load registration")}</Title>
          <Body style={{ marginVertical: 16 }}>{t("Check your connection and try again.")}</Body>
          <Notice tone="error">{error}</Notice>
          <Button label={t("Try again")} onPress={retry} />
        </View>
      </SafeAreaView>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />;
}

export default function RegisterLayout() {
  return (
    <RegistrationProvider>
      <Gate />
    </RegistrationProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
});
