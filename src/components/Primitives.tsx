import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { clampPercent, formatCurrency, palette, radii, shadow, spacing, typography } from '../design/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function LoadingIndicator({
  label,
  compact = false,
  inverse = false,
}: {
  label?: string;
  compact?: boolean;
  inverse?: boolean;
}) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 820,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.loadingWrap} accessibilityRole="progressbar">
      <Animated.View
        style={[
          styles.loadingMark,
          compact ? styles.loadingMarkCompact : null,
          inverse ? styles.loadingMarkInverse : null,
          { transform: [{ rotate }] },
        ]}
      />
      {label ? <Text style={[styles.loadingText, inverse ? styles.loadingTextInverse : null]}>{label}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  accent,
  style,
}: {
  children: ReactNode;
  accent?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, accent ? { backgroundColor: accent } : null, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'blue' | 'green' | 'red' | 'yellow';
}) {
  const colors = {
    neutral: palette.surfaceAlt,
    blue: palette.blueSoft,
    green: palette.greenSoft,
    red: palette.dangerSoft,
    yellow: palette.yellowSoft,
  };

  return (
    <View style={[styles.pill, { backgroundColor: colors[tone] }]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export function ActionButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  showLabel = true,
}: {
  label: string;
  icon: IconName;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  showLabel?: boolean;
}) {
  const variantStyle = {
    primary: styles.primaryButton,
    secondary: styles.secondaryButton,
    danger: styles.dangerButton,
  }[variant];
  const isDisabled = disabled || loading;
  const inverseLoading = variant !== 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        !showLabel ? styles.actionButtonIconOnly : null,
        variantStyle,
        pressed ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <LoadingIndicator compact inverse={inverseLoading} />
      ) : (
        <Ionicons name={icon} size={18} color={variant === 'secondary' ? palette.ink : palette.white} />
      )}
      {showLabel ? (
        <Text style={[styles.actionLabel, variant === 'secondary' ? styles.secondaryActionLabel : null]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
    >
      <Ionicons name={icon} size={20} color={palette.ink} />
    </Pressable>
  );
}

export function ProgressBar({
  value,
  color = palette.blue,
}: {
  value: number;
  color?: string;
}) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${clampPercent(value)}%`, backgroundColor: color }]} />
    </View>
  );
}

export function MoneyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'income' | 'expense' | 'balance';
}) {
  const toneColor = tone === 'income' ? palette.green : tone === 'expense' ? palette.red : palette.blue;

  return (
    <View style={styles.moneyStat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: toneColor }]}>{formatCurrency(value)}</Text>
    </View>
  );
}

export function LabeledField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        {icon ? <Ionicons name={icon} size={15} color={palette.muted} /> : null}
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function MiniBarChart({
  data,
  formatValue = formatCurrency,
  selectedIndex,
  onItemPress,
}: {
  data: Array<{ label: string; value: number; color: string; detailLabel?: string }>;
  formatValue?: (value: number) => string;
  selectedIndex?: number | null;
  onItemPress?: (item: { label: string; value: number; color: string; detailLabel?: string }, index: number) => void;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isCompact = data.length > 10;
  const isDense = data.length > 18;
  const labelStep = isDense ? Math.ceil(data.length / 7) : isCompact ? 2 : 1;
  const chartGap = isDense ? spacing.xs : isCompact ? spacing.sm : spacing.sm;

  return (
    <View style={[styles.chartRow, { gap: chartGap }]} accessibilityLabel="趋势柱状图">
      {data.map((item, index) => {
        const showLabel = index === 0 || index === data.length - 1 || index % labelStep === 0;
        const tooltipPlacement =
          index === 0
            ? styles.chartTooltipFirst
            : index === data.length - 1
              ? styles.chartTooltipLast
              : styles.chartTooltipCenter;

        return (
        <View key={`${item.label}-${index}`} style={styles.chartItem}>
          {activeIndex === index ? (
            <View pointerEvents="none" style={[styles.chartTooltip, tooltipPlacement]}>
              <Text style={styles.chartTooltipLabel}>{item.detailLabel ?? item.label}</Text>
              <Text style={styles.chartTooltipValue}>{formatValue(item.value)}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.detailLabel ?? item.label} 支出 ${formatValue(item.value)}`}
            onHoverIn={() => setActiveIndex(index)}
            onHoverOut={() => setActiveIndex(null)}
            onPress={() => {
              setActiveIndex(index);
              onItemPress?.(item, index);
            }}
            style={({ pressed }) => [
              styles.chartColumn,
              isCompact ? styles.chartColumnCompact : null,
              isDense ? styles.chartColumnDense : null,
              selectedIndex === index ? styles.chartColumnSelected : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <View
              style={[
                styles.chartBar,
                {
                  height: `${Math.max(8, (item.value / max) * 100)}%`,
                  backgroundColor: item.color,
                },
              ]}
            />
          </Pressable>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.chartLabel}>
            {showLabel ? item.label : ''}
          </Text>
        </View>
        );
      })}
    </View>
  );
}

