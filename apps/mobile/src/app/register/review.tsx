import { partnerApplicationSchema } from '@hoc/shared';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Checkbox, Notice, StepHeader } from '@/components/form';
import { Button, Card } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRegistration, type RegistrationStep } from '@/lib/registration';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

function Section({ title, step, children }: { title: string; step: RegistrationStep; children: ReactNode }) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable
          onPress={() => router.push({ pathname: step, params: { from: 'review' } })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('Edit {title}', { title })}
        >
          <Text style={styles.edit}>{t("Edit")}</Text>
        </Pressable>
      </View>
      {children}
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value || '—'}</Text>
    </View>
  );
}

export default function ReviewStep() {
  const { refresh } = useAuth();
  const { options, application } = useRegistration();
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!application || !options) return null;
  const terms = options.terms;
  const required = application.checklist.filter((c) => c.documentType.required);
  const uploaded = required.filter((c) => c.documents.some((d) => d.status !== 'rejected')).length;
  const resubmitting = application.status === 'changes_requested';

  async function submit() {
    if (!terms) return;
    setSubmitting(true);
    setError(null);
    try {
      await api('/v1/partner/application/submit', partnerApplicationSchema, {
        method: 'POST',
        json: { acceptTermsVersion: terms.version },
      });
      refresh();
      // Back to the existing home screen (it reloads on focus and shows "under review").
      router.dismissTo('/home');
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <StepHeader step={4} title={t("Check and submit")} subtitle={t("Check your details before sending them to the HairOriginals team.")} />
        <View style={styles.body}>
          <Section title={t("Business")} step="/register">
            <Line label={t("Type")} value={t(application.partnerType.name)} />
            <Line label={t("Business")} value={application.businessName} />
            <Line label={t("Owner")} value={application.ownerName} />
            <Line label={t("Address")} value={[application.addressLine, application.city, application.state, application.pincode].filter(Boolean).join(', ')} />
            <Line label={t("Nearest EC")} value={application.homeCentre ? `${application.homeCentre.name}, ${application.homeCentre.city}` : null} />
          </Section>

          <Section title={t("Tax and payout")} step="/register/payout">
            <Line label="PAN" value={application.panLast4 ? `••••••${application.panLast4}` : null} />
            <Line label="GSTIN" value={application.gstin ?? t('Not registered')} />
            <Line label={t("Payout")} value={application.payoutDisplay} />
          </Section>

          <Section title={t("Documents")} step="/register/documents">
            <Text style={styles.docs}>
              {t('{done} of {total} required documents uploaded', { done: uploaded, total: required.length })}
            </Text>
          </Section>

          {application.blockers.length ? (
            <Notice tone="warn">
              <Text style={styles.blockTitle}>{t("Before you can submit")}</Text>
              {application.blockers.map((b) => (
                <Text key={b.key} style={styles.blockItem}>
                  • {b.message}
                </Text>
              ))}
            </Notice>
          ) : null}

          {terms ? (
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>{terms.title}</Text>
              <Pressable onPress={() => setShowTerms((v) => !v)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.edit, { marginTop: 8 }]}>{showTerms ? 'Hide terms' : 'Read the terms'}</Text>
              </Pressable>
              {showTerms ? <Text style={styles.terms}>{terms.body}</Text> : null}
              <View style={{ marginTop: 14 }}>
                <Checkbox checked={agreed} onChange={setAgreed}>
                  I have read and agree to the HO Connect partner terms (version {terms.version}).
                </Checkbox>
              </View>
            </Card>
          ) : (
            <Notice tone="error">{t("The partner terms aren't available right now. Please try again later.")}</Notice>
          )}

          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            label={resubmitting ? t('Resubmit application') : t('Submit application')}
            onPress={submit}
            loading={submitting}
            disabled={!agreed || !terms || application.blockers.length > 0}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  section: { marginBottom: 14, padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  edit: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  line: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  lineLabel: { width: 92, fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  lineValue: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.ink },
  docs: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  blockTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.espresso, marginBottom: 4 },
  blockItem: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.ink },
  terms: { marginTop: 10, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.ink },
});
