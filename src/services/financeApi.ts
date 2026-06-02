import { Platform } from 'react-native';
import type {
  Budget,
  CategorySpend,
  Transaction,
  TransactionType,
} from '../types/finance';

declare const process: {
  env?: Record<string, string | undefined>;
};

const defaultBaseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001/api' : 'http://localhost:3001/api';
const apiBaseUrl = process.env?.EXPO_PUBLIC_API_BASE_URL || defaultBaseUrl;
const devAuthUserId = process.env?.EXPO_PUBLIC_DEV_AUTH_USER_ID || 'local-demo-user';
const devAuthEnabled = process.env?.EXPO_PUBLIC_ENABLE_DEV_AUTH === 'true';
const supabaseUrl = process.env?.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const supabaseAnonKey = process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const authStorageKey = 'ledger-ai-auth-session-v1';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let expiresAt: number | null = null;

type WebStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type PersistedAuthSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type Category = {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  color: string;
  isSystem?: boolean;
  isArchived?: boolean;
};

type ApiCategory = Category & {
  color?: string | null;
};

type ApiTransaction = {
  id: string;
  type: TransactionType;
  amountMinor: number;
  transactionDate: string;
  merchant?: string | null;
  description?: string | null;
  category?: ApiCategory | null;
  tags?: string[];
  source?: Transaction['source'];
};

type ApiBudget = {
  id: string;
  name: string;
  amountMinor: number;
  usedAmountMinor?: number;
  category?: ApiCategory | null;
};

type ApiCategorySpend = {
  categoryId?: string | null;
  name: string;
  color?: string | null;
  amountMinor: number;
  percent: number;
};

type ApiMonthlyReport = {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
  budgets: ApiBudget[];
  recentTransactions: ApiTransaction[];
  topCategories: ApiCategorySpend[];
  aiInsight: string;
};

type ApiTrendReport = {
  granularity: ReportTrendGranularity;
  count: number;
  items: Array<{
    period: string;
    label: string;
    incomeMinor: number;
    expenseMinor: number;
  }>;
};

type ApiListResponse<T> = {
  items: T[];
  total: number;
};

export type MonthlySummary = {
  income: number;
  expense: number;
  balance: number;
  budgetUsedPercent: number;
};

export type DashboardData = {
  monthlySummary: MonthlySummary;
  budgets: Budget[];
  categorySpend: CategorySpend[];
  transactions: Transaction[];
  aiInsight: string;
};

export type MonthlyTrendPoint = {
  period: string;
  label: string;
  income: number;
  expense: number;
};

export type ReportTrendGranularity = 'day' | 'month';

export type ReportTrendOptions = {
  granularity: ReportTrendGranularity;
  count: number;
  end?: string;
};

export type ReportsData = DashboardData & {
  trend: MonthlyTrendPoint[];
};

export type TransactionMutation = {
  type: TransactionType;
  amount: number;
  transactionDate: string;
  merchant?: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
};

export type AiCandidate = {
  type: TransactionType;
  amount: number;
  transactionDate: string;
  merchant?: string;
  categoryName?: string;
  description?: string;
  confidence: number;
  needsReview: string[];
};

export type AiParseResult = {
  jobId: string;
  provider: string;
  candidates: AiCandidate[];
};

type SupabaseSessionResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: {
    id: string;
    email?: string;
  };
  msg?: string;
  error?: string;
  error_description?: string;
};

export const emptyDashboardData: DashboardData = {
  monthlySummary: {
    income: 0,
    expense: 0,
    balance: 0,
    budgetUsedPercent: 0,
  },
  budgets: [],
  categorySpend: [],
  transactions: [],
  aiInsight: '暂无足够数据生成建议。',
};

export const emptyReportsData: ReportsData = {
  ...emptyDashboardData,
  trend: [],
};

export function clearAuthToken() {
  accessToken = null;
  refreshToken = null;
  expiresAt = null;
  getWebStorage()?.removeItem(authStorageKey);
}