export function DataStateBanner({
  loading,
  error,
}: {
  loading: boolean;
  error: string | null;
}) {
  if (!loading && !error) {
    return null;
  }

  const title = loading ? '正在读取后端接口' : '后端接口暂不可用';
  const detail = loading
    ? '页面会在接口返回后自动刷新。'
    : `当前没有使用本地演示数据，请确认 API 服务和数据库可用：${error}`;

  return (
    <View style={[styles.dataBanner, error ? styles.dataBannerError : null]}>
      <View style={styles.dataBannerTitleRow}>
        {loading ? <LoadingIndicator compact /> : null}
        <Text style={styles.dataBannerTitle}>{title}</Text>
      </View>
      <Text style={styles.dataBannerDetail}>{detail}</Text>
    </View>
  );
}

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel = '确认删除',
  cancelLabel = '取消',
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.dialogOverlay}>
        <View style={styles.dialogPanel} accessibilityRole="alert">
          <View style={styles.dialogIcon}>
            <Ionicons name="warning-outline" size={30} color={palette.white} />
          </View>
          <View style={styles.dialogCopy}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <Text style={styles.dialogBody}>{body}</Text>
          </View>
          <View style={styles.dialogActions}>
            <ActionButton label={cancelLabel} icon="close-outline" variant="secondary" onPress={onCancel} disabled={loading} />
            <ActionButton
              label={loading ? '删除中' : confirmLabel}
              icon="trash-outline"
              variant="danger"
              onPress={onConfirm}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  loadingMark: {
    backgroundColor: palette.acid,
    borderColor: palette.ink,
    borderWidth: 1.5,
    height: 18,
    width: 18,
  },
  loadingMarkCompact: {
    height: 15,
    width: 15,
  },
  loadingMarkInverse: {
    backgroundColor: palette.yellow,
    borderColor: palette.white,
  },
  loadingText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  loadingTextInverse: {
    color: palette.white,
  },
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderRadius: radii.sm,
    borderWidth: 2,
    padding: spacing.lg,
    ...shadow.brutal,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: typography.h2,
    fontWeight: '900',
  },
  sectionAction: {
    color: palette.blue,
    fontSize: typography.small,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pill: {
    alignSelf: 'flex-start',
    borderColor: palette.ink,
    borderRadius: radii.none,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillText: {
    color: palette.ink,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  actionButton: {
    alignItems: 'center',
    borderColor: palette.ink,
    borderRadius: radii.none,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  actionButtonIconOnly: {
    paddingHorizontal: 0,
    width: 48,
  },
  primaryButton: {
    backgroundColor: palette.ink,
  },
  secondaryButton: {
    backgroundColor: palette.acid,
  },
  dangerButton: {
    backgroundColor: palette.red,
  },
  actionLabel: {
    color: palette.white,
    fontSize: typography.body,
    fontWeight: '900',
  },
  secondaryActionLabel: {
    color: palette.ink,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: palette.yellow,
    borderColor: palette.ink,
    borderRadius: radii.none,
    borderWidth: 2,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
  },
  progressTrack: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderRadius: radii.none,
    borderWidth: 2,
    height: 18,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  moneyStat: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderRadius: radii.none,
    borderWidth: 2,
    flex: 1,
    minWidth: 132,
    padding: spacing.md,
  },
  statLabel: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: typography.h3,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  field: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 1.5,
    flex: 1,
    minWidth: 130,
    padding: spacing.md,
  },
  fieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    color: palette.muted,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  fieldValue: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  chartRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    height: 210,
    justifyContent: 'space-between',
    overflow: 'hidden',
    width: '100%',
  },
  chartItem: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    height: 196,
    justifyContent: 'flex-end',
    minWidth: 0,
    position: 'relative',
  },
  chartColumn: {
    backgroundColor: '#FFFDF4',
    borderColor: palette.ink,
    borderWidth: 1.5,
    height: 142,
    justifyContent: 'flex-end',
    width: '100%',
  },
  chartColumnCompact: {
    backgroundColor: palette.surface,
    borderColor: palette.muted,
    borderWidth: 1.5,
  },
  chartColumnDense: {
    borderWidth: 1,
  },
  chartColumnSelected: {
    borderColor: palette.blue,
    borderWidth: 3,
  },
  chartTooltip: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderColor: palette.white,
    borderWidth: 1.5,
    width: 94,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: 0,
    zIndex: 2,
  },
  chartTooltipFirst: {
    left: 0,
  },
  chartTooltipCenter: {
    left: '50%',
    marginLeft: -47,
  },
  chartTooltipLast: {
    right: 0,
  },
  chartTooltipLabel: {
    color: palette.yellow,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  chartTooltipValue: {
    color: palette.white,
    fontSize: typography.small,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    marginTop: 2,
  },
  chartBar: {
    borderTopColor: palette.ink,
    borderTopWidth: 1.5,
    width: '100%',
  },
  chartLabel: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: '900',
    minHeight: 16,
    textAlign: 'center',
    width: '100%',
  },
  dataBanner: {
    backgroundColor: palette.blueSoft,
    borderColor: palette.ink,
    borderWidth: 2,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  dataBannerError: {
    backgroundColor: palette.dangerSoft,
  },
  dataBannerTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  dataBannerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dataBannerDetail: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 18,
  },
  dialogOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(11, 11, 11, 0.58)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialogPanel: {
    backgroundColor: palette.paper,
    borderColor: palette.ink,
    borderWidth: 3,
    maxWidth: 440,
    padding: spacing.xl,
    width: '100%',
    ...shadow.brutal,
  },
  dialogIcon: {
    alignItems: 'center',
    backgroundColor: palette.red,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 56,
  },
  dialogCopy: {
    gap: spacing.sm,
  },
  dialogTitle: {
    color: palette.ink,
    fontSize: typography.h1,
    fontWeight: '900',
    lineHeight: 34,
  },
  dialogBody: {
    color: palette.muted,
    fontSize: typography.body,
    fontWeight: '800',
    lineHeight: 22,
  },
  dialogActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
