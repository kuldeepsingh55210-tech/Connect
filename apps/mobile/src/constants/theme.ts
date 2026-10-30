/**
 * Design Tokens extracted from document/oryqfruntend/design-landing/DESIGN.md
 * Strict Monochrome Editorial aesthetic
 */

export const COLORS = {
  // Surface & Backgrounds
  surface: '#f9f9fa',
  surfaceDim: '#dadadb',
  surfaceBright: '#f9f9fa',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f3f3f4',
  surfaceContainer: '#eeeeef',
  surfaceContainerHigh: '#e8e8e9',
  surfaceContainerHighest: '#e2e2e3',

  // Text & Typography
  onSurface: '#1a1c1d',
  onSurfaceVariant: '#47464b',
  onPrimary: '#ffffff',
  onSecondary: '#ffffff',

  // Primary & Secondary Brand
  primary: '#000000',
  primaryContainer: '#1b1b1e',
  secondary: '#5d5e66',
  tertiary: '#000000',

  // Outlines & Borders
  outline: '#77767b',
  outlineVariant: '#c8c5cb',
  border: '#e4e4e7',

  // Calibrated Zinc Accents from DESIGN.md
  zincBlack: '#18181b',
  zincDark: '#3f3f46',
  zincMedium: '#71717a',
  zincLight: '#f4f4f5',
  zincBorder: '#e4e4e7',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  marginMobile: 20,
} as const;

export const BORDER_RADIUS = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
} as const;
