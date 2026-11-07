import { createLeadResponseSchema, leadInputSchema, leadOptionsSchema, type LeadOptions, type PreferredMode } from '@hoc/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice, SelectField, TextField } from '@/components/form';
import { Button, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fieldErrors } from '@/lib/registration';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

export default function NewLead() {
  const [options, setOptions] = useState<LeadOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [mode, setMode] = useState<PreferredMode>('ho_decides');
  const [centreId, setCentreId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/v1/partner/lead-options', leadOptionsSchema).then(setOptions, (e: unknown) => setLoadError(errorMessage(e)));
  }, []);

  const centreOptions = useMemo(
    () => (options?.centres ?? []).map((c) => ({ value: c.id, label: c.name, sublabel: c.city })),
    [options],
  );

  async function submit() {
    setError(null);
    const body = {
      customerName: name,
      customerPhone: phone,
      categoryIds,
      city,
      pincode,
      preferredMode: mode,
      preferredCentreId: mode === 'ec_visit' ? centreId : null,
      notes,
    };
    const parsed = leadInputSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      setError(t('Please fix the highlighted fields.'));
      return;
    }
    setSaving(true);
    try {
      const res = await api('/v1/partner/leads', createLeadResponseSchema, { method: 'POST', json: body });
      if (res.lead.consent.pending) {
        router.replace({ pathname: '/leads/[id]/confirm', params: { id: res.lead.id, ...(res.devCode ? { devCode: res.devCode } : {}), ...(res.smsSent ? {} : { smsFailed: '1' }) } });
      } else {
        router.replace({ pathname: '/leads/[id]', params: { id: res.lead.id } });
      }
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  const clear = (k: string) => setErrors((e) => ({ ...e, [k]: '' }));

  if (loadError) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t("Add a lead")} />
        <View style={styles.body}>
          <Notice tone="error">{loadError}</Notice>
        </View>
      </SafeAreaView>
    );
  }
  if (!options) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const limitReached = options.addedToday >= options.dailyLimit;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <ScreenHeader title={t("Add a lead")} />
          <View style={styles.body}>
            {options.benefit ? (
              <View style={styles.benefit}>
                <Text style={styles.benefitLabel}>{t("TELL YOUR CUSTOMER")}</Text>
                <Text style={styles.benefitText}>{options.benefit.partnerText ?? options.benefit.customerText}</Text>
              </View>
            ) : null}
            {limitReached ? (
              <Notice tone="warn">{t("You've added {n} leads today, the daily limit. You can add more tomorrow.", { n: options.addedToday })}</Notice>
            ) : null}

            <TextField
              label={t("Customer's name")}
              value={name}
              onChangeText={(v) => {
                setName(v);
                clear('customerName');
              }}
              error={errors.customerName}
              autoCapitalize="words"
            />
            <TextField
              label={t("Customer's mobile number")}
              value={phone}
              onChangeText={(v) => {
                setPhone(v.replace(/\D/g, '').slice(0, 10));
                clear('customerPhone');
              }}
              error={errors.customerPhone}
              keyboardType="number-pad"
              maxLength={10}
              placeholder={t("10-digit mobile")}
            />

            <Text style={styles.label}>{t("Interested in")}</Text>
            <View style={styles.chips}>
              {options.categories.map((c) => {
                const on = categoryIds.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      setCategoryIds(on ? categoryIds.filter((x) => x !== c.id) : [...categoryIds, c.id]);
                      clear('categoryIds');
                    }}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && { color: colors.white }]}>{t(c.name)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.categoryIds ? <Text style={styles.error}>{errors.categoryIds}</Text> : null}

            <View style={styles.row}>
              <View style={{ flex: 1.4 }}>
                <TextField label={t("City (optional)")} value={city} onChangeText={setCity} autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("Pincode")}
                  value={pincode}
                  onChangeText={(v) => {
                    setPincode(v.replace(/\D/g, '').slice(0, 6));
                    clear('pincode');
                  }}
                  error={errors.pincode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>

            <Text style={styles.label}>{t("The customer would like")}</Text>
            <View style={styles.modes} accessibilityRole="radiogroup">
              {options.preferredModes.map((m) => {
                const on = mode === m.value;
                return (
                  <Pressable
                    key={m.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setMode(m.value)}
                    style={[styles.mode, on && styles.modeOn]}
                  >
                    <View style={[styles.radio, on && styles.radioOn]} />
                    <Text style={styles.modeText}>{t(m.label)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {mode === 'ec_visit' ? (
              <SelectField
                label={t("Which experience centre?")}
                value={centreId}
                options={centreOptions}
                onChange={(v) => {
                  setCentreId(v);
                  clear('preferredCentreId');
                }}
                error={errors.preferredCentreId}
                placeholder={t("Choose a centre")}
                searchPlaceholder={t("Search by city or centre")}
              />
            ) : null}

            <TextField
              label={t("Notes for HairOriginals (optional)")}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={500}
              placeholder={t("Anything that helps, e.g. best time to call")}
            />

            {options.requireOtp ? (
              <Notice>
                {t("We'll send the customer a 6-digit code by SMS. Ask them to read it out to you: entering it confirms they agree to HairOriginals contacting them.")}
              </Notice>
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label={options.requireOtp ? t('Add and send code') : t('Add lead')} onPress={submit} loading={saving} disabled={limitReached} />
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
  benefit: { backgroundColor: colors.espresso, borderRadius: 14, padding: 16, marginBottom: 20 },
  benefitLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.6, color: colors.brassSoft },
  benefitText: { marginTop: 6, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.white },
  label: { marginBottom: 8, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  error: { marginTop: -8, marginBottom: 16, fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  row: { flexDirection: 'row', gap: 12 },
  modes: { marginBottom: 16, gap: 8 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  modeOn: { borderColor: colors.primary, backgroundColor: colors.blush },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.muted },
  radioOn: { borderColor: colors.primary, borderWidth: 6 },
  modeText: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
});
