import { partnerApplicationSchema, partnerLeadListSchema, type MeResponse, type PartnerApplication } from '@hoc/shared';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Button, Card, Logo, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { nextRegistrationStep } from '@/lib/registration';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

function formatMobile(mobile10: string | null): string {
  return mobile10 ? `+91 ${mobile10.slice(0, 5)} ${mobile10.slice(5)}` : t('your mobile number');
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Unregistered({ me }: { me: Extract<MeResponse, { kind: 'unregistered' }> }) {
  return (
    <>
      <Title>{t("Welcome to HO Connect")}</Title>
      <Body style={styles.lead}>{t("You're logged in with {phone}.", { phone: formatMobile(me.phone) })}</Body>
      <Card>
        <Text style={styles.eyebrow}>{t("NEXT STEP")}</Text>
        <Text style={styles.cardTitle}>{t("Register your business")}</Text>
        <Body style={styles.cardBody}>
          {t("Tell us about your salon, parlour or freelance work, add your payout details and upload a few documents. You can stop at any point and continue later.")}
        </Body>
        <Button label={t("Start registration")} onPress={() => router.push('/register')} style={{ marginTop: 18 }} />
      </Card>
    </>
  );
}

function PartnerStatus({ app }: { app: PartnerApplication }) {
  const remaining = app.blockers.length;
  switch (app.status) {
    case 'draft':
      return (
        <>
          <Title>{t("Finish your registration")}</Title>
          <Body style={styles.lead}>
            {remaining === 0 ? t('Everything is ready. Review and submit your application.') : remaining === 1 ? t('1 thing left to do.') : t('{n} things left to do.', { n: remaining })}
          </Body>
          <Button label={t("Continue")} onPress={() => router.push(nextRegistrationStep(app))} />
        </>
      );
    case 'submitted':
      return (
        <>
          <Title>{t("Application under review")}</Title>
          <Body style={styles.lead}>
            {t("The HairOriginals team is checking your details and documents. We'll update this screen when they're done.")}
          </Body>
          <Card style={styles.statusCard}>
            <Text style={styles.cardTitle}>{app.businessName}</Text>
            <Body style={styles.cardBody}>
              {t('Submitted {date}', { date: app.submittedAt ? dateFmt.format(new Date(app.submittedAt)) : '' })} · {app.partnerType.name}
            </Body>
          </Card>
        </>
      );
    case 'changes_requested':
      return (
        <>
          <Title>{t("A few changes needed")}</Title>
          <Body style={styles.lead}>{t("The HairOriginals team asked you to update your application.")}</Body>
          {app.reviewNote ? <Notice tone="warn">{app.reviewNote}</Notice> : null}
          <Button label={t("Update application")} onPress={() => router.push(nextRegistrationStep(app))} />
        </>
      );
    case 'approved':
      return <ApprovedHome app={app} />;
    case 'rejected':
      return (
        <>
          <Title>{t("Application not approved")}</Title>
          <Body style={styles.lead}>{t("Contact HairOriginals if you think this is a mistake.")}</Body>
          {app.reviewNote ? <Notice tone="error">{app.reviewNote}</Notice> : null}
        </>
      );
    case 'suspended':
      return (
        <>
          <Title>{t("Account paused")}</Title>
          <Body style={styles.lead}>{t("Your partner account is paused. Contact HairOriginals for details.")}</Body>
          {app.reviewNote ? <Notice tone="error">{app.reviewNote}</Notice> : null}
        </>
      );
  }
}

type LeadCounts = { all: number; waiting: number; active: number; purchased: number; closed: number };

function ApprovedHome({ app }: { app: PartnerApplication }) {
  const [counts, setCounts] = useState<LeadCounts | null>(null);
  useFocusEffect(
    useCallback(() => {
      api('/v1/partner/leads?filter=all&page=1', partnerLeadListSchema).then(
        (r) => setCounts(r.counts),
        () => setCounts(null),
      );
    }, []),
  );
  const tiles: { key: keyof LeadCounts; label: string }[] = [
    { key: 'waiting', label: t('Waiting to confirm') },
    { key: 'active', label: t('In progress') },
    { key: 'purchased', label: t('Purchased') },
  ];
  return (
    <>
      <Title>{t('Hello, {name}', { name: app.ownerName?.split(' ')[0] ?? t('partner') })}</Title>
      <Body style={styles.lead}>{t("Refer a client to HairOriginals and follow their progress here.")}</Body>
      <Button label={t("+ Add a lead")} onPress={() => router.push('/leads/new')} />
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Pressable key={tile.key} onPress={() => router.push('/leads')} style={styles.tile} accessibilityRole="button">
            <Text style={styles.tileValue}>{counts ? counts[tile.key] : '–'}</Text>
            <Text style={styles.tileLabel}>{tile.label}</Text>
          </Pressable>
        ))}
      </View>
      <Button variant="ghost" label={`${t('See all my leads')}${counts ? ` (${counts.all})` : ''}`} onPress={() => router.push('/leads')} />
      <View style={styles.actions}>
        {[
          { label: t('Earnings'), sub: t('Commission and payouts'), to: '/me/earnings' },
          { label: t('My QR and link'), sub: t('Referral and AI try-on QR codes'), to: '/me/share' },
          { label: t('My rates'), sub: t('How commission is worked out'), to: '/me/rate-card' },
        ].map((a) => (
          <Pressable key={a.to} onPress={() => router.push(a.to as never)} accessibilityRole="button" style={styles.action}>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>{a.label}</Text>
              <Text style={styles.actionSub}>{a.sub}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.codeCard, { marginTop: 24 }]}>
        <Text style={styles.codeLabel}>{t("YOUR PARTNER CODE")}</Text>
        <Text style={styles.code} selectable>
          {app.code}
        </Text>
        <Text style={styles.codeHint}>{t("This code identifies you to the HairOriginals team.")}</Text>
      </View>
    </>
  );
}

