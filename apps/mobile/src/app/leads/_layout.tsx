import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

/** Leads are for approved partners only (the API enforces this too). */
export default function LeadsLayout() {
  const { state } = useAuth();
  if (state.status === 'signed_out') return <Redirect href="/login" />;
  if (state.status === 'ready' && !(state.me.kind === 'partner' && state.me.partnerStatus === 'approved')) {
    return <Redirect href="/home" />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />;
}
