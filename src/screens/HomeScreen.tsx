import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, DataStateBanner, MoneyStat, Pill, ProgressBar, SectionHeader } from '../components/Primitives';
import { formatCurrency, palette, spacing, typography } from '../design/theme';
import { emptyDashboardData, fetchDashboardData, type DashboardData } from '../services/financeApi';
import type { EntryMode, ScreenKey } from '../types/finance';

export function HomeScreen({ goTo }: { goTo: (screen: ScreenKey, options?: { entryMode?: EntryMode }) => void }) {
  const [{ data, error }, setState] = useState({
    data: emptyDashboardData,
    error: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const { budgets, categorySpend, monthlySummary, transactions, aiInsight } = data;
  const primaryBudget = budgets[0];

  useEffect(() => {
    let ignore = false;

    fetchDashboardData()
      .then((nextData: DashboardData) => {
        if (!ignore) {
          setState({ data: nextData, error: null });
        }
      })
      .catch((nextError: Error) => {
        if (!ignore) {
          setState({ data: emptyDashboardData, error: nextError.message });
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
  }, []);

  return (
    <View>
      <DataStateBanner loading={loading} error={error} />
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>2026 年 5 月账本</Text>
          <Text style={styles.title}>AI 个人记账</Text>
          <Text style={styles.subtitle}>先确认，再入账。把自然语言、交易和预算放在同一个工作台。</Text>
        </View>
        <View style={styles.heroActions}>
          <ActionButton label="AI 记一笔" icon="sparkles-outline" onPress={() => goTo('entry', { entryMode: 'ai' })} />
          <ActionButton
            label="手动记账"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => goTo('entry', { entryMode: 'manual' })}
          />
        </View>
      </View>

      <View style={styles.statGrid}>
        <MoneyStat label="本月收入" value={monthlySummary.income} tone="income" />
        <MoneyStat label="本月支出" value={monthlySummary.expense} tone="expense" />
        <MoneyStat label="本月结余" value={monthlySummary.balance} tone="balance" />
      </View>

      <SectionHeader title="预算进度" action="阈值 80%" />
      <Card accent={palette.acid}>
        <View style={styles.budgetHeader}>
            <Text style={styles.bigNumber}>{monthlySummary.budgetUsedPercent}%</Text>
          <View style={styles.budgetTextBlock}>
            <Text style={styles.cardTitle}>月度预算使用</Text>
            <Text style={styles.metaText}>已用 {formatCurrency(primaryBudget?.used ?? 0)} / {formatCurrency(primaryBudget?.limit ?? 0)}</Text>
          </View>
        </View>
        <ProgressBar value={monthlySummary.budgetUsedPercent} color={palette.blue} />
      </Card>

      <SectionHeader title="最近交易" action="全部交易" />
      <View style={styles.list}>
        {transactions.length === 0 ? <Text style={styles.emptyText}>暂无交易记录。</Text> : null}
        {transactions.slice(0, 3).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`查看交易 ${item.merchant}`}
            onPress={() => goTo('transactions')}
            style={({ pressed }) => [styles.rowCard, pressed ? styles.pressed : null]}
          >
            <View style={[styles.rowIcon, item.amount > 0 ? styles.incomeIcon : null]}>
              <Ionicons name={item.amount > 0 ? 'arrow-down-outline' : 'arrow-up-outline'} size={20} color={palette.ink} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.merchant}</Text>
              <Text style={styles.metaText}>{item.category} · {item.date} {item.time}</Text>
            </View>
            <Text style={[styles.rowAmount, item.amount > 0 ? styles.incomeAmount : null]}>
              {formatCurrency(item.amount)}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="分类 Top 5" />
      <Card>
        <View style={styles.categoryList}>
          {categorySpend.length === 0 ? <Text style={styles.emptyText}>暂无分类支出数据。</Text> : null}
          {categorySpend.map((item) => (
            <View key={item.name} style={styles.categoryRow}>
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
              <View style={styles.categoryBody}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.metaStrong}>{item.percent}%</Text>
                </View>
                <ProgressBar value={item.percent} color={item.color} />
              </View>
              <Text style={styles.categoryAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionHeader title="AI 洞察" />
      <Card accent={palette.blueSoft}>
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles-outline" size={22} color={palette.ink} />
          <Pill label="需要确认" tone="yellow" />
        </View>
        <Text style={styles.insightText}>{aiInsight}</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: palette.yellow,
    borderColor: palette.ink,
    borderWidth: 3,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  kicker: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  title: {
    color: palette.ink,
    fontSize: typography.title,
    fontWeight: '900',
    lineHeight: 38,
  },
  subtitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 640,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  budgetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  bigNumber: {
    color: palette.ink,
    fontSize: 54,
    fontWeight: '900',
  },
  budgetTextBlock: {
    flex: 1,
  },
  cardTitle: {
    color: palette.ink,
    fontSize: typography.h3,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  metaText: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  metaStrong: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  emptyText: {
    backgroundColor: palette.surface,
    borderColor: palette.ink,
    borderWidth: 2,
    color: palette.muted,
    fontSize: typography.body,
    fontWeight: '800',
    padding: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  rowCard: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.md,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: palette.red,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  incomeIcon: {
    backgroundColor: palette.acid,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  rowAmount: {
    color: palette.red,
    fontSize: typography.body,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  incomeAmount: {
    color: palette.green,
  },
  pressed: {
    opacity: 0.72,
  },
  categoryList: {
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
  categoryBody: {
    flex: 1,
    gap: spacing.xs,
  },
  categoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryAmount: {
    color: palette.ink,
    fontSize: typography.small,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    minWidth: 68,
    textAlign: 'right',
  },
  aiHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  insightText: {
    color: palette.ink,
    fontSize: typography.h3,
    fontWeight: '900',
    lineHeight: 28,
  },
});
