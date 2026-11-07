import { MAX_UPLOAD_BYTES, partnerDocumentSchema, type PartnerApplication } from '@hoc/shared';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notice, StepHeader } from '@/components/form';
import { Button, Card } from '@/components/ui';
import { apiSend, errorMessage, uploadFile } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { useRegistration } from '@/lib/registration';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

type Item = PartnerApplication['checklist'][number];
type Source = 'camera' | 'library' | 'pdf';
type Picked = { uri: string; name: string; mimeType: string; size?: number | null };

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Uploaded', color: colors.espresso, bg: colors.brassSoft },
  accepted: { label: 'Accepted', color: colors.sage, bg: colors.sage + '22' },
  rejected: { label: 'Not accepted', color: colors.danger, bg: colors.danger + '18' },
};

async function pickFile(source: Source, fallbackName: string): Promise<Picked | 'denied' | null> {
  if (source === 'pdf') {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return null;
    const a = r.assets[0];
    return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', size: a.size };
  }
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return 'denied';
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.fileName ?? `${fallbackName}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize };
}

function ChecklistItem({ item, onChanged }: { item: Item; onChanged: () => Promise<void> }) {
  const { documentType: dt, documents } = item;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptsImages = dt.acceptedMimeTypes.some((m) => m.startsWith('image/'));
  const acceptsPdf = dt.acceptedMimeTypes.includes('application/pdf');
  const single = dt.maxFiles === 1;
  const locked = single && documents[0]?.status === 'accepted';
  const canAdd = !locked && (single || documents.length < dt.maxFiles);

  async function add(source: Source) {
    setError(null);
    const picked = await pickFile(source, dt.slug);
    if (picked === null) return;
    if (picked === 'denied') {
      setError(t('Allow camera access in your phone settings to take a photo, or choose one from your gallery.'));
      return;
    }
    if (picked.size && picked.size > MAX_UPLOAD_BYTES) {
      setError(t('This file is larger than 10 MB. Choose a smaller one.'));
      return;
    }
    setBusy(true);
    try {
      await uploadFile(`/v1/partner/application/documents/${dt.id}`, picked, partnerDocumentSchema);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!(await confirmAction({ title: t('Remove this file?'), message: name, confirmLabel: t('Remove'), destructive: true }))) return;
    setBusy(true);
    try {
      await apiSend(`/v1/partner/application/documents/${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{t(dt.name)}</Text>
        <Text style={[styles.tag, dt.required ? styles.tagRequired : null]}>{dt.required ? 'Required' : 'Optional'}</Text>
      </View>
      {dt.description ? <Text style={styles.itemDesc}>{t(dt.description)}</Text> : null}
      {dt.maxFiles > 1 ? <Text style={styles.itemDesc}>{t('Up to {n} files.', { n: dt.maxFiles })}</Text> : null}

      {documents.map((d) => {
        const s = STATUS[d.status]!;
        return (
          <View key={d.id} style={styles.file}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {d.fileName}
              </Text>
              <View style={[styles.status, { backgroundColor: s.bg }]}>
                <Text style={[styles.statusText, { color: s.color }]}>{t(s.label)}</Text>
              </View>
              {d.status === 'rejected' && d.reviewerNote ? <Text style={styles.note}>{d.reviewerNote}</Text> : null}
            </View>
            {d.status !== 'accepted' ? (
              <Pressable onPress={() => void remove(d.id, d.fileName)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Remove {name}', { name: d.fileName })}>
                <Text style={styles.remove}>{t("Remove")}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.busyText}>{t("Uploading…")}</Text>
        </View>
      ) : canAdd ? (
        <View style={styles.actions}>
          {acceptsImages ? (
            <>
              <SmallButton label={single && documents.length ? t('Retake photo') : t('Take photo')} onPress={() => add('camera')} />
              <SmallButton label={t("From gallery")} onPress={() => add('library')} />
            </>
          ) : null}
          {acceptsPdf ? <SmallButton label="PDF" onPress={() => add('pdf')} /> : null}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.small, pressed && { backgroundColor: colors.blush }]}
    >
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

export default function DocumentsStep() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { application, reloadApplication } = useRegistration();
  if (!application) return null;

  const missing = application.blockers.filter((b) => b.key.startsWith('document:'));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <StepHeader
          step={3}
          title={t("Documents")}
          subtitle={t("Clear photos in good light work best. The HairOriginals team checks each one.")}
        />
        <View style={styles.body}>
          {application.checklist.map((item) => (
            <ChecklistItem key={item.documentType.id} item={item} onChanged={reloadApplication} />
          ))}
          {missing.length ? (
            <Notice tone="warn">{missing.map((m) => m.message).join('\n')}</Notice>
          ) : (
            <Notice>{t("All required documents are uploaded.")}</Notice>
          )}
          <Button
            label={from === 'review' ? 'Done' : 'Continue'}
            onPress={() => (from === 'review' ? router.back() : router.push('/register/review'))}
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
  item: { marginBottom: 14, padding: 16 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.espresso },
  tag: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.line,
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
  },
  tagRequired: { backgroundColor: colors.blush, color: colors.primaryDeep },
  itemDesc: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  file: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  fileName: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  status: { alignSelf: 'flex-start', marginTop: 6, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontFamily: fonts.semibold, fontSize: 11 },
  note: { marginTop: 6, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.danger },
  remove: { fontFamily: fonts.semibold, fontSize: 14, color: colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  small: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  busyText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  error: { marginTop: 10, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.danger },
});
