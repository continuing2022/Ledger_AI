import { Injectable } from '@nestjs/common';
import { CategoryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuthIdentity = {
  authUserId: string;
  email?: string | null;
  displayName?: string | null;
};

const defaultCategories = [
  ['餐饮', CategoryType.expense, 'restaurant', '#FF2E00'],
  ['交通', CategoryType.expense, 'car', '#0D7A3A'],
  ['购物', CategoryType.expense, 'bag', '#FFE500'],
  ['住房', CategoryType.expense, 'home', '#001DFF'],
  ['水电燃气', CategoryType.expense, 'flash', '#66D9EF'],
  ['娱乐', CategoryType.expense, 'game', '#B455FF'],
  ['医疗', CategoryType.expense, 'medical', '#FF7A00'],
  ['教育', CategoryType.expense, 'book', '#CCFF00'],
  ['旅行', CategoryType.expense, 'airplane', '#00A3FF'],
  ['数码', CategoryType.expense, 'phone', '#111111'],
  ['其他支出', CategoryType.expense, 'more', '#999999'],
  ['工资', CategoryType.income, 'wallet', '#0D7A3A'],
  ['奖金', CategoryType.income, 'gift', '#CCFF00'],
  ['退款', CategoryType.income, 'return', '#FFE500'],
  ['其他收入', CategoryType.income, 'add', '#999999'],
  ['转账', CategoryType.transfer, 'swap', '#001DFF'],
] as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProfile(identity: AuthIdentity) {
    return this.prisma.userProfile.upsert({
      where: { authUserId: identity.authUserId },
      update: {
        email: identity.email,
        displayName: identity.displayName,
      },
      create: {
        authUserId: identity.authUserId,
        email: identity.email,
        displayName: identity.displayName,
        categories: {
          create: defaultCategories.map(([name, type, icon, color]) => ({
            name,
            type,
            icon,
            color,
            isSystem: true,
          })),
        },
      },
    });
  }
}
