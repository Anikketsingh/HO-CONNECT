import { partnerApplicationSchema, partnerProfileInputSchema } from '@hoc/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice, SelectField, StepHeader, TextField } from '@/components/form';
import { Button } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fieldErrors, useRegistration } from '@/lib/registration';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

interface Form {
  partnerTypeId: string;
  businessName: string;
  ownerName: string;
  email: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  homeCentreId: string;
}

export default function BusinessStep() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { refresh } = useAuth();
  const { options, application, setApplication } = useRegistration();
  const typeLocked = !!application && application.status !== 'draft';

  const [form, setForm] = useState<Form>(() => ({
    partnerTypeId: application?.partnerType.id ?? '',
    businessName: application?.businessName ?? '',
    ownerName: application?.ownerName ?? '',
    email: application?.email ?? '',
    addressLine: application?.addressLine ?? '',
    city: application?.city ?? '',
    state: application?.state ?? '',
    pincode: application?.pincode ?? '',
    homeCentreId: application?.homeCentre?.id ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const centreOptions = useMemo(
    () => (options?.centres ?? []).map((c) => ({ value: c.id, label: c.name, sublabel: c.city })),
    [options],
  );
  const stateOptions = useMemo(() => (options?.states ?? []).map((s) => ({ value: s, label: s })), [options]);

  async function save() {
    setError(null);
    const parsed = partnerProfileInputSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      setError(t('Please fix the highlighted fields.'));
      return;
    }
    setSaving(true);
    try {
      const app = application
        ? await api('/v1/partner/application', partnerApplicationSchema, { method: 'PATCH', json: form })
        : await api('/v1/partner/register', partnerApplicationSchema, { method: 'POST', json: form });
      setApplication(app);
      if (!application) refresh(); // the user is now a partner
      if (from === 'review') router.back();
      else router.push('/register/payout');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!options) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <StepHeader step={1} title={t("About your business")} subtitle={t("This is how HairOriginals will know you.")} />
          <View style={styles.body}>
            {application?.status === 'changes_requested' && application.reviewNote ? (
              <Notice tone="warn">{`${t('From the HairOriginals team')}: ${application.reviewNote}`}</Notice>
            ) : null}

            <Text style={styles.label}>{t("I am a")}</Text>
            {typeLocked ? (
              <Notice>{`${t(application.partnerType.name)}. ${t("This can't be changed after review.")}`}</Notice>
            ) : (
              <View style={styles.types} accessibilityRole="radiogroup">
                {options.partnerTypes.map((pt) => {
                  const active = form.partnerTypeId === pt.id;
                  return (
                    <Pressable
                      key={pt.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => set('partnerTypeId')(pt.id)}
                      style={[styles.typeCard, active && styles.typeCardActive]}
                    >
                      <Text style={[styles.typeName, active && { color: colors.primaryDeep }]}>{t(pt.name)}</Text>
                      {pt.description ? <Text style={styles.typeDesc}>{t(pt.description)}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {errors.partnerTypeId ? <Text style={styles.error}>{t("Choose what kind of partner you are.")}</Text> : null}

            <TextField
              label={t("Business name")}
              value={form.businessName}
              onChangeText={set('businessName')}
              error={errors.businessName}
              placeholder="e.g. Glow Studio"
              autoCapitalize="words"
            />
            <TextField
              label={t("Your name")}
              value={form.ownerName}
              onChangeText={set('ownerName')}
              error={errors.ownerName}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
            />
            <TextField
              label={t("Email (optional)")}
              value={form.email}
              onChangeText={set('email')}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <TextField
              label={t("Shop or work address")}
              value={form.addressLine}
              onChangeText={set('addressLine')}
              error={errors.addressLine}
              multiline
              placeholder={t("Shop number, building, street, area")}
            />
            <View style={styles.row}>
              <View style={{ flex: 1.4 }}>
                <TextField label={t("City")} value={form.city} onChangeText={set('city')} error={errors.city} autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("Pincode")}
                  value={form.pincode}
                  onChangeText={(v) => set('pincode')(v.replace(/\D/g, '').slice(0, 6))}
                  error={errors.pincode}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="postalCode"
                />
              </View>
            </View>
            <SelectField label={t("State")} value={form.state || null} options={stateOptions} onChange={set('state')} error={errors.state} />
            <SelectField
              label={t("Nearest HairOriginals experience centre")}
              value={form.homeCentreId || null}
              options={centreOptions}
              onChange={set('homeCentreId')}
              error={errors.homeCentreId}
              placeholder={t("Choose a centre")}
              searchPlaceholder={t("Search by city or centre")}
            />

            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label={from === 'review' ? 'Save' : 'Save and continue'} onPress={save} loading={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  label: { marginBottom: 8, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  typeCard: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.white,
    padding: 14,
  },
  typeCardActive: { borderColor: colors.primary, backgroundColor: colors.blush },
  typeName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  typeDesc: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  row: { flexDirection: 'row', gap: 12 },
  error: { marginTop: -12, marginBottom: 16, fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
});
