import { BadRequestException } from '@nestjs/common';

export function enumValue<T extends Record<string, string>>(target: T, value: unknown, name: string): T[keyof T] {
  if (typeof value === 'string' && Object.values(target).includes(value)) {
    return value as T[keyof T];
  }
  throw new BadRequestException(`${name} is invalid`);
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

export function intParam(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
