import { rateCardSchema, type RateCard } from '@hoc/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice } from '@/components/form';
import { Body, Card, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

export default function RateCardScreen() {
  const [card, setCard] = useState<RateCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api('/v1/partner/rate-card', rateCardSchema).then(setCard, (e: unknown) => setError(errorMessage(e)));
  }, []);

  if (!card && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={t("Your rates")} />
        <View style={styles.body}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {card ? (
            <>
              {card.lines.length === 0 ? (
                <Notice tone="warn">{t("Your commission rates haven't been set up yet. Ask the HairOriginals team.")}</Notice>
              ) : (
                card.lines.map((l, i) => (
                  <Card key={i} style={styles.line}>
                    <Text style={styles.rate}>{l.rate}</Text>
                    <Text style={styles.what}>
                      {l.product}
                      {l.customer ? ` · ${l.customer}` : ''}
                    </Text>
                    {l.limits ? <Text style={styles.limits}>{l.limits}</Text> : null}
                  </Card>
                ))
              )}
              <Text style={styles.section}>{t("Good to know")}</Text>
              {card.notes.map((n, i) => (
                <Body key={i} style={styles.note}>
                  • {n}
                </Body>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  scroll: { paddingBottom: 48 },
  body: { paddingHorizontal: 24 },
  line: { marginBottom: 10, padding: 16 },
  rate: { fontFamily: fonts.bold, fontSize: 18, color: colors.espresso },
  what: { marginTop: 4, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  limits: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  section: { marginTop: 22, marginBottom: 8, fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  note: { marginBottom: 6, fontSize: 15, lineHeight: 22 },
});