export async function restoreAuthSession() {
  const stored = readStoredAuthSession();
  if (!stored) {
    return false;
  }

  accessToken = stored.accessToken;
  refreshToken = stored.refreshToken ?? null;
  expiresAt = stored.expiresAt ?? null;

  try {
    if (shouldRefreshSession()) {
      await refreshAuthSession();
    }
    await getCurrentUser();
    return true;
  } catch {
    clearAuthToken();
    return false;
  }
}

export async function signInWithPassword(email: string, password: string) {
  const session = await supabaseAuthRequest('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setSessionToken(session);
  return getCurrentUser();
}

export async function signUpWithPassword(email: string, password: string, displayName?: string) {
  const session = await supabaseAuthRequest('/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      data: displayName?.trim() ? { full_name: displayName.trim() } : undefined,
    }),
  });
  if (!session.access_token) {
    return { authenticated: false as const };
  }
  setSessionToken(session);
  return { authenticated: true as const, user: await getCurrentUser() };
}

export async function requestPasswordReset(email: string) {
  await supabaseAuthRequest('/recover', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function getCurrentUser() {
  return apiRequest<{ id: string; authUserId: string; email?: string; displayName?: string }>('/auth/me');
}

export async function fetchCategories(type?: Category['type']) {
  const path = type ? `/categories?type=${encodeURIComponent(type)}` : '/categories';
  return apiRequest<ApiCategory[]>(path).then((items) =>
    items
      .map((item) => ({ ...item, color: item.color ?? '#999999' }))
      .filter((item) => !item.isArchived),
  );
}

export async function createCategory(input: Pick<Category, 'name' | 'type' | 'color'>) {
  const created = await apiRequest<ApiCategory>('/categories', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      type: input.type,
      color: input.color,
      icon: 'custom',
    }),
  });
  return { ...created, color: created.color ?? '#999999' };
}

