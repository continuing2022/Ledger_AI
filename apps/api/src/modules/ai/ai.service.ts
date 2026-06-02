import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiInputType, AiJobStatus, TransactionSource, TransactionType } from '@prisma/client';
import { parseDate } from '../../common/date-range';
import { optionalString, optionalStringArray } from '../../common/parse';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

type AiCandidate = {
  type: TransactionType;
  amountMinor: number;
  transactionDate: string;
  merchant?: string;
  categoryName?: string;
  description?: string;
  confidence: number;
  needsReview: string[];
};

type ConfirmedCandidate = {
  candidateIndex: number;
  transactionId: string;
};

type AiResultJson = {
  candidates?: AiCandidate[];
  confirmedCandidates?: ConfirmedCandidate[];
};

type AiMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transactions: TransactionsService,
  ) {}

  async parseTransaction(userId: string, body: Record<string, unknown>) {
    const inputType = body.inputType === 'attachment' ? AiInputType.attachment : AiInputType.text;
    const text = optionalString(body.text);
    const attachmentId = optionalString(body.attachmentId);
    const imageDataUrl = optionalImageDataUrl(body.imageDataUrl);
    const imageUrl = optionalImageUrl(body.imageUrl);
    if (inputType === AiInputType.text && !text && !imageDataUrl && !imageUrl) {
      throw new BadRequestException('text, imageUrl or imageDataUrl is required');
    }
    if (inputType === AiInputType.attachment && !attachmentId && !imageDataUrl && !imageUrl) {
      throw new BadRequestException('attachmentId, imageUrl or imageDataUrl is required');
    }

    if (attachmentId) {
      const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, userId } });
      if (!attachment) {
        throw new NotFoundException('Attachment not found');
      }
    }

    const provider = (this.config.get<string>('AI_PROVIDER') || 'mock').trim().toLowerCase();
    const job = await this.prisma.aiParseJob.create({
      data: {
        userId,
        provider,
        inputType,
        inputText: text,
        inputAttachmentId: attachmentId,
        status: AiJobStatus.processing,
      },
    });

    const parsedCandidates =
      provider === 'openai' || provider === 'qwen'
        ? await this.openAiCompatibleParse(text ?? '', imageUrl ?? imageDataUrl)
        : await this.mockParse(text ?? '');
    const candidates = parsedCandidates.length > 0 ? parsedCandidates : this.heuristicParse(text ?? '');
    await this.prisma.aiParseJob.update({
      where: { id: job.id },
      data: { status: AiJobStatus.succeeded, resultJson: { candidates } },
    });

    return { jobId: job.id, provider, candidates };
  }

  async confirm(userId: string, id: string, body: Record<string, unknown>) {
    const job = await this.prisma.aiParseJob.findFirst({ where: { id, userId } });
    if (!job) {
      throw new NotFoundException('AI job not found');
    }

    const result = this.parseResultJson(job.resultJson);
    const confirmedCandidates = result.confirmedCandidates ?? [];
    if (!this.canConfirmCandidate(job.status, result, confirmedCandidates)) {
      throw new BadRequestException('AI job is not confirmable');
    }

    const candidateIndex = this.normalizeCandidateIndex(body.candidateIndex);
    const candidate = this.selectCandidate(result, candidateIndex);
    if (confirmedCandidates.some((item) => item.candidateIndex === candidateIndex)) {
      throw new BadRequestException('AI candidate is already confirmed');
    }

    const type = this.normalizeTransactionType(body.type ?? candidate.type);
    const transaction = await this.transactions.create(userId, {
      type,
      amountMinor: this.signedAmount(type, body.amountMinor ?? candidate.amountMinor),
      transactionDate: body.transactionDate ?? candidate.transactionDate,
      merchant: body.merchant ?? candidate.merchant,
      description: body.description ?? candidate.description,
      categoryId: body.categoryId,
      tags: optionalStringArray(body.tags),
      source: TransactionSource.ai_parse,
      isIncludedInBudget: true,
    });
    const nextConfirmedCandidates = confirmedCandidates.concat({ candidateIndex, transactionId: transaction.id });
    const allCandidatesConfirmed = Boolean(result.candidates?.length && nextConfirmedCandidates.length >= result.candidates.length);

    await this.prisma.aiParseJob.update({
      where: { id },
      data: {
        status: allCandidatesConfirmed ? AiJobStatus.confirmed : AiJobStatus.succeeded,
        resultJson: { ...result, confirmedCandidates: nextConfirmedCandidates },
        createdTransactionId: transaction.id,
      },
    });

    return { jobId: id, transaction };
  }

  private async mockParse(text: string): Promise<AiCandidate[]> {
    return this.heuristicParse(text);
  }

  private heuristicParse(text: string): AiCandidate[] {
    const chunks = this.extractTransactionChunks(text);
    const candidates = chunks
      .map((chunk) => this.heuristicCandidate(chunk, text))
      .filter((candidate): candidate is AiCandidate => Boolean(candidate));

    if (candidates.length > 0) {
      return candidates;
    }

    const amountMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
    const amountMinor = amountMatch ? Math.round(Number(amountMatch[1]) * 100) : 0;
    const normalized = text.toLowerCase();
    const merchant = this.extractMerchant(text);
    const categoryName = normalized.includes('星巴克') || normalized.includes('咖啡') ? '餐饮' : undefined;

    return [
      {
        type: TransactionType.expense,
        amountMinor,
        transactionDate: parseDateHint(text).toISOString(),
        merchant,
        categoryName,
        description: text.slice(0, 120),
        confidence: amountMinor > 0 ? 0.72 : 0.38,
        needsReview: ['categoryId'].concat(amountMinor > 0 ? [] : ['amountMinor']),
      },
    ];
  }

  private extractTransactionChunks(text: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const matches = Array.from(normalized.matchAll(/[^，,。；;\n]*?\d+(?:\.\d{1,2})?\s*(?:元|块|人民币|rmb|RMB|¥)?/g))
      .map((match) => match[0].trim())
      .filter(Boolean);
    return matches.length > 1 ? matches : [normalized];
  }

  private heuristicCandidate(chunk: string, originalText: string): AiCandidate | null {
    const amountMatch = chunk.match(/(\d+(?:\.\d{1,2})?)/);
    if (!amountMatch) {
      return null;
    }

    const normalized = chunk.toLowerCase();
    const type = this.inferTransactionType(chunk);
    const amountMinor = Math.round(Number(amountMatch[1]) * 100);
    const merchant = this.extractMerchant(chunk);
    const categoryName =
      normalized.includes('星巴克') || normalized.includes('咖啡') || normalized.includes('吃') || normalized.includes('餐')
        ? '餐饮'
        : normalized.includes('地铁') || normalized.includes('公交') || normalized.includes('打车')
          ? '交通'
          : undefined;

    return {
      type,
      amountMinor,
      transactionDate: parseDateHint(originalText).toISOString(),
      merchant,
      categoryName,
      description: chunk.slice(0, 120),
      confidence: merchant || categoryName ? 0.72 : 0.62,
      needsReview: ['categoryId'].concat(categoryName ? [] : ['merchant']),
    };
  }

  private inferTransactionType(text: string) {
    if (/退款|退回|返还/.test(text)) {
      return TransactionType.refund;
    }
    if (/收入|工资|奖金|收款|到账/.test(text)) {
      return TransactionType.income;
    }
    if (/转账/.test(text)) {
      return TransactionType.transfer;
    }
    return TransactionType.expense;
  }

  private async openAiCompatibleParse(text: string, imageDataUrl?: string): Promise<AiCandidate[]> {
    const apiKey = this.config.get<string>('QWEN_API_KEY') || this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('QWEN_API_KEY or OPENAI_API_KEY is required when AI_PROVIDER=openai/qwen');
    }

    const baseUrl = (this.config.get<string>('QWEN_BASE_URL') || this.config.get<string>('OPENAI_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
    const model = this.config.get<string>('QWEN_MODEL') || this.config.get<string>('OPENAI_MODEL') || 'qwen3.6-plus';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: this.transactionParseSystemPrompt(),
          },
          {
            role: 'user',
            content: this.aiUserContent(text, imageDataUrl),
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 900,
        temperature: this.openAiTemperature(),
        stream: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      const modelHint =
        response.status === 404
          ? ` 请检查 QWEN_MODEL/OPENAI_MODEL="${model}" 是否为有效且账号有权限的模型，例如 qwen3.6-plus。`
          : '';
      throw new InternalServerErrorException(`Qwen API failed: ${response.status} ${detail}${modelHint}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new InternalServerErrorException('Qwen API returned empty content');
    }

    const parsed = this.parseAiJson(content);
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [parsed];
    return candidates.map((candidate) => this.normalizeAiCandidate(candidate, text));
  }

  private aiUserContent(text: string, imageDataUrl?: string): AiMessageContent {
    const prompt = `当前时间：${new Date().toISOString()}
用户账单文本：${text || '未提供文本，请从图片账单中识别交易信息。'}

要求：
- 如果文本或图片里有多个金额、多个订单、多个消费片段，请为每个片段输出一条候选交易。
- 图片里常见字段包括金额、商户、付款时间、支付方式、订单说明，请尽量提取。
- 商户缺失时 merchant 填消费事项或用途，例如“吃饭”“咖啡”“打车”。
- 不能因为商户缺失而丢弃金额，只有完全没有金额时才允许返回空 candidates。`;

    if (!imageDataUrl) {
      return prompt;
    }

    return [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ];
  }

  private transactionParseSystemPrompt() {
    return `你是个人记账应用的账单解析器。请只输出合法 json，不要输出 markdown。
目标：从中文或英文自然语言、支付通知、账单文本中提取一条或多条候选交易。
输出 JSON 格式示例：
{
  "candidates": [
    {
      "type": "expense",
      "amountMinor": 3200,
      "transactionDate": "2026-05-31T12:00:00.000Z",
      "merchant": "星巴克",
      "categoryName": "餐饮",
      "description": "咖啡",
      "confidence": 0.92,
      "needsReview": ["categoryId"]
    }
  ]
}
规则：
- type 只能是 expense、income、transfer、refund。
- amountMinor 必须是整数最小货币单位，人民币 32 元输出 3200。
- transactionDate 必须是 ISO 8601 字符串；相对日期根据用户消息里的当前时间推断。
- categoryName 优先使用这些常见分类：餐饮、交通、购物、住房、水电燃气、娱乐、医疗、教育、旅行、数码、工资、奖金、退款、其他支出、其他收入、转账。
- confidence 范围 0 到 1。
- 如果一句话里有多个金额或多个时间片段，必须输出多条 candidates；例如“早上花了5元 中午花了15 晚上花了20”输出三条 expense。
- 商户缺失但有消费事项时，merchant 填消费事项或用途，例如“吃饭”“咖啡”“打车”；description 保留原片段，不能把多笔交易合并成一笔。
- 不确定的字段放入 needsReview，例如 categoryId、amountMinor、transactionDate、merchant。`;
  }

  private openAiTemperature() {
    const configured = Number(this.config.get<string>('OPENAI_TEMPERATURE') ?? this.config.get<string>('QWEN_TEMPERATURE') ?? '1');
    return Number.isFinite(configured) ? configured : 1;
  }

  private parseAiJson(content: string) {
    try {
      return JSON.parse(content) as { candidates?: unknown[] };
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new InternalServerErrorException('Qwen JSON output is invalid');
      }
      return JSON.parse(match[0]) as { candidates?: unknown[] };
    }
  }

  private normalizeAiCandidate(value: unknown, originalText: string): AiCandidate {
    const item = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const type = this.normalizeTransactionType(item.type);
    const amountMinor = this.normalizeAmountMinor(item.amountMinor, item.amount);
    const transactionDate = this.normalizeTransactionDate(item.transactionDate, originalText);
    const confidence = typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.6;
    const needsReview = optionalStringArray(item.needsReview) ?? [];
    const description = optionalString(item.description) ?? originalText.slice(0, 120);
    const merchant = optionalString(item.merchant) ?? this.extractMerchant(description) ?? this.extractMerchant(originalText);

    if (!amountMinor) {
      needsReview.push('amountMinor');
    }
    if (!optionalString(item.categoryName)) {
      needsReview.push('categoryId');
    }

    return {
      type,
      amountMinor,
      transactionDate,
      merchant,
      categoryName: optionalString(item.categoryName),
      description,
      confidence,
      needsReview: Array.from(new Set(needsReview)),
    };
  }

  private normalizeTransactionType(value: unknown) {
    if (value === TransactionType.income || value === TransactionType.transfer || value === TransactionType.refund) {
      return value;
    }
    return TransactionType.expense;
  }

  private normalizeAmountMinor(amountMinor: unknown, amount: unknown) {
    if (typeof amountMinor === 'number' && Number.isFinite(amountMinor)) {
      return Math.abs(Math.round(amountMinor));
    }
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      return Math.abs(Math.round(amount * 100));
    }
    return 0;
  }

  private normalizeTransactionDate(value: unknown, originalText: string) {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return parseDateHint(originalText).toISOString();
  }

  private extractMerchant(text: string) {
    const known = ['星巴克', 'Cursor', 'ChatGPT', 'Netflix', 'Spotify', 'Apple', 'iCloud'];
    const knownMerchant = known.find((item) => text.includes(item));
    if (knownMerchant) {
      return knownMerchant;
    }

    const cleaned = text
      .replace(/\d+(?:\.\d{1,2})?\s*(?:元|块|人民币|rmb|RMB|¥)?/g, '')
      .replace(/花了|消费|支出|付款|支付|买了|用了|收入|收款|转账|退款/g, '')
      .replace(/早上|上午|中午|下午|晚上|今天|昨天|前天|刚刚/g, '')
      .replace(/[，,。；;：:\s]+/g, ' ')
      .trim();
    if (!cleaned || /^(早上|上午|中午|下午|晚上|今天|昨天|前天|刚刚)$/.test(cleaned)) {
      return undefined;
    }
    return cleaned.slice(0, 24);
  }

  private parseResultJson(resultJson: unknown): AiResultJson {
    return resultJson && typeof resultJson === 'object' ? (resultJson as AiResultJson) : {};
  }

  private normalizeCandidateIndex(index: unknown) {
    return typeof index === 'number' && Number.isInteger(index) ? index : 0;
  }

  private canConfirmCandidate(status: AiJobStatus, resultJson: AiResultJson, confirmedCandidates: ConfirmedCandidate[]) {
    if (status === AiJobStatus.succeeded) {
      return true;
    }
    if (status !== AiJobStatus.confirmed || !Array.isArray(resultJson.candidates)) {
      return false;
    }
    return confirmedCandidates.length < resultJson.candidates.length;
  }

  private selectCandidate(resultJson: AiResultJson, candidateIndex: number) {
    if (Array.isArray(resultJson.candidates) && resultJson.candidates[candidateIndex]) {
      return resultJson.candidates[candidateIndex];
    }
    throw new BadRequestException('AI result is missing candidates');
  }

  private signedAmount(type: TransactionType, amount: unknown) {
    const value = typeof amount === 'number' ? amount : Number(amount);
    if (!Number.isFinite(value)) {
      throw new BadRequestException('amountMinor is invalid');
    }
    return type === TransactionType.expense ? -Math.abs(Math.round(value)) : Math.round(value);
  }
}

function parseDateHint(text: string) {
  const now = new Date();
  if (text.includes('昨天')) {
    now.setUTCDate(now.getUTCDate() - 1);
  }
  return parseDate(undefined, now);
}

function optionalImageDataUrl(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(trimmed)) {
    throw new BadRequestException('imageDataUrl must be a png, jpg, jpeg or webp data URL');
  }
  const maxLength = 12 * 1024 * 1024;
  if (trimmed.length > maxLength) {
    throw new BadRequestException('imageDataUrl is too large');
  }
  return trimmed;
}

function optionalImageUrl(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('imageUrl must be an http or https URL');
    }
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('imageUrl must be an http or https URL');
  }
  return trimmed;
}
