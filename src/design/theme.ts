export const palette = {
  paper: '#F6F1DF',
  ink: '#0B0B0B',
  muted: '#5D5A50',
  line: '#0B0B0B',
  white: '#FFFFFF',
  acid: '#CCFF00',
  blue: '#001DFF',
  red: '#FF2E00',
  yellow: '#FFE500',
  green: '#0D7A3A',
  surface: '#FFF9E8',
  surfaceAlt: '#E9E1C8',
  dangerSoft: '#FFD9CF',
  blueSoft: '#D8DFFF',
  greenSoft: '#DFF4D3',
  yellowSoft: '#FFF0A6',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
};

export const typography = {
  title: 32,
  h1: 28,
  h2: 22,
  h3: 18,
  body: 15,
  small: 12,
  tiny: 10,
};

export const shadow = {
  brutal: {
    shadowColor: palette.ink,
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
};

export const formatCurrency = (amount: number) => {
  const sign = amount < 0 ? '-' : '';
  return `${sign}¥${Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

export const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
