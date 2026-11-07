import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

export function TextField({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted + '80'}
        style={[styles.input, error ? styles.inputError : null, props.multiline && styles.multiline, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

/** A field that opens a searchable list in a sheet (React Native has no native <select>). */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = t('Choose…'),
  error,
  searchPlaceholder = t('Search'),
}: {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={[styles.input, styles.select, error ? styles.inputError : null]}
      >
        <Text style={[styles.selectText, !selected && { color: colors.muted + '99' }]} numberOfLines={1}>
          {selected ? (selected.sublabel ? `${selected.label} · ${selected.sublabel}` : selected.label) : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>{t("Close")}</Text>
            </Pressable>
          </View>
          {options.length > 8 ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.muted + '80'}
              style={[styles.input, { marginHorizontal: 20, marginBottom: 8 }]}
              autoCorrect={false}
            />
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                  setQuery('');
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.blush }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.sublabel ? <Text style={styles.hint}>{item.sublabel}</Text> : null}
                </View>
                {item.value === value ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && { color: colors.white }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.checkboxRow}
      hitSlop={6}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.checkboxText}>{children}</Text>
    </Pressable>
  );
}

/** Top bar for the registration steps: back, "Step n of 4", title. */
export function StepHeader({ step, total = 4, title, subtitle }: { step: number; total?: number; title: string; subtitle?: string }) {
  return (
    <View style={styles.stepHeader}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("Back")}>
        <Text style={styles.back}>{t("‹ Back")}</Text>
      </Pressable>
      <View style={styles.progress}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.progressBar, i < step && { backgroundColor: colors.primary }]} />
        ))}
      </View>
      <Text style={styles.stepLabel}>
        {t('STEP {step} OF {total}', { step, total })}
      </Text>
      <Text accessibilityRole="header" style={styles.stepTitle}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.stepSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Notice({ tone = 'info', children, style }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[
        styles.notice,
        tone === 'warn' && { backgroundColor: colors.brassSoft + '66', borderColor: colors.brass },
        tone === 'error' && { backgroundColor: colors.danger + '12', borderColor: colors.danger + '55' },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.noticeText, tone === 'error' && { color: colors.danger }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { marginBottom: 6, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 88, paddingTop: 14, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  error: { marginTop: 6, fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  hint: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  chevron: { marginLeft: 8, fontSize: 14, color: colors.muted },
  sheet: { flex: 1, backgroundColor: colors.paper },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.espresso },
  link: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primary },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  optionText: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  check: { fontFamily: fonts.bold, fontSize: 16, color: colors.primary },
  segmented: { flexDirection: 'row', backgroundColor: colors.blush, borderRadius: 12, padding: 4, marginBottom: 16 },
  segment: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  checkboxText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink },
  stepHeader: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 },
  back: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primary, marginBottom: 16 },
  progress: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  stepLabel: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.6, color: colors.primary },
  stepTitle: { marginTop: 6, fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.espresso },
  stepSubtitle: { marginTop: 8, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.muted },
  notice: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.blush,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.ink },
});
