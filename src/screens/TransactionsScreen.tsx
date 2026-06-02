import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, ConfirmDialog, DataStateBanner, Pill, SectionHeader } from '../components/Primitives';
import { formatCurrency, palette, spacing, typography } from '../design/theme';
import { deleteTransaction, fetchTransactionsData } from '../services/financeApi';
import type { ScreenKey, Transaction, TransactionType } from '../types/finance';

const filters: Array<{ label: string; type?: TransactionType }> = [
  { label: '全部' },
  { label: '支出', type: 'expense' },
  { label: '收入', type: 'income' },
  { label: '转账', type: 'transfer' },
  { label: '退款', type: 'refund' },
];

export function TransactionsScreen({
  goTo,
  requireDeleteConfirmation = true,
}: {
  goTo?: (screen: ScreenKey) => void;
  requireDeleteConfirmation?: boolean;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalExpense = useMemo(
    () => transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0),
    [transactions],
  );
  const pendingDeleteTransaction = transactions.find((item) => item.id === pendingDeleteId) ?? null;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchTransactionsData({ type: activeFilter.type, keyword });
      setTransactions(items);
      setPendingDeleteId(null);
    } catch (nextError) {
      setTransactions([]);
      setError(nextError instanceof Error ? nextError.message : '交易接口调用失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeFilter.type]);

  const handleDelete = async (item: Transaction) => {
    if (requireDeleteConfirmation && pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      setError(null);
      return;
    }

    setMutatingId(item.id);
    setError(null);
    try {
      await deleteTransaction(item.id);
      setTransactions((current) => current.filter((candidate) => candidate.id !== item.id));
      setPendingDeleteId(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '删除交易失败');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <View>
      <DataStateBanner loading={loading} error={error} />
      <Text style={styles.pageTitle}>交易管理</Text>
      <Text style={styles.pageLead}>列表、筛选、搜索和删除都直接操作后端交易表。</Text>

      <View style={styles.toolbar}>
        <ActionButton label="新增交易" icon="add-outline" onPress={() => goTo?.('entry')} />
        <ActionButton label={loading ? '刷新中' : '刷新'} icon="refresh-outline" variant="secondary" onPress={load} disabled={loading} loading={loading} />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={palette.muted} />
        <TextInput
          accessibilityLabel="搜索交易"
          onChangeText={setKeyword}
          onSubmitEditing={load}
          placeholder="搜索商户、备注或标签"
          placeholderTextColor={palette.muted}
          returnKeyType="search"
          style={styles.searchInput}
          value={keyword}
        />
        <ActionButton label={loading ? '搜索中' : '搜索'} icon="search-outline" variant="secondary" onPress={load} disabled={loading} loading={loading} />
      </View>

      <View style={styles.filters}>
        {filters.map((filter) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`筛选${filter.label}`}
            key={filter.label}
            onPress={() => setActiveFilter(filter)}
            style={[styles.filterButton, activeFilter.label === filter.label ? styles.filterButtonActive : null]}
          >
            <Text style={styles.filterText}>{filter.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="数据概览" action={`${transactions.length} 条已加载`} />
      <Card accent={palette.yellowSoft}>
        <View style={styles.bulkGrid}>
          <BulkItem icon="receipt-outline" title="本页支出" detail={formatCurrency(totalExpense)} />
          <BulkItem icon="filter-outline" title="当前筛选" detail={activeFilter.label} />
          <BulkItem
            icon={requireDeleteConfirmation ? 'shield-checkmark-outline' : 'shield-outline'}
            title="删除保护"
            detail={requireDeleteConfirmation ? '已开启，删除需二次确认' : '已关闭，点击即删除'}
          />
        </View>
      </Card>

      <SectionHeader title="交易列表" action="按时间倒序" />
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeadText, styles.merchantCell]}>商户</Text>
          <Text style={styles.tableHeadText}>分类</Text>
          <Text style={[styles.tableHeadText, styles.amountCell]}>金额</Text>
          <Text style={[styles.tableHeadText, styles.actionCell]}>操作</Text>
        </View>
        {transactions.length === 0 && !loading ? <Text style={styles.emptyText}>暂无交易。去“记账”页新增一笔后会显示在这里。</Text> : null}
        {transactions.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            <View style={styles.merchantCell}>
              <Text style={styles.rowTitle}>{item.merchant}</Text>
              <Text style={styles.meta}>
                {item.date} {item.time} · {sourceText(item.source)}
              </Text>
            </View>
            <View style={styles.cell}>
              <Pill label={item.category} tone="neutral" />
            </View>
            <Text style={[styles.amountCell, styles.amount, item.amount > 0 ? styles.incomeAmount : null]}>
              {formatCurrency(item.amount)}
            </Text>
            <View style={styles.actionCell}>
              <ActionButton
                label={mutatingId === item.id ? '删除中' : '删除'}
                icon="trash-outline"
                variant="danger"
                onPress={() => handleDelete(item)}
                disabled={mutatingId === item.id}
                loading={mutatingId === item.id}
                showLabel={false}
              />
            </View>
          </View>
        ))}
      </View>
      <ConfirmDialog
        visible={Boolean(pendingDeleteTransaction)}
        title="确认删除这笔交易？"
        body={
          pendingDeleteTransaction
            ? `${pendingDeleteTransaction.merchant} · ${formatCurrency(pendingDeleteTransaction.amount)}。删除后会从当前账本列表移除。`
            : ''
        }
        loading={Boolean(mutatingId)}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteTransaction) {
            void handleDelete(pendingDeleteTransaction);
          }
        }}
      />
    </View>
  );
}

function BulkItem({ icon, title, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }) {
  return (
    <View style={styles.bulkItem}>
      <Ionicons name={icon} size={22} color={palette.ink} />
      <View style={styles.bulkText}>
        <Text style={styles.bulkTitle}>{title}</Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
    </View>
  );
}

function sourceText(source: Transaction['source']) {
  const map: Record<Transaction['source'], string> = {
    manual: '手动',
    ai_parse: 'AI',
    import: '导入',
  };
  return map[source];
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
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  searchRow: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.sm,
  },
  searchInput: {
    color: palette.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: '800',
    minHeight: 40,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.ink,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: spacing.md,
  },
  filterButtonActive: {
    backgroundColor: palette.acid,
  },
  filterText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  bulkGrid: {
    gap: spacing.md,
  },
  bulkItem: {
    alignItems: 'flex-start',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  bulkText: {
    flex: 1,
  },
  bulkTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  meta: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  table: {
    borderColor: palette.ink,
    borderWidth: 2,
  },
  tableHeader: {
    backgroundColor: palette.ink,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  tableHeadText: {
    color: palette.white,
    flex: 1,
    fontSize: typography.small,
    fontWeight: '900',
  },
  tableRow: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderTopColor: palette.ink,
    borderTopWidth: 2,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 82,
    padding: spacing.md,
  },
  merchantCell: {
    flex: 1.4,
  },
  cell: {
    flex: 1,
  },
  amountCell: {
    flex: 1,
    textAlign: 'right',
  },
  actionCell: {
    alignItems: 'flex-end',
    flex: 1,
  },
  rowTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  amount: {
    color: palette.red,
    fontSize: typography.body,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  incomeAmount: {
    color: palette.green,
  },
  emptyText: {
    backgroundColor: palette.surface,
    borderTopColor: palette.ink,
    borderTopWidth: 2,
    color: palette.muted,
    fontSize: typography.body,
    fontWeight: '800',
    padding: spacing.md,
  },
});
