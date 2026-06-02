import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, DataStateBanner, LoadingIndicator, MiniBarChart, Pill, ProgressBar, SectionHeader } from '../components/Primitives';
import { formatCurrency, palette, spacing, typography } from '../design/theme';
import {
  emptyReportsData,
  fetchReportsData,
  fetchTransactionsData,
  type ReportTrendGranularity,
  type ReportTrendOptions,
  type ReportsData,
} from '../services/financeApi';
import type { Transaction } from '../types/finance';

const trendLimits: Record<ReportTrendGranularity, { min: number; max: number; fallback: number; unit: string }> = {
  month: { min: 1, max: 12, fallback: 5, unit: '个月' },
  day: { min: 1, max: 31, fallback: 14, unit: '天' },
};

const defaultTrendOptions: ReportTrendOptions = { granularity: 'month', count: 5 };
const trendOptionsStorageKey = 'ai-finance:reports:trend-options';

export function ReportsScreen() {
  const [{ data, error }, setState] = useState({
    data: emptyReportsData,
    error: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const [trendOptions, setTrendOptions] = useState<ReportTrendOptions>(readStoredTrendOptions);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayTransactions, setDayTransactions] = useState<Transaction[]>([]);
  const [dayDetailsLoading, setDayDetailsLoading] = useState(false);
  const [dayDetailsError, setDayDetailsError] = useState<string | null>(null);
  const { categorySpend, aiInsight, trend } = data;
  const trendAverage = trend.length > 0 ? trend.reduce((sum, item) => sum + item.expense, 0) / trend.length : 0;
  const selectedDayIndex = selectedDay ? trend.findIndex((item) => item.period === selectedDay) : null;
  const selectedDayExpense = useMemo(
    () => dayTransactions.reduce((sum, item) => sum + Math.abs(item.amount), 0),
    [dayTransactions],
  );
  const chartData = trend.map((item) => ({
    label: trendOptions.granularity === 'day' ? item.period.slice(-2) : item.label,
    detailLabel: item.period,
    value: item.expense,
    color: trendAverage > 0 && item.expense > trendAverage ? palette.red : palette.blue,
  }));
  const trendTitle = trendOptions.granularity === 'month' ? '月度趋势' : '日度趋势';
  const trendUnit = trendLimits[trendOptions.granularity].unit;
  const trendAction = trendOptions.granularity === 'day' ? '点击日期查看明细' : '点击月份查看每日';

  useEffect(() => {
    persistTrendOptions(trendOptions);
  }, [trendOptions]);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setSelectedDay(null);
    setDayTransactions([]);
    setDayDetailsError(null);
    fetchReportsData(undefined, trendOptions)
      .then((nextData: ReportsData) => {
        if (!ignore) {
          setState({ data: nextData, error: null });
        }
      })
      .catch((nextError: Error) => {
        if (!ignore) {
          setState({ data: emptyReportsData, error: nextError.message });
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [trendOptions]);

  useEffect(() => {
    if (!selectedDay || trendOptions.granularity !== 'day') {
      setDayTransactions([]);
      setDayDetailsError(null);
      setDayDetailsLoading(false);
      return;
    }

    let ignore = false;
    setDayDetailsLoading(true);
    setDayDetailsError(null);

    fetchTransactionsData({ month: selectedDay.slice(0, 7), type: 'expense', pageSize: 200 })
      .then((items) => {
        if (!ignore) {
          setDayTransactions(items.filter((item) => item.occurredOn === selectedDay));
        }
      })
      .catch((nextError: Error) => {
        if (!ignore) {
          setDayTransactions([]);
          setDayDetailsError(nextError.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setDayDetailsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedDay, trendOptions.granularity]);

  const changeGranularity = (granularity: ReportTrendGranularity) => {
    setTrendOptions((current) => ({
      granularity,
      count: current.granularity === granularity ? current.count : trendLimits[granularity].fallback,
      end: undefined,
    }));
  };

  const changeTrendCount = (step: number) => {
    setTrendOptions((current) => {
      const limits = trendLimits[current.granularity];
      return {
        ...current,
        count: Math.max(limits.min, Math.min(limits.max, current.count + step)),
      };
    });
  };

  const openDailyTrendForMonth = (period: string) => {
    const end = monthTrendEnd(period);
    setTrendOptions({
      granularity: 'day',
      count: Number(end.slice(-2)),
      end,
    });
  };

  return (
    <View>
      <DataStateBanner loading={loading} error={error} />
      <Text style={styles.pageTitle}>报表分析</Text>
      <Text style={styles.pageLead}>聚合趋势、分类占比和 AI 消费建议。</Text>

      <SectionHeader title={trendTitle} action={trendAction} />
      <Card>
        <View style={styles.trendControls}>
          <View style={styles.segmented}>
            <SegmentButton label="按月" active={trendOptions.granularity === 'month'} onPress={() => changeGranularity('month')} />
            <SegmentButton label="按天" active={trendOptions.granularity === 'day'} onPress={() => changeGranularity('day')} />
          </View>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="减少统计周期"
              onPress={() => changeTrendCount(-1)}
              style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
            >
              <Ionicons name="remove-outline" size={18} color={palette.ink} />
            </Pressable>
            <Text style={styles.stepValue}>
              近 {trendOptions.count} {trendUnit}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="增加统计周期"
              onPress={() => changeTrendCount(1)}
              style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
            >
              <Ionicons name="add-outline" size={18} color={palette.ink} />
            </Pressable>
          </View>
        </View>
        {chartData.length > 0 ? (
          <MiniBarChart
            data={chartData}
            selectedIndex={trendOptions.granularity === 'day' ? selectedDayIndex : null}
            onItemPress={(item) => {
              if (trendOptions.granularity === 'day' && item.detailLabel) {
                setSelectedDay(item.detailLabel);
              } else if (trendOptions.granularity === 'month' && item.detailLabel) {
                openDailyTrendForMonth(item.detailLabel);
              }
            }}
          />
        ) : (
          <Text style={styles.emptyText}>暂无趋势数据。</Text>
        )}
        <View style={styles.trendLegend}>
          <Pill label="蓝色：正常区间" tone="blue" />
          <Pill label="红色：超过平均值" tone="red" />
        </View>
        {trendOptions.granularity === 'day' ? (
          <DayExpenseDetails
            date={selectedDay}
            error={dayDetailsError}
            loading={dayDetailsLoading}
            totalExpense={selectedDayExpense}
            transactions={dayTransactions}
          />
        ) : null}
      </Card>

      <SectionHeader title="分类占比" action="Top 5" />
      <Card>
        <View style={styles.categoryRows}>
          {categorySpend.length === 0 ? <Text style={styles.emptyText}>暂无分类支出数据。</Text> : null}
          {categorySpend.map((item) => (
            <View key={item.name} style={styles.categoryRow}>
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
              <View style={styles.categoryMain}>
                <View style={styles.categoryTop}>
                  <Text style={styles.categoryName}>{item.name}</Text>
                  <Text style={styles.categoryValue}>{formatCurrency(item.amount)}</Text>
                </View>
                <ProgressBar value={item.percent} color={item.color} />
              </View>
            </View>
          ))}
        </View>
      </Card>

      <SectionHeader title="AI 月度总结" />
      <Card accent={palette.acid}>
        <Text style={styles.aiText}>{aiInsight}</Text>
      </Card>
    </View>
  );
}

function DayExpenseDetails({
  date,
  error,
  loading,
  totalExpense,
  transactions,
}: {
  date: string | null;
  error: string | null;
  loading: boolean;
  totalExpense: number;
  transactions: Transaction[];
}) {
  if (!date) {
    return (
      <View style={styles.dayDetails}>
        <Text style={styles.emptyText}>点击上方任意一天查看当天消费详情。</Text>
      </View>
    );
  }

  return (
    <View style={styles.dayDetails}>
      <View style={styles.dayDetailsHeader}>
        <View>
          <Text style={styles.dayDetailsTitle}>{date} 消费详情</Text>
          {loading ? (
            <View style={styles.dayLoadingLine}>
              <LoadingIndicator compact />
              <Text style={styles.meta}>正在读取当天交易...</Text>
            </View>
          ) : (
            <Text style={styles.meta}>{transactions.length} 笔支出</Text>
          )}
        </View>
        <Text style={styles.dayDetailsTotal}>{formatCurrency(-totalExpense)}</Text>
      </View>
      {error ? <Text style={styles.emptyText}>当天交易读取失败：{error}</Text> : null}
      {!loading && !error && transactions.length === 0 ? <Text style={styles.emptyText}>这一天暂无支出记录。</Text> : null}
      <View style={styles.dayTransactionList}>
        {transactions.map((item) => (
          <View key={item.id} style={styles.dayTransactionRow}>
            <View style={styles.dayTransactionMain}>
              <Text style={styles.dayTransactionTitle}>{item.merchant}</Text>
              <Text style={styles.meta}>
                {item.time} · {item.category}
              </Text>
            </View>
            <Text style={styles.dayTransactionAmount}>{formatCurrency(item.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segmentButton, active ? styles.segmentButtonActive : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function monthTrendEnd(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (monthValue === currentMonth) {
    return `${monthValue}-${String(today.getDate()).padStart(2, '0')}`;
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  return `${monthValue}-${String(daysInMonth).padStart(2, '0')}`;
}

function readStoredTrendOptions(): ReportTrendOptions {
  const storage = getWebStorage();
  if (!storage) {
    return defaultTrendOptions;
  }

  try {
    const rawValue = storage.getItem(trendOptionsStorageKey);
    if (!rawValue) {
      return defaultTrendOptions;
    }

    const parsed = JSON.parse(rawValue) as Partial<ReportTrendOptions>;
    const granularity: ReportTrendGranularity = parsed.granularity === 'day' || parsed.granularity === 'month'
      ? parsed.granularity
      : defaultTrendOptions.granularity;

    return {
      granularity,
      count: normalizeTrendCount(granularity, parsed.count),
    };
  } catch {
    return defaultTrendOptions;
  }
}

function persistTrendOptions(options: ReportTrendOptions) {
  const storage = getWebStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      trendOptionsStorageKey,
      JSON.stringify({
        granularity: options.granularity,
        count: normalizeTrendCount(options.granularity, options.count),
      }),
    );
  } catch {
    // Ignore unavailable or full browser storage; the report still works with in-memory state.
  }
}

function normalizeTrendCount(granularity: ReportTrendGranularity, count: unknown) {
  const limits = trendLimits[granularity];
  const numericCount = typeof count === 'number' && Number.isFinite(count) ? count : limits.fallback;
  return Math.max(limits.min, Math.min(limits.max, Math.round(numericCount)));
}

type WebStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function getWebStorage(): WebStorage | null {
  if (typeof globalThis !== 'object' || !('localStorage' in globalThis)) {
    return null;
  }
  return (globalThis as typeof globalThis & { localStorage?: WebStorage }).localStorage ?? null;
}

const styles = StyleSheet.create({
  pageTitle: {
    color: palette.ink,
    fontSize: typography.title,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  pageLead: {
    color: palette.muted,
    fontSize: typography.body,
    fontWeight: '700',
    lineHeight: 22,
  },
  trendLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dayDetails: {
    borderColor: palette.ink,
    borderTopWidth: 2,
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  dayDetailsHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  dayDetailsTitle: {
    color: palette.ink,
    fontSize: typography.h3,
    fontWeight: '900',
  },
  dayDetailsTotal: {
    color: palette.red,
    fontSize: typography.h2,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  dayLoadingLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dayTransactionList: {
    gap: spacing.sm,
  },
  dayTransactionRow: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayTransactionMain: {
    flex: 1,
    minWidth: 0,
  },
  dayTransactionTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  dayTransactionAmount: {
    color: palette.red,
    fontSize: typography.body,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  trendControls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  segmented: {
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
  },
  segmentButton: {
    backgroundColor: palette.white,
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  segmentButtonActive: {
    backgroundColor: palette.acid,
  },
  segmentText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: palette.ink,
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: palette.yellow,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  stepValue: {
    backgroundColor: palette.white,
    borderBottomColor: palette.ink,
    borderTopColor: palette.ink,
    borderBottomWidth: 2,
    borderTopWidth: 2,
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
    minHeight: 38,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: 'center',
  },
  fixedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  fixedCard: {
    flex: 1,
    minWidth: 150,
  },
  metricLabel: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  metricValue: {
    color: palette.ink,
    fontSize: 42,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    marginVertical: spacing.sm,
  },
  meta: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
  },
  emptyText: {
    color: palette.muted,
    fontSize: typography.body,
    fontWeight: '800',
    lineHeight: 22,
  },
  categoryRows: {
    gap: spacing.md,
  },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  swatch: {
    borderColor: palette.ink,
    borderWidth: 2,
    height: 28,
    width: 28,
  },
  categoryMain: {
    flex: 1,
    gap: spacing.xs,
  },
  categoryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryName: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  categoryValue: {
    color: palette.ink,
    fontSize: typography.small,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  aiText: {
    color: palette.ink,
    fontSize: typography.h3,
    fontWeight: '900',
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.72,
  },
});
