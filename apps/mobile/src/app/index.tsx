import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Logo } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

/** Start screen: waits for the session, then sends the user to login or home. */
export default function Index() {
  const { state } = useAuth();

  if (state.status === 'signed_out') return <Redirect href="/login" />;
  if (state.status !== 'loading') return <Redirect href="/home" />;

  return (
    <View style={styles.container}>
      <Logo width={150} />
      <ActivityIndicator style={styles.spinner} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blush },
  spinner: { marginTop: 28 },
});
