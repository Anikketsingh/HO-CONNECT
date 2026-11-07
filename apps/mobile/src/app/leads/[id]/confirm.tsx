import { partnerLeadDetailSchema, resendResponseSchema, type PartnerLeadDetail } from '@hoc/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Button, ErrorText, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

const RESEND_SECONDS = 60;

/** The customer reads out the SMS code; entering it records their consent. */
export default function ConfirmLead() {
  const params = useLocalSearchParams<{ id: string; devCode?: string; smsFailed?: string }>();
  const [lead, setLead] = useState<PartnerLeadDetail | null>(null);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(params.devCode ?? null);
  const [error, setError] = useState<string | null>(params.smsFailed ? t("The code couldn't be sent. Tap Resend code.") : null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(params.smsFailed ? 0 : RESEND_SECONDS);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    api(`/v1/partner/leads/${params.id}`, partnerLeadDetailSchema).then(setLead, (e: unknown) => setError(errorMessage(e)));
  }, [params.id]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/partner/leads/${params.id}/confirm`, partnerLeadDetailSchema, { method: 'POST', json: { code: value } });
      router.replace({ pathname: '/leads/[id]', params: { id: params.id } });
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
      setBusy(false);
      input.current?.focus();
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/v1/partner/leads/${params.id}/resend`, resendResponseSchema, { method: 'POST' });
      setDevCode(r.devCode ?? null);
      setResendIn(RESEND_SECONDS);
      setLead(await api(`/v1/partner/leads/${params.id}`, partnerLeadDetailSchema));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!lead && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const firstName = lead?.customerName.split(' ')[0] ?? t('the customer');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <ScreenHeader title={t('Ask {name} for the code', { name: firstName })} />
          <View style={styles.body}>
            <Body>
              {t('We sent a 6-digit code by SMS to {phone}. Ask them to read it out. Entering it confirms they agree to HairOriginals contacting them about your referral.', { phone: lead?.customerPhone ?? t('the customer') })}
            </Body>

            {devCode ? (
              <Notice tone="warn" style={{ marginTop: 16 }}>{`Development mode, no SMS sent. The code is ${devCode}.`}</Notice>
            ) : null}

            <TextInput
              ref={input}
              autoFocus
              accessibilityLabel={t("6-digit code")}
              style={[styles.code, error ? { borderColor: colors.danger } : null]}
              value={code}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (v.length === 6) void verify(v);
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={colors.line}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}

            <Button label={t("Confirm")} onPress={() => void verify(code)} loading={busy} disabled={code.length !== 6} style={{ marginTop: 16 }} />
            {lead?.consent.canResend ? (
              <Button
                variant="ghost"
                label={resendIn > 0 ? t('Resend code in {s}s', { s: resendIn }) : t('Resend code')}
                onPress={resend}
                disabled={resendIn > 0 || busy}
              />
            ) : (
              <Text style={styles.hint}>{t("The code can't be sent again. Ask the customer to check their messages.")}</Text>
            )}
            <Button
              variant="ghost"
              label={t("The customer will confirm later")}
              onPress={() => router.replace({ pathname: '/leads/[id]', params: { id: params.id } })}
            />
            {lead?.consent.expiresAt ? (
              <Text style={styles.hint}>
                {t('The lead stays open until {date}.', { date: new Date(lead.consent.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  code: {
    marginTop: 24,
    marginBottom: 8,
    height: 64,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 28,
    letterSpacing: 12,
    color: colors.ink,
  },
  hint: { marginTop: 8, textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
});
