import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, ConfirmDialog, DataStateBanner, LoadingIndicator, Pill, SectionHeader } from '../components/Primitives';
import { palette, spacing, typography } from '../design/theme';
import {
  archiveCategory,
  createCategory,
  fetchCategories,
  getCurrentUser,
  type Category,
} from '../services/financeApi';

const settings = [
  { title: '分类管理', detail: '餐饮、交通、购物等', icon: 'pricetag-outline' },
  { title: 'AI Provider', detail: '后端配置 · 前端不保存密钥', icon: 'sparkles-outline' },
  { title: '数据导入导出', detail: 'CSV 导入、账本导出、附件清单', icon: 'swap-vertical-outline' },
] as const;

export function SettingsScreen({
  onSignOut,
  requireDeleteConfirmation,
  onRequireDeleteConfirmationChange,
}: {
  onSignOut?: () => void;
  requireDeleteConfirmation: boolean;
  onRequireDeleteConfirmationChange: (value: boolean) => void;
}) {
  const [user, setUser] = useState<{ email?: string; displayName?: string } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<Category['type']>('expense');
  const [categoryColor, setCategoryColor] = useState('#CCFF00');
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categorySaving, setCategorySaving] = useState(false);
  const [pendingCategoryDeleteId, setPendingCategoryDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);

  const visibleCategories = categories.filter((item) => !item.isArchived);
  const pendingCategoryDelete = visibleCategories.find((item) => item.id === pendingCategoryDeleteId) ?? null;

  useEffect(() => {
    let ignore = false;
    Promise.all([getCurrentUser(), fetchCategories()])
      .then(([nextUser, nextCategories]) => {
        if (!ignore) {
          setUser(nextUser);
          setCategories(nextCategories);
          setError(null);
        }
      })
      .catch((nextError: Error) => {
        if (!ignore) {
          setError(nextError.message);
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

  const handleCreateCategory = async () => {
    const name = categoryName.trim();
    if (!name) {
      setCategoryMessage('请输入分类名称。');
      return;
    }
    setCategorySaving(true);
    setCategoryMessage(null);
    setError(null);
    try {
      const created = await createCategory({ name, type: categoryType, color: categoryColor });
      setCategories((items) => [...items, created]);
      setCategoryName('');
      setIsCategoryFormOpen(false);
      setCategoryMessage(`已新增分类：${created.name}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '新增分类失败');
    } finally {
      setCategorySaving(false);
    }
  };

  const handleArchiveCategory = async (category: Category) => {
    if (requireDeleteConfirmation && pendingCategoryDeleteId !== category.id) {
      setPendingCategoryDeleteId(category.id);
      setCategoryMessage(null);
      return;
    }

    setCategorySaving(true);
    setCategoryMessage(null);
    setError(null);
    try {
      const updated = await archiveCategory(category.id);
      setCategories((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setPendingCategoryDeleteId(null);
      setCategoryMessage(`已删除分类：${category.name}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '删除分类失败');
    } finally {
      setCategorySaving(false);
    }
  };

  const handlePrivacyToggle = () => {
    const nextValue = !requireDeleteConfirmation;
    onRequireDeleteConfirmationChange(nextValue);
    setPendingCategoryDeleteId(null);
    setCategoryMessage(nextValue ? '已开启删除二次确认。' : '已关闭删除二次确认。');
  };

  return (
    <View>
      <DataStateBanner loading={loading} error={error} />
      <Text style={styles.pageTitle}>我的与设置</Text>
      <Text style={styles.pageLead}>分类、AI Provider、隐私说明和数据权利统一放在这里。</Text>

      <SectionHeader title="登录状态" />
      <Card accent={palette.blueSoft}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AI</Text>
          </View>
          <View style={styles.profileMain}>
            <Text style={styles.profileName}>{user?.displayName ?? '当前用户'}</Text>
            <Text style={styles.profileMeta}>{user?.email ?? '未提供邮箱'}</Text>
          </View>
          <Pill label="已登录" tone="green" />
        </View>
        <View style={styles.signOutRow}>
          <ActionButton icon="log-out-outline" label="退出登录" onPress={onSignOut} variant="danger" />
        </View>
      </Card>

      <SectionHeader title="分类管理" action={`${visibleCategories.length} 个`} />
      <Card>
        {categoryMessage ? (
          <View style={styles.categoryStatus}>
            <Text style={styles.categoryStatusText}>{categoryMessage}</Text>
          </View>
        ) : null}
        <View style={styles.categoryGrid}>
          {visibleCategories.length === 0 && !loading ? <Text style={styles.emptyText}>暂无分类。</Text> : null}
          {visibleCategories.map((item) => (
            <View key={item.id} style={styles.categoryPill}>
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
              <Text style={styles.categoryText}>{item.name}</Text>
              {!item.isSystem ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除分类${item.name}`}
                  onPress={() => handleArchiveCategory(item)}
                  disabled={categorySaving}
                  style={({ pressed }) => [styles.deleteCategoryButton, pressed ? styles.pressed : null]}
                >
                  {categorySaving ? <LoadingIndicator compact inverse /> : <Ionicons name="trash-outline" size={16} color={palette.white} />}
                  <Text style={styles.deleteCategoryText}>{categorySaving ? '删除中' : '删除'}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加自定义分类"
            onPress={() => setIsCategoryFormOpen((value) => !value)}
            style={({ pressed }) => [
              styles.addCategoryTile,
              isCategoryFormOpen ? styles.addCategoryTileActive : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons name={isCategoryFormOpen ? 'close-outline' : 'add-outline'} size={26} color={palette.ink} />
          </Pressable>
        </View>
        {isCategoryFormOpen ? (
          <View style={styles.categoryForm}>
            <View style={styles.categoryInputBlock}>
              <Text style={styles.inputLabel}>新增分类名称</Text>
              <TextInput
                accessibilityLabel="新增分类名称"
                onChangeText={setCategoryName}
                placeholder="例如：咖啡、宠物、健身"
                placeholderTextColor={palette.muted}
                style={styles.input}
                value={categoryName}
              />
            </View>
            <View style={styles.typeSelector}>
              {categoryTypes.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`选择${item.label}分类`}
                  key={item.value}
                  onPress={() => setCategoryType(item.value)}
                  style={[styles.typeButton, categoryType === item.value ? styles.typeButtonActive : null]}
                >
                  <Text style={styles.typeButtonText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.colorSelector}>
              {categoryColors.map((color) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`选择分类颜色${color}`}
                  key={color}
                  onPress={() => setCategoryColor(color)}
                  style={[styles.colorButton, categoryColor === color ? styles.colorButtonActive : null]}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: color }]} />
                </Pressable>
              ))}
            </View>
            <View style={styles.categoryFormActions}>
              <ActionButton
                icon="add-circle-outline"
                label={categorySaving ? '保存中' : '新增分类'}
                onPress={handleCreateCategory}
                disabled={categorySaving || !categoryName.trim()}
                loading={categorySaving}
              />
              <ActionButton
                icon="close-outline"
                label="取消"
                onPress={() => {
                  setIsCategoryFormOpen(false);
                  setCategoryName('');
                }}
                variant="secondary"
              />
            </View>
          </View>
        ) : null}
        <Text style={styles.categoryHelp}>删除会归档分类，不会删除历史交易；历史交易会保留原分类关联或由后端策略处理。</Text>
      </Card>

      <SectionHeader title="设置项" />
      <View style={styles.settingsList}>
        {settings.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`打开${item.title}`}
            key={item.title}
            style={({ pressed }) => [styles.settingRow, pressed ? styles.pressed : null]}
          >
            <View style={styles.settingIcon}>
              <Ionicons name={item.icon} size={20} color={palette.ink} />
            </View>
            <View style={styles.settingBody}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              <Text style={styles.settingDetail}>{item.detail}</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color={palette.ink} />
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: requireDeleteConfirmation }}
          accessibilityLabel="隐私与安全，数据删除需要二次确认"
          onPress={handlePrivacyToggle}
          style={({ pressed }) => [styles.settingRow, pressed ? styles.pressed : null]}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color={palette.ink} />
          </View>
          <View style={styles.settingBody}>
            <Text style={styles.settingTitle}>隐私与安全</Text>
            <Text style={styles.settingDetail}>
              {requireDeleteConfirmation ? '已开启：数据删除需要二次确认' : '已关闭：点击删除会直接执行'}
            </Text>
          </View>
          <View style={[styles.switchTrack, requireDeleteConfirmation ? styles.switchTrackOn : null]}>
            <View style={[styles.switchThumb, requireDeleteConfirmation ? styles.switchThumbOn : null]}>
              <Ionicons
                name={requireDeleteConfirmation ? 'checkmark-outline' : 'close-outline'}
                size={15}
                color={palette.ink}
              />
            </View>
          </View>
        </Pressable>
      </View>

      <SectionHeader title="隐私边界" />
      <Card accent={palette.dangerSoft}>
        <Text style={styles.privacyText}>AI 功能默认通过后端转发，不把完整账本无差别发送给模型。文件下载必须由后端校验归属权并签发短时 URL。</Text>
      </Card>
      <ConfirmDialog
        visible={Boolean(pendingCategoryDelete)}
        title="确认删除这个分类？"
        body={
          pendingCategoryDelete
            ? `${pendingCategoryDelete.name} 将被归档，不会删除历史交易。后续新增交易将不能再选择这个分类。`
            : ''
        }
        loading={categorySaving}
        onCancel={() => setPendingCategoryDeleteId(null)}
        onConfirm={() => {
          if (pendingCategoryDelete) {
            void handleArchiveCategory(pendingCategoryDelete);
          }
        }}
      />
    </View>
  );
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
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: palette.yellow,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarText: {
    color: palette.ink,
    fontSize: typography.h2,
    fontWeight: '900',
  },
  profileMain: {
    flex: 1,
  },
  profileName: {
    color: palette.ink,
    fontSize: typography.h3,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  profileMeta: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
  },
  signOutRow: {
    alignItems: 'flex-start',
    marginTop: spacing.lg,
  },
  categoryForm: {
    backgroundColor: palette.blueSoft,
    borderColor: palette.ink,
    borderWidth: 2,
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  categoryInputBlock: {
    gap: spacing.sm,
  },
  inputLabel: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '900',
  },
  input: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  typeButtonActive: {
    backgroundColor: palette.acid,
  },
  typeButtonText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  colorSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  colorButtonActive: {
    backgroundColor: palette.acid,
  },
  colorSwatch: {
    borderColor: palette.ink,
    borderWidth: 1.5,
    height: 20,
    width: 20,
  },
  categoryStatus: {
    backgroundColor: palette.greenSoft,
    borderColor: palette.ink,
    borderWidth: 2,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  categoryStatusText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryPill: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  addCategoryTile: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 38,
    justifyContent: 'center',
    minWidth: 72,
  },
  addCategoryTileActive: {
    backgroundColor: palette.acid,
  },
  swatch: {
    borderColor: palette.ink,
    borderWidth: 1.5,
    height: 16,
    width: 16,
  },
  categoryText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  deleteCategoryButton: {
    alignItems: 'center',
    backgroundColor: palette.red,
    borderColor: palette.ink,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
  },
  deleteCategoryText: {
    color: palette.white,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  categoryFormActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  categoryHelp: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: spacing.md,
  },
  emptyText: {
    color: palette.muted,
    fontSize: typography.body,
    fontWeight: '800',
  },
  settingsList: {
    borderColor: palette.ink,
    borderWidth: 2,
  },
  settingRow: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderTopColor: palette.ink,
    borderTopWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.md,
  },
  settingIcon: {
    alignItems: 'center',
    backgroundColor: palette.acid,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  settingBody: {
    flex: 1,
  },
  settingTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  settingDetail: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  switchTrack: {
    alignItems: 'center',
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    height: 34,
    justifyContent: 'flex-start',
    paddingHorizontal: 3,
    width: 66,
  },
  switchTrackOn: {
    backgroundColor: palette.acid,
    justifyContent: 'flex-end',
  },
  switchThumb: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  switchThumbOn: {
    backgroundColor: palette.yellow,
  },
  privacyText: {
    color: palette.ink,
    fontSize: typography.h3,
    fontWeight: '900',
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.72,
  },
});

const categoryTypes: Array<{ label: string; value: Category['type'] }> = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' },
];

const categoryColors = ['#FF2E00', '#0D7A3A', '#FFE500', '#001DFF', '#66D9EF', '#B455FF', '#CCFF00', '#999999'];
