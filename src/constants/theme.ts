// ── Colors ──────────────────────────────────────────────

export const palette = {
  blue: {
    500: '#007AFF',
    600: '#0066D6',
  },
  green: {
    100: '#D1FAE5',
    500: '#22C55E',
    700: '#15803D',
  },
  yellow: {
    100: '#FEF9C3',
    500: '#EAB308',
    700: '#A16207',
  },
  red: {
    100: '#FEE2E2',
    500: '#EF4444',
    700: '#B91C1C',
  },
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const colors = {
  light: {
    text: palette.gray[900],
    textSecondary: palette.gray[500],
    background: palette.white,
    backgroundSecondary: palette.gray[50],
    card: palette.white,
    border: palette.gray[200],
    primary: palette.blue[500],
    primaryPressed: palette.blue[600],
    destructive: palette.red[500],
    icon: palette.gray[500],
  },
  dark: {
    text: palette.gray[50],
    textSecondary: palette.gray[400],
    background: palette.gray[900],
    backgroundSecondary: palette.gray[800],
    card: palette.gray[800],
    border: palette.gray[700],
    primary: palette.blue[500],
    primaryPressed: palette.blue[600],
    destructive: palette.red[500],
    icon: palette.gray[400],
  },
} as const;

// ── Difficulty/Rating Colors ────────────────────────────

export const ratingColors = {
  1: { bg: palette.green[100], text: palette.green[700] },
  2: { bg: palette.green[100], text: palette.green[700] },
  3: { bg: palette.yellow[100], text: palette.yellow[700] },
  4: { bg: palette.red[100], text: palette.red[700] },
  5: { bg: palette.red[100], text: palette.red[700] },
} as const;

// ── Spacing ─────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

// ── Border Radius ───────────────────────────────────────

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

// ── Typography ──────────────────────────────────────────

export const typography = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700' as const,
    lineHeight: 41,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700' as const,
    lineHeight: 28,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 25,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  body: {
    fontSize: 17,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 21,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400' as const,
    lineHeight: 13,
  },
} as const;
