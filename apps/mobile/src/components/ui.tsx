import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LOGO_ASPECT, LOGO_XML } from '@/assets/logo';
import { colors, fonts } from '@/theme';
import { t } from '@/i18n';

export function Logo({ width = 120 }: { width?: number }) {
  return <SvgXml xml={LOGO_XML} width={width} height={width / LOGO_ASPECT} accessibilityLabel="HairOriginals" />;
}

export function Title({ style, ...props }: TextProps) {
  return <Text accessibilityRole="header" style={[styles.title, style]} {...props} />;
}

export function Body({ style, ...props }: TextProps) {
  return <Text style={[styles.body, style]} {...props} />;
}

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primary : styles.ghost,
        pressed && variant === 'primary' && { backgroundColor: colors.primaryDeep },
        pressed && variant === 'ghost' && { backgroundColor: colors.blush },
        isDisabled && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, variant === 'ghost' && { color: colors.primary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Back link + title for screens below Home. */
export function ScreenHeader({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={styles.screenHeader}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("Back")}
        >
          <Text style={styles.back}>{t("‹ Back")}</Text>
        </Pressable>
      ) : null}
      <View style={styles.screenTitleRow}>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          {title}
        </Text>
        {right}
      </View>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.espresso },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.muted },
  button: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primary: { backgroundColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 20 },
  error: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.danger },
  screenHeader: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  back: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primary, marginBottom: 12 },
  screenTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  screenTitle: { flex: 1, fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.espresso },
});
