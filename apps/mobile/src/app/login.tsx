import { normalizeIndianMobile, toE164 } from '@hoc/shared';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, ErrorText, Logo, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

const RESEND_SECONDS = 60;

function formatMobile(mobile10: string): string {
  return `+91 ${mobile10.slice(0, 5)} ${mobile10.slice(5)}`;
}

/** Supabase / hook errors → words a partner can act on. */
function friendly(message: string): string {
  if (/expired|invalid/i.test(message)) return t('That code is wrong or has expired. Check the SMS or ask for a new one.');
  if (/security purposes|rate limit|too many/i.test(message)) return t('Please wait a minute before asking for another code.');
  if (/network|fetch/i.test(message)) return t('No internet connection. Check your network and try again.');
  return message;
}

export default function Login() {
  const { state } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const mobile = normalizeIndianMobile(digits);

  async function sendCode() {
    if (!mobile) {
      setError(t('Enter a valid 10-digit mobile number.'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: toE164(mobile) });
    setBusy(false);
    if (otpError) {
      setError(friendly(otpError.message));
      return;
    }
    setStep('code');
    setCode('');
    setResendIn(RESEND_SECONDS);
    setTimeout(() => codeInput.current?.focus(), 300);
  }

  async function verify(value: string) {
    if (value.length !== 6 || !mobile || busy) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone: toE164(mobile), token: value, type: 'sms' });
    setBusy(false);
    if (verifyError) setError(friendly(verifyError.message));
    else setVerified(true); // the AuthProvider now loads the profile; the redirect below takes over
  }

  if (state.status === 'ready' || state.status === 'error') return <Redirect href="/home" />;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Logo width={104} />
          <Text style={styles.eyebrow}>{t("HO CONNECT")}</Text>

          {step === 'phone' ? (
            <View>
              <Title>{t("Refer clients to HairOriginals and earn.")}</Title>
              <Body style={styles.lead}>{t("Log in with your mobile number. We'll send you a 6-digit code.")}</Body>

              <Text style={styles.label} nativeID="mobileLabel">
                {t("Mobile number")}
              </Text>
              <View style={[styles.inputRow, error ? styles.inputError : null]}>
                <Text style={styles.prefix}>+91</Text>
                <TextInput
                  accessibilityLabelledBy="mobileLabel"
                  style={styles.input}
                  value={digits}
                  onChangeText={(t) => {
                    setDigits(t.replace(/\D/g, '').slice(0, 10));
                    setError(null);
                  }}
                  onSubmitEditing={sendCode}
                  keyboardType="number-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.muted + '80'}
                  returnKeyType="done"
                />
              </View>
              {error ? <ErrorText>{error}</ErrorText> : null}

              <Button label={t("Send code")} onPress={sendCode} loading={busy} disabled={!mobile} style={styles.cta} />
              <Body style={styles.fine}>
                {t("HairOriginals reviews every partner account before you can add leads.")}
              </Body>
            </View>
          ) : (
            <View>
              <Title>{t("Enter the code")}</Title>
              <Body style={styles.lead}>We sent a 6-digit code to {formatMobile(mobile ?? digits)}.</Body>

              <TextInput
                ref={codeInput}
                accessibilityLabel={t("6-digit code")}
                style={[styles.codeInput, error ? styles.inputError : null]}
                value={code}
                onChangeText={(t) => {
                  const v = t.replace(/\D/g, '').slice(0, 6);
                  setCode(v);
                  setError(null);
                  if (v.length === 6) void verify(v);
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={colors.line}
              />
              {error ? <ErrorText>{error}</ErrorText> : null}

              <Button
                label={t("Verify")}
                onPress={() => void verify(code)}
                loading={busy || (verified && state.status === 'loading')}
                disabled={code.length !== 6}
                style={styles.cta}
              />
              <Button
                variant="ghost"
                label={resendIn > 0 ? t('Resend code in {s}s', { s: resendIn }) : t('Resend code')}
                onPress={sendCode}
                disabled={resendIn > 0 || busy}
              />
              <Button
                variant="ghost"
                label={t("Change number")}
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setError(null);
                }}
                disabled={busy}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  eyebrow: { marginTop: 40, marginBottom: 12, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 2, color: colors.primary },
  lead: { marginTop: 12, marginBottom: 32 },
  label: { marginBottom: 8, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    marginBottom: 8,
  },
  inputError: { borderColor: colors.danger },
  prefix: {
    paddingHorizontal: 14,
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.ink,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    lineHeight: 56,
  },
  input: { flex: 1, height: 56, paddingHorizontal: 14, fontFamily: fonts.medium, fontSize: 18, letterSpacing: 1, color: colors.ink },
  codeInput: {
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
    marginBottom: 8,
  },
  cta: { marginTop: 16, marginBottom: 8 },
  fine: { marginTop: 16, fontSize: 13, lineHeight: 19 },
});
