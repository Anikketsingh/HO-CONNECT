import { partnerApplicationSchema, partnerPayoutStepSchema, payoutInputSchema } from '@hoc/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice, Segmented, StepHeader, TextField } from '@/components/form';
import { Button } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fieldErrors, useRegistration } from '@/lib/registration';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

export default function PayoutStep() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { application, setApplication } = useRegistration();

  // Saved PAN and payout details never come back in full, so they're shown masked with a "Change" option.
  const [changingPan, setChangingPan] = useState(!application?.panLast4);
  const [changingPayout, setChangingPayout] = useState(!application?.payoutDisplay);
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState(application?.gstin ?? '');
  const [method, setMethod] = useState<'upi' | 'bank'>(application?.payoutMethod ?? 'upi');
  const [upiId, setUpiId] = useState('');
  const [accountHolder, setAccountHolder] = useState(application?.ownerName ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmNumber, setConfirmNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    const errs: Record<string, string> = {};
    const body: Record<string, unknown> = {};

    if (changingPan) {
      const r = partnerPayoutStepSchema.shape.pan.safeParse(pan);
      if (r.success) body.pan = pan;
      else errs.pan = r.error.issues[0]?.message ?? 'Enter a valid PAN';
    }
    const g = partnerPayoutStepSchema.shape.gstin.safeParse(gstin);
    if (g.success) body.gstin = gstin;
    else errs.gstin = g.error.issues[0]?.message ?? 'Enter a valid GSTIN';

    if (changingPayout) {
      const payout = method === 'upi' ? { method, upiId } : { method, accountHolder, accountNumber, ifsc };
      const r = payoutInputSchema.safeParse(payout);
      if (!r.success) Object.assign(errs, fieldErrors(r.error.issues.map((i) => ({ ...i, path: i.path.slice(-1) }))));
      if (method === 'bank' && accountNumber.replace(/\s/g, '') !== confirmNumber.replace(/\s/g, '')) {
        errs.confirmNumber = t("Account numbers don't match");
      }
      body.payout = payout;
    }

    if (Object.keys(errs).length) {
      setErrors(errs);
      setError(t('Please fix the highlighted fields.'));
      return;
    }
    setSaving(true);
    try {
      setApplication(await api('/v1/partner/application', partnerApplicationSchema, { method: 'PATCH', json: body }));
      if (from === 'review') router.back();
      else router.push('/register/documents');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const clear = (key: string) => setErrors((e) => ({ ...e, [key]: '' }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <StepHeader
            step={2}
            title={t("Tax and payout")}
            subtitle={t("Commission is paid to this account. PAN is needed for TDS. Both are stored encrypted.")}
          />
          <View style={styles.body}>
            {changingPan ? (
              <TextField
                label="PAN"
                value={pan}
                onChangeText={(v) => {
                  setPan(v.toUpperCase().replace(/\s/g, '').slice(0, 10));
                  clear('pan');
                }}
                error={errors.pan}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                placeholder="ABCDE1234F"
              />
            ) : (
              <Saved label="PAN" value={`••••••${application?.panLast4}`} onChange={() => setChangingPan(true)} />
            )}

            <TextField
              label={t("GSTIN (only if GST-registered)")}
              value={gstin}
              onChangeText={(v) => {
                setGstin(v.toUpperCase().replace(/\s/g, '').slice(0, 15));
                clear('gstin');
              }}
              error={errors.gstin}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={15}
              placeholder={t("Leave empty if not registered")}
            />

            <Text style={styles.section}>{t("How should we pay you?")}</Text>
            {changingPayout ? (
              <>
                <Segmented
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: 'upi', label: 'UPI' },
                    { value: 'bank', label: t('Bank account') },
                  ]}
                />
                {method === 'upi' ? (
                  <TextField
                    label={t("UPI id")}
                    value={upiId}
                    onChangeText={(v) => {
                      setUpiId(v.trim());
                      clear('upiId');
                    }}
                    error={errors.upiId}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="name@okhdfcbank"
                  />
                ) : (
                  <>
                    <TextField
                      label={t("Account holder name")}
                      value={accountHolder}
                      onChangeText={(v) => {
                        setAccountHolder(v);
                        clear('accountHolder');
                      }}
                      error={errors.accountHolder}
                      autoCapitalize="words"
                    />
                    <TextField
                      label={t("Account number")}
                      value={accountNumber}
                      onChangeText={(v) => {
                        setAccountNumber(v.replace(/\D/g, '').slice(0, 18));
                        clear('accountNumber');
                      }}
                      error={errors.accountNumber}
                      keyboardType="number-pad"
                      secureTextEntry={confirmNumber.length > 0}
                    />
                    <TextField
                      label={t("Re-enter account number")}
                      value={confirmNumber}
                      onChangeText={(v) => {
                        setConfirmNumber(v.replace(/\D/g, '').slice(0, 18));
                        clear('confirmNumber');
                      }}
                      error={errors.confirmNumber}
                      keyboardType="number-pad"
                    />
                    <TextField
                      label="IFSC"
                      value={ifsc}
                      onChangeText={(v) => {
                        setIfsc(v.toUpperCase().replace(/\s/g, '').slice(0, 11));
                        clear('ifsc');
                      }}
                      error={errors.ifsc}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={11}
                      placeholder="HDFC0001234"
                      hint={t("Printed on your cheque book and passbook")}
                    />
                  </>
                )}
              </>
            ) : (
              <Saved label={t("Payout")} value={application?.payoutDisplay ?? ''} onChange={() => setChangingPayout(true)} />
            )}

            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label={from === 'review' ? 'Save' : 'Save and continue'} onPress={save} loading={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Saved({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <View style={styles.saved}>
      <View style={{ flex: 1 }}>
        <Text style={styles.savedLabel}>{label}</Text>
        <Text style={styles.savedValue}>{value}</Text>
      </View>
      <Pressable onPress={onChange} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Change {label}', { label })}>
        <Text style={styles.change}>{t("Change")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  section: { marginTop: 8, marginBottom: 12, fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 14,
    marginBottom: 16,
  },
  savedLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  savedValue: { marginTop: 2, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  change: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary },
});
