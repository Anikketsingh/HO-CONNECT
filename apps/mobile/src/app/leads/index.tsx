import { partnerLeadListSchema, type PartnerLead, type PartnerLeadFilter } from '@hoc/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Button, Card, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { shortDate, shortDateTime, stageColor } from '@/lib/lead-style';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

const FILTERS: { key: PartnerLeadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'active', label: 'In progress' },
  { key: 'purchased', label: 'Purchased' },
  { key: 'closed', label: 'Closed' },
];

type Counts = Record<'all' | 'waiting' | 'active' | 'purchased' | 'closed', number>;

function LeadCard({ lead }: { lead: PartnerLead }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/leads/[id]', params: { id: lead.id } })}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      <Card style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.name}>{lead.customerName}</Text>
          <Text style={styles.date}>{shortDate(lead.stageChangedAt)}</Text>
        </View>
        <Text style={styles.phone}>
          {lead.customerPhone} · {lead.ref}
        </Text>
        <View style={styles.stageRow}>
          <View style={[styles.dot, { backgroundColor: stageColor(lead.stage) }]} />
          <Text style={styles.stage}>{t(lead.stageLabel)}</Text>
        </View>
        {lead.customerTypeLabel && lead.stage !== 'invalid' ? <Text style={styles.type}>{t(lead.customerTypeLabel)}</Text> : null}
        {lead.commission ? <Text style={styles.commission}>{lead.commission.label}</Text> : null}
        {lead.consultation ? (
          <Text style={styles.consult}>
            {t(lead.consultation.modeLabel)}
            {lead.consultation.at ? ` · ${shortDateTime(lead.consultation.at)}` : ''}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export default function MyLeads() {
  const [filter, setFilter] = useState<PartnerLeadFilter>('all');
  const [items, setItems] = useState<PartnerLead[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, f: PartnerLeadFilter) => {
      try {
        const res = await api(`/v1/partner/leads?filter=${f}&page=${nextPage}`, partnerLeadListSchema);
        setItems((prev) => (nextPage === 1 ? res.items : [...prev, ...res.items]));
        setCounts(res.counts);
        setPage(nextPage);
        setHasMore(res.hasMore);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void load(1, filter);
    }, [load, filter]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => <LeadCard lead={item} />}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasMore && !loading) {
            setLoading(true);
            void load(page + 1, filter);
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load(1, filter);
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <ScreenHeader title={t("My leads")} />
            <View style={styles.headerBody}>
              <Button label={t("+ Add a lead")} onPress={() => router.push('/leads/new')} />
              <View style={styles.filters}>
                {FILTERS.map((f) => {
                  const on = f.key === filter;
                  return (
                    <Pressable
                      key={f.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        setFilter(f.key);
                        setLoading(true);
                      }}
                      style={[styles.filter, on && styles.filterOn]}
                    >
                      <Text style={[styles.filterText, on && { color: colors.white }]}>
                        {t(f.label)}
                        {counts ? ` ${counts[f.key]}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {error ? <Notice tone="error">{error}</Notice> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{filter === 'all' ? 'No leads yet' : 'Nothing here'}</Text>
              <Body style={{ textAlign: 'center' }}>
                {filter === 'all' ? 'Add a client who is interested in HairOriginals, and follow their progress here.' : 'Leads move here as they progress.'}
              </Body>
            </View>
          )
        }
        ListFooterComponent={hasMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  list: { paddingBottom: 48 },
  headerBody: { paddingHorizontal: 24 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, marginBottom: 16 },
  filter: { paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, justifyContent: 'center' },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  card: { marginHorizontal: 24, marginBottom: 10, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  date: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  phone: { marginTop: 2, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stage: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  type: { marginTop: 4, marginLeft: 16, fontFamily: fonts.medium, fontSize: 13, color: colors.primaryDeep },
  consult: { marginTop: 4, marginLeft: 16, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  commission: { marginTop: 4, marginLeft: 16, fontFamily: fonts.semibold, fontSize: 13, color: colors.sage },
  empty: { alignItems: 'center', paddingHorizontal: 32, marginTop: 32 },
  emptyTitle: { marginBottom: 8, fontFamily: fonts.display, fontSize: 24, color: colors.espresso },
});