export async function archiveCategory(id: string) {
  const updated = await apiRequest<ApiCategory>(`/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isArchived: true }),
  });
  return { ...updated, color: updated.color ?? '#999999' };
}

export async function fetchDashboardData(month = currentMonth()): Promise<DashboardData> {
  const [monthly, budgets] = await Promise.all([
    fetchMonthlyReport(month),
    apiRequest<ApiBudget[]>(`/budgets?month=${encodeURIComponent(month)}`),
  ]);

  return toDashboardData(monthly, budgets);
}

export async function fetchTransactionsData({
  month = currentMonth(),
  type,
  keyword,
  pageSize = 100,
}: {
  month?: string;
  type?: TransactionType;
  keyword?: string;
  pageSize?: number;
} = {}) {
  const params = new URLSearchParams({ month, pageSize: String(pageSize) });
  if (type) params.set('type', type);
  if (keyword?.trim()) params.set('keyword', keyword.trim());
  const result = await apiRequest<ApiListResponse<ApiTransaction>>(`/transactions?${params.toString()}`);
  return result.items.map(toTransaction);
}

export async function createTransaction(input: TransactionMutation) {
  const created = await apiRequest<ApiTransaction>('/transactions', {
    method: 'POST',
    body: JSON.stringify(toTransactionPayload(input)),
  });
  return toTransaction(created);
}

export async function deleteTransaction(id: string) {
  const deleted = await apiRequest<ApiTransaction>(`/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return toTransaction(deleted);
}

export async function fetchReportsData(
  month = currentMonth(),
  trendOptions: ReportTrendOptions = { granularity: 'month', count: 5 },
): Promise<ReportsData> {
  const [dashboard, trendReports] = await Promise.all([
    fetchDashboardData(month),
    fetchTrendReport(trendOptions, trendOptions.end ?? (trendOptions.granularity === 'month' ? month : currentDay())),
  ]);

  return {
    ...dashboard,
    trend: trendReports.items.map((item) => ({
      period: item.period,
      label: item.label,
      income: fromMinor(item.incomeMinor),
      expense: fromMinor(item.expenseMinor),
    })),
  };
}

export async function parseTransactionText(text: string): Promise<AiParseResult> {
  return parseTransactionPayload({ inputType: 'text', text });
}

export async function parseTransactionImage(input: {
  text?: string;
  imageUrl: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<AiParseResult> {
  return parseTransactionPayload({
    inputType: 'attachment',
    text: input.text,
    imageUrl: input.imageUrl,
    attachmentId: input.attachmentId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
}

export async function uploadBillImage(input: {
  file: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const presigned = await apiRequest<{
    attachment: { id: string };
    uploadUrl: string;
    downloadUrl: string;
    method: 'PUT';
    headers: Record<string, string>;
    storageConfigured: boolean;
  }>('/files/presign-upload', {
    method: 'POST',
    body: JSON.stringify({
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    }),
  });

  if (!presigned.storageConfigured || !presigned.downloadUrl) {
    throw new Error('阿里 OSS 尚未配置，无法上传图片');
  }

  const uploadResponse = await fetch(presigned.uploadUrl, {
    method: presigned.method,
    headers: presigned.headers,
    body: input.file,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text();
    throw new Error(`OSS 上传失败：${uploadResponse.status} ${uploadResponse.statusText}${detail ? `: ${detail}` : ''}`);
  }

  return {
    attachmentId: presigned.attachment.id,
    imageUrl: presigned.downloadUrl,
  };
}

async function parseTransactionPayload(payload: Record<string, unknown>): Promise<AiParseResult> {
  const result = await apiRequest<{
    jobId: string;
    provider: string;
    candidates: Array<Omit<AiCandidate, 'amount'> & { amountMinor: number }>;
  }>('/ai/parse-transaction', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    jobId: result.jobId,
    provider: result.provider,
    candidates: result.candidates.map((item) => ({ ...item, amount: fromMinor(item.amountMinor) })),
  };
}

export async function confirmAiTransaction(
  jobId: string,
  candidate: AiCandidate,
  overrides: Partial<TransactionMutation> = {},
  candidateIndex = 0,
) {
  const confirmed = await apiRequest<{ jobId: string; transaction: ApiTransaction }>(
    `/ai/jobs/${encodeURIComponent(jobId)}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({
        candidateIndex,
        type: overrides.type ?? candidate.type,
        amountMinor: toMinor(overrides.amount ?? candidate.amount),
        transactionDate: overrides.transactionDate ?? candidate.transactionDate,
        merchant: overrides.merchant ?? candidate.merchant,
        description: overrides.description ?? candidate.description,
        categoryId: overrides.categoryId,
        tags: overrides.tags,
      }),
    },
  );
  return toTransaction(confirmed.transaction);
}

export function currentMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function currentDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function fetchMonthlyReport(month: string) {
  return apiRequest<ApiMonthlyReport>(`/reports/monthly?month=${encodeURIComponent(month)}`);
}

async function fetchTrendReport(options: ReportTrendOptions, end: string) {
  const params = new URLSearchParams({
    granularity: options.granularity,
    count: String(options.count),
    end,
  });
  try {
    return await apiRequest<ApiTrendReport>(`/reports/trend?${params.toString()}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('404 ')) {
      return fetchLegacyTrendReport(options, end);
    }
    throw error;
  }
}

async function fetchLegacyTrendReport(options: ReportTrendOptions, end: string): Promise<ApiTrendReport> {
  const periods =
    options.granularity === 'day'
      ? trendDays(end, options.count)
      : trendMonths(end.slice(0, 7), options.count);

  if (options.granularity === 'month') {
    const reports = await Promise.all(periods.map((period) => fetchMonthlyReport(period.period)));
    return {
      granularity: options.granularity,
      count: options.count,
      items: reports.map((item) => ({
        period: item.month,
        label: item.month.slice(5),
        incomeMinor: item.incomeMinor,
        expenseMinor: item.expenseMinor,
      })),
    };
  }

  const months = Array.from(new Set(periods.map((period) => period.period.slice(0, 7))));
  const monthTransactions = await Promise.all(
    months.map((month) =>
      apiRequest<ApiListResponse<ApiTransaction>>(`/transactions?month=${encodeURIComponent(month)}&pageSize=200`),
    ),
  );
  const totals = new Map(periods.map((period) => [period.period, { incomeMinor: 0, expenseMinor: 0, refundMinor: 0 }]));

  monthTransactions.flatMap((result) => result.items).forEach((transaction) => {
    const period = transaction.transactionDate.slice(0, 10);
    const bucket = totals.get(period);
    if (!bucket) {
      return;
    }

    if (transaction.type === 'income') {
      bucket.incomeMinor += Math.abs(transaction.amountMinor);
    } else if (transaction.type === 'refund') {
      bucket.refundMinor += Math.abs(transaction.amountMinor);
    } else if (transaction.type === 'expense') {
      bucket.expenseMinor += Math.abs(transaction.amountMinor);
    }
  });

  return {
    granularity: options.granularity,
    count: options.count,
    items: periods.map((period) => {
      const bucket = totals.get(period.period) ?? { incomeMinor: 0, expenseMinor: 0, refundMinor: 0 };
      return {
        period: period.period,
        label: period.label,
        incomeMinor: bucket.incomeMinor,
        expenseMinor: Math.max(0, bucket.expenseMinor - bucket.refundMinor),
      };
    }),
  };
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await authorizedFetch(path, init);

  if (response.status === 401 && refreshToken) {
    const refreshed = await refreshAuthSessionIfPossible();
    if (refreshed) {
      response = await authorizedFetch(path, init);
    }
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }

  return response.json() as Promise<T>;
}

async function authorizedFetch(path: string, init: RequestInit = {}) {
  const authHeaders: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : devAuthEnabled
      ? {
          'x-dev-auth-user-id': devAuthUserId,
          'x-dev-auth-email': 'demo@finance.local',
          'x-dev-auth-name': 'Demo User',
        }
      : {};
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));

  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
}

async function supabaseAuthRequest(path: string, init: RequestInit): Promise<SupabaseSessionResponse> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('请先配置 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new Error(`无法连接 Supabase Auth：请检查 EXPO_PUBLIC_SUPABASE_URL 是否为 https://项目ref.supabase.co。当前为 ${supabaseUrl}`);
  }
  const payload = (await response.json().catch(() => ({}))) as SupabaseSessionResponse;

  if (!response.ok) {
    const message = payload.error_description || payload.msg || payload.error || `${response.status} ${response.statusText}`;
    if (/invalid login credentials/i.test(message)) {
      throw new Error('邮箱或密码不正确；如果刚注册过，请确认这是当前 Supabase 项目里的账号，或点击“忘记密码”重设密码。');
    }
    throw new Error(message);
  }

  return payload;
}

function setSessionToken(session: SupabaseSessionResponse) {
  if (!session.access_token) {
    throw new Error('认证成功但未返回访问令牌；如果开启了邮箱确认，请先完成邮箱验证后再登录。');
  }
  accessToken = session.access_token;
  refreshToken = session.refresh_token ?? refreshToken;
  expiresAt = session.expires_at ?? (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : expiresAt);
  writeStoredAuthSession();
}

function shouldRefreshSession() {
  if (!refreshToken || !expiresAt) {
    return false;
  }
  return expiresAt - Math.floor(Date.now() / 1000) <= 60;
}

async function refreshAuthSessionIfPossible() {
  try {
    await refreshAuthSession();
    return true;
  } catch {
    clearAuthToken();
    return false;
  }
}

async function refreshAuthSession() {
  if (!refreshToken) {
    throw new Error('Missing refresh token');
  }

  const session = await supabaseAuthRequest('/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  setSessionToken(session);
}

function writeStoredAuthSession() {
  if (!accessToken) {
    return;
  }

  getWebStorage()?.setItem(
    authStorageKey,
    JSON.stringify({
      accessToken,
      refreshToken: refreshToken ?? undefined,
      expiresAt: expiresAt ?? undefined,
    } satisfies PersistedAuthSession),
  );
}

function readStoredAuthSession() {
  const raw = getWebStorage()?.getItem(authStorageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAuthSession>;
    if (typeof parsed.accessToken !== 'string' || !parsed.accessToken) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
    } satisfies PersistedAuthSession;
  } catch {
    getWebStorage()?.removeItem(authStorageKey);
    return null;
  }
}

function getWebStorage(): WebStorage | null {
  if (typeof globalThis !== 'object' || !('localStorage' in globalThis)) {
    return null;
  }
  return (globalThis as typeof globalThis & { localStorage?: WebStorage }).localStorage ?? null;
}

function toDashboardData(monthly: ApiMonthlyReport, budgets: ApiBudget[]): DashboardData {
  const normalizedBudgets = budgets.map(toBudget);
  const mainBudget = normalizedBudgets[0];
  const budgetUsedPercent = mainBudget && mainBudget.limit > 0 ? Math.round((mainBudget.used / mainBudget.limit) * 100) : 0;

  return {
    monthlySummary: {
      income: fromMinor(monthly.incomeMinor),
      expense: fromMinor(monthly.expenseMinor),
      balance: fromMinor(monthly.balanceMinor),
      budgetUsedPercent,
    },
    budgets: normalizedBudgets,
    categorySpend: monthly.topCategories.map(toCategorySpend),
    transactions: monthly.recentTransactions.map(toTransaction),
    aiInsight: monthly.aiInsight,
  };
}

function toTransaction(item: ApiTransaction): Transaction {
  const { date, time } = formatDateTime(item.transactionDate);
  return {
    id: item.id,
    type: item.type,
    merchant: item.merchant || item.description || '未命名交易',
    category: item.category?.name ?? '未分类',
    amount: fromMinor(item.amountMinor),
    occurredOn: item.transactionDate.slice(0, 10),
    date,
    time,
    tags: item.tags ?? [],
    source: item.source ?? 'manual',
    note: item.description ?? undefined,
  };
}

function toBudget(item: ApiBudget): Budget {
  const kind = item.category ? 'category' : 'monthly';
  return {
    id: item.id,
    name: item.name,
    limit: fromMinor(item.amountMinor),
    used: fromMinor(item.usedAmountMinor ?? 0),
    kind,
  };
}

function toCategorySpend(item: ApiCategorySpend): CategorySpend {
  return {
    name: item.name,
    amount: fromMinor(item.amountMinor),
    color: item.color ?? '#999999',
    percent: item.percent,
  };
}

function toTransactionPayload(input: TransactionMutation) {
  const amount = input.type === 'expense' ? -Math.abs(input.amount) : Math.abs(input.amount);
  return {
    type: input.type,
    amountMinor: toMinor(amount),
    transactionDate: input.transactionDate,
    merchant: input.merchant,
    description: input.description,
    categoryId: input.categoryId,
    tags: input.tags ?? [],
    source: 'manual',
    isIncludedInBudget: true,
  };
}

function fromMinor(value: number) {
  return value / 100;
}

function toMinor(value: number) {
  return Math.round(value * 100);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: '--', time: '--' };
  }
  return {
    date: `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}

function trendDays(end: string, count: number) {
  const fallback = new Date();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(end) ? new Date(`${end}T00:00:00.000Z`) : fallback;
  const endDate = Number.isNaN(parsed.getTime())
    ? new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate()))
    : parsed;

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCDate(endDate.getUTCDate() - (count - 1 - index));
    const period = date.toISOString().slice(0, 10);
    return { period, label: period.slice(5) };
  });
}

function trendMonths(endMonth: string, count: number) {
  const [year, monthIndex] = /^\d{4}-\d{2}$/.test(endMonth)
    ? endMonth.split('-').map(Number)
    : currentMonth().split('-').map(Number);
  const endDate = new Date(Date.UTC(year, monthIndex - 1, 1));

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCMonth(endDate.getUTCMonth() - (count - 1 - index));
    const period = date.toISOString().slice(0, 7);
    return { period, label: period.slice(5) };
  });
}
