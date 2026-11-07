import { partnerReferralSchema, type PartnerReferral, type ShareTarget } from '@hoc/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { Notice, Segmented } from '@/components/form';
import { Body, Button, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

type Kind = 'referral' | 'tryon';

/**
 * The partner's own QR codes and links:
 * - Referral: clients share their details, confirm by OTP, and the lead is credited to the partner.
 * - AI try-on: clients try HairOriginals hair on their own photo; the try-on app tags the lead with the partner's code.
 */
export default function ShareScreen() {
  const [ref, setRef] = useState<PartnerReferral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('referral');
  useEffect(() => {
    api('/v1/partner/referral', partnerReferralSchema).then(setRef, (e: unknown) => setError(errorMessage(e)));
  }, []);

  if (!ref && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const target: ShareTarget | null = ref ? (kind === 'tryon' ? ref.tryOn : ref) : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={t("My QR and link")} />
        <View style={styles.body}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {ref && target ? (
            <>
              <Segmented<Kind>
                options={[
                  { value: 'referral', label: t('Referral') },
                  { value: 'tryon', label: t('AI try-on') },
                ]}
                value={kind}
                onChange={setKind}
              />
              <Body style={{ marginTop: 16, marginBottom: 20 }}>
                {kind === 'tryon'
                  ? t('Clients who scan this code can try HairOriginals hair on their own photo. When they sign in, HairOriginals knows they came from you.')
                  : t("Clients who scan this code or open your link share their details and confirm with a code sent to their phone. They're credited to you automatically.")}
              </Body>
              <View style={styles.qr} accessible accessibilityLabel={kind === 'tryon' ? t('Your AI try-on QR code') : t('Your QR code')}>
                <SvgXml xml={target.qrSvg} width={240} height={240} />
              </View>
              <Text style={styles.code}>{ref.code}</Text>
              <Text style={styles.link} selectable numberOfLines={kind === 'tryon' ? 2 : undefined}>
                {target.link}
              </Text>
              <Button
                label={kind === 'tryon' ? t('Share try-on link') : t('Share my link')}
                onPress={() => void Share.share({ message: target.shareText })}
                style={{ marginTop: 20 }}
              />
              <Button variant="ghost" label={t('Open printable poster')} onPress={() => void Linking.openURL(target.posterUrl)} />
              <Body style={styles.hint}>{t('The poster opens in your browser. Print it for your counter or mirror, or save it as a PDF.')}</Body>
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
  qr: { alignSelf: 'center', padding: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  code: { marginTop: 16, textAlign: 'center', fontFamily: fonts.bold, fontSize: 24, letterSpacing: 3, color: colors.espresso },
  link: { marginTop: 6, textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  hint: { marginTop: 8, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
