import { partnerLeadDetailSchema, type PartnerLeadDetail } from '@hoc/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Button, Card, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { shortDate, shortDateTime, stageColor } from '@/lib/lead-style';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<PartnerLeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [nudgeError, setNudgeError] = useState<string | null>(null);

  async function sendNudge() {
    setNudging(true);
    setNudgeError(null);
    try {
      setLead(await api(`/v1/partner/leads/${id}/nudge`, partnerLeadDetailSchema, { method: 'POST' }));
    } catch (e) {
      setNudgeError(errorMessage(e));
    } finally {
      setNudging(false);
    }
  }

  const load = useCallback(async () => {
    try {
      setLead(await api(`/v1/partner/leads/${id}`, partnerLeadDetailSchema));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!lead && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <ScreenHeader title={lead?.customerName ?? t('Lead')} />
        <View style={styles.body}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {lead ? (
            <>
              <Text style={styles.sub}>
                {lead.ref} · {lead.customerPhone} · added {shortDate(lead.createdAt)}
              </Text>

              <Card style={styles.status}>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: stageColor(lead.stage) }]} />
                  <Text style={styles.stage}>{t(lead.stageLabel)}</Text>
                </View>
                {lead.customerTypeLabel && lead.stage !== 'invalid' ? <Text style={styles.type}>{t(lead.customerTypeLabel)}</Text> : null}
                {lead.consultation ? (
                  <Text style={styles.detail}>
                    {t(lead.consultation.modeLabel)}
                    {lead.consultation.at ? ` · ${shortDateTime(lead.consultation.at)}` : ''}
                  </Text>
                ) : null}
                {lead.commission ? (
                  <Text style={[styles.commission, ['reversed', 'rejected'].includes(lead.commission.status) && { color: colors.muted }]}>
                    {lead.commission.label}
                  </Text>
                ) : null}
                {lead.ownedUntil && !lead.commission ? <Text style={styles.detail}>{t('Credited to you until {date}', { date: shortDate(lead.ownedUntil) })}</Text> : null}
              </Card>

              {lead.nudge.available || lead.nudge.reason ? (
                <Card style={styles.nudge}>
                  <Text style={styles.nudgeTitle}>{t("HairOriginals couldn't reach {name}", { name: lead.customerName.split(' ')[0] ?? '' })}</Text>
                  <Body style={styles.nudgeBody}>
                    {lead.nudge.available
                      ? t("You can send them a text reminder to take the team's call.")
                      : lead.nudge.reason}
                  </Body>
                  {nudgeError ? <Text style={styles.nudgeError}>{nudgeError}</Text> : null}
                  {lead.nudge.available ? <Button label={t("Send a reminder")} onPress={sendNudge} loading={nudging} /> : null}
                </Card>
              ) : null}

              {lead.consent.pending ? (
                <>
                  <Notice tone="warn">
                    {`${t('Waiting for the customer to confirm. Ask them for the 6-digit code from their SMS.')}${
                      lead.consent.expiresAt ? ` ${t('The lead closes on {date}.', { date: shortDateTime(lead.consent.expiresAt) })}` : ''
                    }`}
                  </Notice>
                  <Button label={t("Enter the code")} onPress={() => router.push({ pathname: '/leads/[id]/confirm', params: { id: lead.id } })} />
                </>
              ) : null}

              <Text style={styles.section}>{t("Details")}</Text>
              <Card>
                <Line label={t("Interested in")} value={lead.interests.map((x) => t(x)).join(', ')} />
                <Line label={t("Prefers")} value={lead.preferredCentre ? `${t(lead.preferredModeLabel)}: ${lead.preferredCentre}` : t(lead.preferredModeLabel)} />
                {lead.benefitText ? <Line label={t("Benefit")} value={lead.benefitText} /> : null}
              </Card>

              <Text style={styles.section}>{t("Timeline")}</Text>
              <Card>
                {[...lead.timeline].reverse().map((t, i) => (
                  <View key={i} style={[styles.event, i > 0 && styles.eventBorder]}>
                    <Text style={styles.eventLabel}>{t.label}</Text>
                    {t.detail ? <Text style={styles.detail}>{t.detail}</Text> : null}
                    <Text style={styles.eventAt}>{shortDateTime(t.at)}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  sub: { marginBottom: 16, fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  status: { marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stage: { flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.espresso },
  type: { marginTop: 8, fontFamily: fonts.semibold, fontSize: 14, color: colors.primaryDeep },
  commission: { marginTop: 10, fontFamily: fonts.bold, fontSize: 16, color: colors.sage },
  detail: { marginTop: 4, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.muted },
  nudge: { marginBottom: 16 },
  nudgeTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.espresso },
  nudgeBody: { marginTop: 6, marginBottom: 12, fontSize: 14, lineHeight: 21 },
  nudgeError: { marginBottom: 10, fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  section: { marginTop: 24, marginBottom: 10, fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  line: { flexDirection: 'row', gap: 12, paddingVertical: 5 },
  lineLabel: { width: 100, fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  lineValue: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.ink },
  event: { paddingVertical: 10 },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  eventLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  eventAt: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
});
