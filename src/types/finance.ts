export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund';

export type Transaction = {
  id: string;
  type: TransactionType;
  merchant: string;
  category: string;
  amount: number;
  occurredOn: string;
  date: string;
  time: string;
  tags: string[];
  source: 'manual' | 'ai_parse' | 'import';
  note?: string;
};

export type Budget = {
  id: string;
  name: string;
  limit: number;
  used: number;
  kind: 'monthly' | 'category';
};

export type CategorySpend = {
  name: string;
  amount: number;
  color: string;
  percent: number;
};

export type AiCandidate = {
  type: TransactionType;
  amount: number;
  merchant: string;
  category: string;
  date: string;
  confidence: number;
  needsReview: string[];
};

export type EntryMode = 'ai' | 'manual';

export type ScreenKey = 'home' | 'entry' | 'transactions' | 'reports' | 'settings';
