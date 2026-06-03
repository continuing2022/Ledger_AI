import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, DataStateBanner, LabeledField, Pill, SectionHeader } from '../components/Primitives';
import { formatCurrency, palette, spacing, typography } from '../design/theme';
import {
  confirmAiTransaction,
  createTransaction,
  fetchCategories,
  parseTransactionImage,
  parseTransactionText,
  type AiCandidate,
  type Category,
  uploadBillImage,
} from '../services/financeApi';
import type { EntryMode, TransactionType } from '../types/finance';

type PendingAiCandidate = AiCandidate & {
  sourceIndex: number;
};

type UploadedBillImage = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewUri: string;
  file: File;
};

const transactionTypes: Array<{ label: string; value: TransactionType }> = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' },
  { label: '退款', value: 'refund' },
];

type SpeechRecognitionResultLike = {
  [index: number]: { transcript?: string };
  length: number;
};

type SpeechRecognitionEventLike = {
  results: {
    [index: number]: SpeechRecognitionResultLike;
    length: number;
  };
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechGlobal = typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function EntryScreen({ initialMode = 'ai' }: { initialMode?: EntryMode }) {
  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let ignore = false;
    setCategoryLoading(true);
    fetchCategories()
      .then((items) => {
        if (!ignore) {
          setCategories(items);
          setCategoryError(null);
        }
      })
      .catch((error: Error) => {
        if (!ignore) {
          setCategoryError(error.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setCategoryLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <View>
      <DataStateBanner loading={categoryLoading} error={categoryError} />
      <Text style={styles.pageTitle}>记账</Text>
      <Text style={styles.pageLead}>AI 解析和手动录入都会写入后端交易表，保存后首页、交易和报表会读取同一份数据。</Text>

      <View style={styles.segmented}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="切换到 AI 快速记账"
          onPress={() => setMode('ai')}
          style={[styles.segment, mode === 'ai' ? styles.segmentActive : null]}
        >
          <Ionicons name="sparkles-outline" size={18} color={palette.ink} />
          <Text style={styles.segmentText}>AI 快速记账</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="切换到手动记账"
          onPress={() => setMode('manual')}
          style={[styles.segment, mode === 'manual' ? styles.segmentActive : null]}
        >
          <Ionicons name="create-outline" size={18} color={palette.ink} />
          <Text style={styles.segmentText}>手动记账</Text>
        </Pressable>
      </View>

      {mode === 'ai' ? <AiEntry categories={categories} /> : null}
      {mode === 'manual' ? <ManualEntry categories={categories} /> : null}
    </View>
  );
}

function AiEntry({ categories }: { categories: Category[] }) {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PendingAiCandidate[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState<UploadedBillImage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expenseCategories = categories.filter((item) => item.type === 'expense');
  const candidate = candidates[candidateIndex] ?? null;

  const selectedCategoryName = useMemo(
    () => expenseCategories.find((item) => item.id === categoryId)?.name ?? candidate?.categoryName ?? '未分类',
    [candidate?.categoryName, categoryId, expenseCategories],
  );

  useEffect(() => {
    return () => {
      if (typeof URL !== 'undefined' && selectedImage?.previewUri.startsWith('blob:')) {
        URL.revokeObjectURL(selectedImage.previewUri);
      }
    };
  }, [selectedImage?.previewUri]);

  const handleParse = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const trimmedInput = input.trim();
      let result;
      if (selectedImage) {
        setMessage('正在上传图片到 OSS...');
        const uploadedImage = await uploadBillImage({
          file: selectedImage.file,
          fileName: selectedImage.fileName,
          mimeType: selectedImage.mimeType,
          sizeBytes: selectedImage.sizeBytes,
        });
        setMessage('图片已上传，正在解析账单...');
        result = await parseTransactionImage({
          text: trimmedInput || undefined,
          imageUrl: uploadedImage.imageUrl,
          attachmentId: uploadedImage.attachmentId,
          fileName: selectedImage.fileName,
          mimeType: selectedImage.mimeType,
          sizeBytes: selectedImage.sizeBytes,
        });
      } else {
        result = await parseTransactionText(trimmedInput);
      }
      const nextCandidate = result.candidates[0] ?? null;
      setJobId(result.jobId);
      setCandidates(result.candidates.map((item, index) => ({ ...item, sourceIndex: index })));
      setCandidateIndex(0);
      setCategoryId(expenseCategories.find((item) => item.name === nextCandidate?.categoryName)?.id);
      setMessage(
        nextCandidate
          ? `已由 ${result.provider} 解析出 ${result.candidates.length} 条候选，确认后才会入账。`
          : `已由 ${result.provider} 解析，但没有识别出候选交易。`,
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'AI 解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectImage = async () => {
    if (Platform.OS !== 'web') {
      setError('当前图片上传先支持 Web 浏览器。');
      setMessage(null);
      return;
    }

    setError(null);
    try {
      const image = await pickBillImage();
      if (!image) {
        return;
      }
      setSelectedImage(image);
      setMessage(`已选择图片：${image.fileName}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '图片读取失败');
      setMessage(null);
    }
  };

  const handleVoiceInput = () => {
    if (Platform.OS !== 'web') {
      setError('当前语音录入先支持 Web 浏览器。');
      setMessage(null);
      return;
    }

    const speechGlobal = globalThis as SpeechGlobal;
    const SpeechRecognition = speechGlobal.SpeechRecognition ?? speechGlobal.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('当前浏览器不支持语音识别，请使用 Chrome 或 Edge。');
      setMessage(null);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setInput((current) => [current.trim(), transcript].filter(Boolean).join(' '));
        setMessage('已填入语音识别文本。');
      } else {
        setMessage('未识别到语音内容。');
      }
      setError(null);
    };
    recognition.onerror = (event) => {
      setError(`语音识别失败${event.error ? `：${event.error}` : ''}`);
      setMessage(null);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    setIsListening(true);
    setError(null);
    setMessage('正在聆听...');

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setError('语音识别启动失败，请确认浏览器麦克风权限。');
      setMessage(null);
    }
  };

  const handleConfirm = async () => {
    if (!jobId || !candidate) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const transaction = await confirmAiTransaction(jobId, candidate, { categoryId }, candidate.sourceIndex);
      const remainingCandidates = candidates.filter((_, index) => index !== candidateIndex);
      const nextIndex = Math.min(candidateIndex, Math.max(remainingCandidates.length - 1, 0));
      const nextCandidate = remainingCandidates[nextIndex];
      setMessage(
        remainingCandidates.length > 0
          ? `已入账：${transaction.merchant} ${formatCurrency(transaction.amount)}，还有 ${remainingCandidates.length} 条候选待确认。`
          : `已入账：${transaction.merchant} ${formatCurrency(transaction.amount)}`,
      );
      setCandidates(remainingCandidates);
      setCandidateIndex(nextIndex);
      setCategoryId(expenseCategories.find((item) => item.name === nextCandidate?.categoryName)?.id);
      if (remainingCandidates.length === 0) {
        setJobId(null);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '确认入账失败');
    } finally {
      setSaving(false);
    }
  };

  const selectCandidate = (index: number) => {
    const nextCandidate = candidates[index];
    setCandidateIndex(index);
    setCategoryId(expenseCategories.find((item) => item.name === nextCandidate?.categoryName)?.id);
  };

  return (
    <View>
      <SectionHeader title="自然语言输入" action="POST /ai/parse-transaction" />
      <Card accent={palette.blueSoft}>
        <Text style={styles.label}>账单文本或自然语言</Text>
        <TextInput
          accessibilityLabel="AI 快速记账输入"
          multiline
          onChangeText={setInput}
          placeholder="例如：昨天星巴克花了 32 元"
          placeholderTextColor={palette.muted}
          style={styles.textArea}
          value={input}
        />
        {selectedImage ? (
          <View style={styles.uploadPreview}>
            <Image
              accessibilityLabel={`已选择图片 ${selectedImage.fileName}`}
              source={{ uri: selectedImage.previewUri }}
              style={styles.uploadPreviewImage}
            />
            <View style={styles.uploadPreviewCopy}>
              <Text style={styles.uploadPreviewText}>{selectedImage.fileName}</Text>
              <Text style={styles.uploadPreviewMeta}>{formatFileSize(selectedImage.sizeBytes)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="移除图片"
              onPress={() => setSelectedImage(null)}
              style={styles.uploadRemoveButton}
            >
              <Ionicons name="close-outline" size={20} color={palette.ink} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <ActionButton
            label={loading ? '解析中' : '解析账单'}
            icon="scan-outline"
            onPress={handleParse}
            disabled={loading || isListening || (!input.trim() && !selectedImage)}
            loading={loading}
          />
          <ActionButton
            label={isListening ? '聆听中' : '语音录入'}
            icon={isListening ? 'mic' : 'mic-outline'}
            onPress={handleVoiceInput}
            variant="secondary"
            disabled={loading || isListening}
            loading={isListening}
          />
          <ActionButton
            label={selectedImage ? '更换图片' : '上传图片'}
            icon="image-outline"
            onPress={handleSelectImage}
            variant="secondary"
            disabled={loading || isListening}
          />
        </View>
        <InlineStatus error={error} message={message} />
      </Card>

      <SectionHeader title="解析候选结果" action={candidate ? '待用户确认' : '等待解析'} />
      <Card>
        {candidate ? (
          <>
            {candidates.length > 1 ? (
              <View style={styles.candidateTabs}>
                {candidates.map((item, index) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`查看第 ${index + 1} 条候选`}
                    key={`${item.amount}-${item.description ?? item.merchant ?? index}`}
                    onPress={() => selectCandidate(index)}
                    style={[styles.candidateTab, candidateIndex === index ? styles.candidateTabActive : null]}
                  >
                    <Text style={styles.candidateTabText}>{`候选 ${index + 1}`}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.candidateHeader}>
              <View>
                <Text style={styles.candidateMerchant}>{candidate.merchant ?? candidate.description ?? '未命名交易'}</Text>
                <Text style={styles.meta}>置信度 {(candidate.confidence * 100).toFixed(0)}%</Text>
              </View>
              <Text style={styles.candidateAmount}>{formatCurrency(-Math.abs(candidate.amount))}</Text>
            </View>
            <View style={styles.fieldGrid}>
              <LabeledField label="类型" value={typeText(candidate.type)} icon="swap-horizontal-outline" />
              <LabeledField label="分类" value={selectedCategoryName} icon="pricetag-outline" />
              <LabeledField label="日期" value={new Date(candidate.transactionDate).toLocaleDateString('zh-CN')} icon="calendar-outline" />
            </View>
            <CategoryChooser categories={expenseCategories} selectedId={categoryId} onChange={setCategoryId} />
            <View style={styles.reviewRow}>
              {candidate.needsReview.map((item) => (
                <Pill key={item} label={`${reviewText(item)}待确认`} tone="yellow" />
              ))}
            </View>
            <View style={styles.actionRow}>
              <ActionButton
                label={saving ? '保存中' : '确认入账'}
                icon="checkmark-circle-outline"
                onPress={handleConfirm}
                disabled={saving}
                loading={saving}
              />
              <ActionButton label="重新解析" icon="refresh-outline" variant="secondary" onPress={handleParse} disabled={loading} />
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>输入账单文本后点击解析，候选结果会显示在这里。</Text>
        )}
      </Card>
    </View>
  );
}

function ManualEntry({ categories }: { categories: Category[] }) {
  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(currentDateInputValue());
  const [tags, setTags] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const availableCategories = categories.filter((item) =>
    selectedType === 'income' ? item.type === 'income' : selectedType === 'transfer' ? item.type === 'transfer' : item.type === 'expense',
  );

  useEffect(() => {
    setCategoryId(availableCategories[0]?.id);
  }, [selectedType, availableCategories[0]?.id]);

  const handleSave = async () => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('请输入大于 0 的金额');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const transaction = await createTransaction({
        type: selectedType,
        amount: parsedAmount,
        transactionDate,
        merchant: merchant.trim(),
        description: description.trim() || undefined,
        categoryId,
        tags: tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setMessage(`已保存：${transaction.merchant} ${formatCurrency(transaction.amount)}`);
      setMerchant('');
      setAmount('');
      setDescription('');
      setTags('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存交易失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <SectionHeader title="手动记账" action="POST /transactions" />
      <Card>
        <View style={styles.typeGrid}>
          {transactionTypes.map((type) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`选择${type.label}`}
              key={type.value}
              onPress={() => setSelectedType(type.value)}
              style={[styles.typeButton, selectedType === type.value ? styles.typeButtonActive : null]}
            >
              <Text style={styles.typeButtonText}>{type.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.fieldGrid}>
          <FormInput
            label="金额"
            value={amount}
            onChangeText={setAmount}
            icon="cash-outline"
            keyboardType="decimal-pad"
            placeholder="例如：128.60"
          />
          <FormInput
            label="商户"
            value={merchant}
            onChangeText={setMerchant}
            icon="business-outline"
            placeholder="例如：盒马鲜生"
          />
          <DatePickerField value={transactionDate} onChange={setTransactionDate} />
          <FormInput
            label="标签"
            value={tags}
            onChangeText={setTags}
            icon="bookmark-outline"
            placeholder="例如：晚餐, 生鲜"
          />
        </View>
        <FormInput
          label="备注"
          value={description}
          onChangeText={setDescription}
          icon="document-text-outline"
          placeholder="例如：周末家庭采购"
        />
        <CategoryChooser categories={availableCategories} selectedId={categoryId} onChange={setCategoryId} />
        <View style={styles.actionRow}>
          <ActionButton label={saving ? '保存中' : '保存交易'} icon="save-outline" onPress={handleSave} disabled={saving} loading={saving} />
          <ActionButton
            label="清空"
            icon="trash-outline"
            variant="danger"
            onPress={() => {
              setAmount('');
              setMerchant('');
              setDescription('');
              setTransactionDate(currentDateInputValue());
              setTags('');
              setMessage(null);
              setError(null);
            }}
          />
        </View>
        <InlineStatus error={error} message={message} />
      </Card>
    </View>
  );
}

function pickBillImage(): Promise<UploadedBillImage | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('当前环境不支持图片选择'));
      return;
    }

    const inputElement = document.createElement('input');
    inputElement.type = 'file';
    inputElement.accept = 'image/png,image/jpeg,image/webp';
    inputElement.onchange = () => {
      const file = inputElement.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
        reject(new Error('请选择 PNG、JPG 或 WebP 图片'));
        return;
      }
      const maxBytes = 8 * 1024 * 1024;
      if (file.size > maxBytes) {
        reject(new Error('图片不能超过 8MB'));
        return;
      }
      resolve({
        file,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        previewUri: URL.createObjectURL(file),
      });
    };
    inputElement.click();
  });
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function DatePickerField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthInputValue(value || currentDateInputValue()));
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const changeMonth = (offset: number) => {
    setVisibleMonth((current) => addMonths(current, offset));
  };

  const selectDate = (nextValue: string) => {
    onChange(nextValue);
    setVisibleMonth(monthInputValue(nextValue));
    setIsOpen(false);
  };

  const selectToday = () => {
    selectDate(currentDateInputValue());
  };

  return (
    <View style={[styles.formInput, styles.datePickerField]}>
      <View style={styles.inputLabel}>
        <Ionicons name="calendar-outline" size={16} color={palette.muted} />
        <Text style={styles.label}>日期</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开日期选择器"
        onPress={() => setIsOpen((next) => !next)}
        style={styles.dateDisplay}
      >
        <Text style={styles.dateDisplayText}>{value || '选择日期'}</Text>
        <Ionicons name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={palette.ink} />
      </Pressable>

      {isOpen ? (
        <View style={styles.calendarPanel}>
          <View style={styles.calendarHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="上个月" onPress={() => changeMonth(-1)} style={styles.calendarIconButton}>
              <Ionicons name="chevron-back-outline" size={18} color={palette.ink} />
            </Pressable>
            <Text style={styles.calendarTitle}>{visibleMonth.replace('-', ' 年 ')} 月</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="下个月" onPress={() => changeMonth(1)} style={styles.calendarIconButton}>
              <Ionicons name="chevron-forward-outline" size={18} color={palette.ink} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
              <Text key={day} style={styles.weekText}>{day}</Text>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {calendarDays.map((day, index) =>
              day ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`选择日期 ${day.value}`}
                  key={day.value}
                  onPress={() => selectDate(day.value)}
                  style={[styles.dayButton, value === day.value ? styles.dayButtonActive : null]}
                >
                  <Text style={styles.dayText}>{day.label}</Text>
                </Pressable>
              ) : (
                <View key={`blank-${index}`} style={styles.dayBlank} />
              ),
            )}
          </View>

          <View style={styles.calendarActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="选择今天" onPress={selectToday} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>今天</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭日期选择器" onPress={() => setIsOpen(false)} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>关闭</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CategoryChooser({
  categories,
  selectedId,
  onChange,
}: {
  categories: Category[];
  selectedId?: string;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <View style={styles.categoryChooser}>
      <Text style={styles.label}>分类</Text>
      <View style={styles.categoryGrid}>
        {categories.length === 0 ? <Text style={styles.emptyText}>后端暂无可用分类。</Text> : null}
        {categories.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`选择分类${item.name}`}
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[styles.categoryButton, selectedId === item.id ? styles.categoryButtonActive : null]}
          >
            <View style={[styles.swatch, { backgroundColor: item.color }]} />
            <Text style={styles.categoryButtonText}>{item.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FormInput({
  label,
  icon,
  ...inputProps
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.formInput}>
      <View style={styles.inputLabel}>
        <Ionicons name={icon} size={16} color={palette.muted} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <TextInput placeholderTextColor={palette.muted} style={styles.input} {...inputProps} />
    </View>
  );
}

function InlineStatus({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) return null;
  return (
    <View style={[styles.statusBox, error ? styles.statusError : null]}>
      <Text style={styles.statusText}>{error ?? message}</Text>
    </View>
  );
}

function typeText(type: TransactionType) {
  const map: Record<TransactionType, string> = {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    refund: '退款',
  };
  return map[type];
}

function reviewText(key: string) {
  const map: Record<string, string> = {
    categoryId: '分类',
    amountMinor: '金额',
  };
  return map[key] ?? key;
}

function currentDateInputValue() {
  return formatDateInputValue(new Date());
}

function monthInputValue(value: string) {
  return value.slice(0, 7);
}

function addMonths(monthValue: string, offset: number) {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildCalendarDays(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const blanks = Array.from<null>({ length: firstDay.getDay() }).fill(null);
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);
    return {
      label: String(index + 1),
      value: formatDateInputValue(date),
    };
  });
  return [...blanks, ...days];
}

function formatDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  segmented: {
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  segment: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  segmentActive: {
    backgroundColor: palette.acid,
  },
  segmentText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  label: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '900',
  },
  textArea: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    color: palette.ink,
    fontSize: typography.h3,
    fontWeight: '800',
    marginTop: spacing.sm,
    minHeight: 132,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  uploadPreview: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginTop: spacing.md,
    minHeight: 88,
    padding: spacing.sm,
  },
  uploadPreviewImage: {
    backgroundColor: palette.surface,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 68,
    resizeMode: 'cover',
    width: 92,
  },
  uploadPreviewCopy: {
    alignItems: 'flex-start',
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  uploadPreviewText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  uploadPreviewMeta: {
    color: palette.muted,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  uploadRemoveButton: {
    alignItems: 'center',
    backgroundColor: palette.yellow,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  candidateTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  candidateTab: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  candidateTabActive: {
    backgroundColor: palette.yellow,
  },
  candidateTabText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  candidateHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  candidateMerchant: {
    color: palette.ink,
    fontSize: typography.h1,
    fontWeight: '900',
  },
  candidateAmount: {
    color: palette.red,
    fontSize: typography.h1,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  meta: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  reviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  typeButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 88,
    paddingHorizontal: spacing.md,
  },
  typeButtonActive: {
    backgroundColor: palette.yellow,
  },
  typeButtonText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  formInput: {
    flex: 1,
    marginBottom: spacing.md,
    minWidth: 148,
  },
  datePickerField: {
    minWidth: 260,
    zIndex: 2,
  },
  inputLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '800',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateDisplay: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateDisplayText: {
    color: palette.ink,
    fontSize: typography.body,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  calendarPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.ink,
    borderWidth: 2,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  calendarIconButton: {
    alignItems: 'center',
    backgroundColor: palette.yellow,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  calendarTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekText: {
    color: palette.muted,
    flexBasis: `${100 / 7}%`,
    fontSize: typography.tiny,
    fontWeight: '900',
    textAlign: 'center',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  dayButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 1,
    flexBasis: `${100 / 7}%`,
    height: 36,
    justifyContent: 'center',
  },
  dayButtonActive: {
    backgroundColor: palette.acid,
  },
  dayBlank: {
    flexBasis: `${100 / 7}%`,
    height: 36,
  },
  dayText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  calendarActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  todayButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  todayButtonText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  categoryChooser: {
    marginTop: spacing.lg,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  categoryButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  categoryButtonActive: {
    backgroundColor: palette.acid,
  },
  categoryButtonText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  swatch: {
    borderColor: palette.ink,
    borderWidth: 1.5,
    height: 16,
    width: 16,
  },
  statusBox: {
    backgroundColor: palette.greenSoft,
    borderColor: palette.ink,
    borderWidth: 2,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  statusError: {
    backgroundColor: palette.dangerSoft,
  },
  statusText: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  emptyText: {
    color: palette.muted,
    fontSize: typography.body,
    fontWeight: '800',
    lineHeight: 22,
  },
});
