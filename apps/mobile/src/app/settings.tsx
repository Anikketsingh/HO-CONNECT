import { applicationDeletionSchema, partnerApplicationSchema } from '@hoc/shared';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Button, Card, ScreenHeader } from '@/components/ui';
import { LANGUAGES, t, useLanguage } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { WEB_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

/** Language, privacy and account deletion (Google Play requires an in-app way to ask for deletion). */
export default function Settings() {
  const { state, signOut, refresh } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const me = state.status === 'ready' ? state.me : null;
  const canDelete = me?.kind === 'partner' || me?.kind === 'unregistered';
  const isPartner = me?.kind === 'partner';

  // A partner who already asked sees that, instead of a button that does nothing new.
  useEffect(() => {
    if (!isPartner) return;
    api('/v1/partner/application', partnerApplicationSchema).then(
      (a) => setRequested(!!a.deletionRequestedAt),
      () => {},
    );
  }, [isPartner]);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/v1/me/delete-account', applicationDeletionSchema, { method: 'POST' });
      if (r.status === 'deleted') {
        await supabase.auth.signOut({ scope: 'local' });
        router.replace('/login');
      } else {
        setRequested(true);
        refresh();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    const partner = me?.kind === 'partner';
    void confirmAction({
      title: t('Delete my account?'),
      message: partner
        ? t('The HairOriginals team will close your account. Your login, documents and contact details are removed. Records of sales, commissions and payouts are kept, as tax law requires. Any commission you are owed is settled first.')
        : t('Your login will be deleted now. You have not registered, so nothing else is stored.'),
      confirmLabel: partner ? t('Request deletion') : t('Delete'),
      destructive: true,
    }).then((ok) => {
      if (ok) void deleteAccount();
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={t('Settings')} />
        <View style={styles.body}>
          <Text style={styles.section}>{t('Language')}</Text>
          <View style={styles.langs}>
            {LANGUAGES.map((l) => {
              const on = l.code === language;
              return (
                <Pressable
                  key={l.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => void setLanguage(l.code)}
                  style={[styles.lang, on && styles.langOn]}
                >
                  <Text style={[styles.langText, on && { color: colors.white }]}>{l.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Body style={styles.note}>{t('Some messages from the HairOriginals team are only available in English.')}</Body>

          <Text style={styles.section}>{t('Privacy')}</Text>
          <Card style={styles.card}>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)}>
              <Text style={styles.link}>{t('Privacy policy')}</Text>
            </Pressable>
          </Card>

          {canDelete ? (
            <>
              <Text style={styles.section}>{t('Account')}</Text>
              {requested ? (
                <Notice>{t('Your request was sent. The HairOriginals team will close your account and contact you if anything needs settling first.')}</Notice>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              {requested ? null : <Button variant="ghost" label={isPartner ? t('Delete my account') : t('Delete my login')} onPress={confirmDelete} loading={busy} />}
            </>
          ) : null}

          <Button label={t('Log out')} onPress={() => void signOut()} style={{ marginTop: 24 }} />
          <Text style={styles.version}>HO Connect {Constants.expoConfig?.version ?? ''}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  section: { marginTop: 24, marginBottom: 10, fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  langs: { flexDirection: 'row', gap: 10 },
  lang: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  langOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  note: { marginTop: 10, fontSize: 13, lineHeight: 19 },
  card: { padding: 16 },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary },
  version: { marginTop: 16, textAlign: 'center', fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
});