export default function Home() {
  const { state, refresh } = useAuth();
  const isPartner = state.status === 'ready' && state.me.kind === 'partner';
  const [app, setApp] = useState<PartnerApplication | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadApplication = useCallback(async () => {
    if (!isPartner) return;
    try {
      setApp(await api('/v1/partner/application', partnerApplicationSchema));
      setAppError(null);
    } catch (e) {
      setAppError(errorMessage(e));
    }
  }, [isPartner]);

  // Reload whenever the screen comes back into view (e.g. after submitting).
  useFocusEffect(
    useCallback(() => {
      void loadApplication();
    }, [loadApplication]),
  );

  async function onRefresh() {
    setRefreshing(true);
    refresh();
    await loadApplication();
    setRefreshing(false);
  }

  if (state.status === 'signed_out') return <Redirect href="/login" />;
  if (state.status === 'loading' && !app) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  let content;
  if (state.status === 'error') {
    content = (
      <>
        <Title>{t("Can't reach HO Connect")}</Title>
        <Body style={styles.lead}>{state.message}</Body>
        <Body style={styles.hint}>
          In development: make sure the API is running (npm run dev:api) and this phone is on the same Wi-Fi as your
          computer. The app is calling {API_URL}.
        </Body>
        <Button label={t("Try again")} onPress={refresh} />
      </>
    );
  } else if (state.status === 'ready' && state.me.kind === 'unregistered') {
    content = <Unregistered me={state.me} />;
  } else if (state.status === 'ready' && state.me.kind === 'admin') {
    content = (
      <>
        <Title>{t("This is a dashboard account")}</Title>
        <Body style={styles.lead}>
          {t("HairOriginals team members use the HO Connect dashboard on a computer. Partners use this app.")}
        </Body>
      </>
    );
  } else if (app) {
    content = <PartnerStatus app={app} />;
  } else if (appError) {
    content = (
      <>
        <Notice tone="error">{appError}</Notice>
        <Button label={t("Try again")} onPress={loadApplication} />
      </>
    );
  } else {
    content = <ActivityIndicator color={colors.primary} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Logo width={84} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} hitSlop={12}>
          <Text style={styles.logout}>{t('Settings')}</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  logout: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary },
  scroll: { padding: 24, paddingTop: 32 },
  lead: { marginTop: 12, marginBottom: 24 },
  hint: { marginBottom: 24, fontSize: 14, lineHeight: 21 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.6, color: colors.primary },
  cardTitle: { marginTop: 6, fontFamily: fonts.bold, fontSize: 19, color: colors.espresso },
  cardBody: { marginTop: 8, fontSize: 15, lineHeight: 22 },
  statusCard: { borderLeftWidth: 4, borderLeftColor: colors.brass },
  codeCard: { backgroundColor: colors.espresso, borderRadius: 18, padding: 24, marginBottom: 16 },
  codeLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.8, color: colors.brassSoft },
  code: { marginTop: 8, fontFamily: fonts.bold, fontSize: 36, letterSpacing: 4, color: colors.white },
  codeHint: { marginTop: 8, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.blush },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 4 },
  tile: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14 },
  tileValue: { fontFamily: fonts.display, fontSize: 28, color: colors.espresso },
  actions: { marginTop: 12, gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16 },
  actionLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  actionSub: { marginTop: 2, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  chev: { fontFamily: fonts.medium, fontSize: 24, color: colors.muted },
  tileLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.muted },
});
