import { earningsSchema, formatINR, type Earnings } from '@hoc/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Card, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { shortDate } from '@/lib/lead-style';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

export default function EarningsScreen() {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api('/v1/partner/earnings', earningsSchema));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!data && !error) {
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
        <ScreenHeader title={t("Earnings")} />
        <View style={styles.body}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {data ? (
            <>
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>{t("PAID TO YOU")}</Text>
                <Text style={styles.heroValue}>{formatINR(data.totals.paidPaise)}</Text>
              </View>
              <View style={styles.tiles}>
                <Tile label={t("Pending")} value={data.totals.pendingPaise} hint={t("Waiting for the return period")} />
                <Tile label={t("Approved")} value={data.totals.approvedPaise} hint={t("In your next payout")} />
                <Tile label={t("Being paid")} value={data.totals.beingPaidPaise} hint={t("Payment in progress")} />
              </View>
              <Pressable onPress={() => router.push('/me/rate-card')} accessibilityRole="button" style={styles.linkRow}>
                <Text style={styles.link}>{t("See how commission is worked out ›")}</Text>
              </Pressable>

              <Text style={styles.section}>{t("Payouts")}</Text>
              {data.payouts.length === 0 ? (
                <Body>{t("No payouts yet. Approved commission is paid in batches.")}</Body>
              ) : (
                data.payouts.map((p) => (
                  <Card key={p.id} style={styles.item}>
                    <View style={styles.itemTop}>
                      <Text style={styles.itemTitle}>{p.label}</Text>
                      <Text style={styles.itemAmount}>{formatINR(p.netPaise)}</Text>
                    </View>
                    <Text style={styles.itemSub}>
                      {p.status === 'paid' ? t('Paid {date} · Ref {utr}', { date: p.paidAt ? shortDate(p.paidAt) : '', utr: p.utr ?? '' }) : t('Payment in progress')}
                    </Text>
                    {p.tdsPaise || p.clawbackPaise ? (
                      <Text style={styles.itemSub}>
                        {t('Commission {amount}', { amount: formatINR(p.grossPaise) })}
                        {p.clawbackPaise ? ` − ${t('returned sales {amount}', { amount: formatINR(p.clawbackPaise) })}` : ''}
                        {p.tdsPaise ? ` − ${t('TDS {amount}', { amount: formatINR(p.tdsPaise) })}` : ''}
                      </Text>
                    ) : null}
                  </Card>
                ))
              )}

              <Text style={styles.section}>{t("Commissions")}</Text>
              {data.entries.length === 0 ? (
                <Body>{t("Commission appears here when a client you referred makes their first purchase.")}</Body>
              ) : (
                data.entries.map((e) => (
                  <Pressable key={e.id} onPress={() => router.push({ pathname: '/leads/[id]', params: { id: e.leadId } })} accessibilityRole="button">
                    <Card style={styles.item}>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemTitle}>{e.customerName}</Text>
                        <Text style={[styles.itemAmount, ['reversed', 'rejected'].includes(e.status) && styles.struck]}>{formatINR(e.amountPaise)}</Text>
                      </View>
                      <Text style={styles.itemSub}>
                        {e.ref} · {e.label} · {shortDate(e.createdAt)}
                      </Text>
                    </Card>
                  </Pressable>
                ))
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{formatINR(value)}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  hero: { backgroundColor: colors.espresso, borderRadius: 18, padding: 22, marginBottom: 12 },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.8, color: colors.brassSoft },
  heroValue: { marginTop: 6, fontFamily: fonts.display, fontSize: 40, color: colors.white },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12 },
  tileValue: { fontFamily: fonts.bold, fontSize: 16, color: colors.espresso },
  tileLabel: { marginTop: 2, fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  tileHint: { marginTop: 4, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.muted },
  linkRow: { marginTop: 14, paddingVertical: 6 },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary },
  section: { marginTop: 24, marginBottom: 10, fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  item: { marginBottom: 8, padding: 14 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  itemTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  itemAmount: { fontFamily: fonts.bold, fontSize: 16, color: colors.sage },
  struck: { color: colors.muted, textDecorationLine: 'line-through' },
  itemSub: { marginTop: 3, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
});
