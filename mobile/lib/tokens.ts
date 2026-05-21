import { Platform } from 'react-native';

// ── Surfaces ──────────────────────────────────────
export const SURFACE_DEEP = '#050E0E';
export const SURFACE_MID = '#0D1F1F';
export const SURFACE_RAISED = '#162B2B';
export const SURFACE_ELEV = '#1B3636';
export const SURFACE_HIGH = '#1E3535';
export const SURFACE_OVERLAY = 'rgba(5,14,14,0.85)';

// ── Brand ─────────────────────────────────────────
export const FOREST = '#1A6B3C';
export const FOREST_LIGHT = '#2A8B52';
export const FOREST_DIM = 'rgba(26,107,60,0.20)';
export const FOREST_DEEP = '#0E3F23';
export const GOLD = '#D4A843';
export const GOLD_BRIGHT = '#E8BF5C';
export const GOLD_DIM = 'rgba(212,168,67,0.15)';
export const GOLD_LINE = 'rgba(212,168,67,0.40)';
export const GOLD_BORDER = 'rgba(212,168,67,0.35)';
export const GOLD_TEXT = '#D4A843';
export const CREAM = '#F5EDD6';

// ── Text ──────────────────────────────────────────
export const INK = '#FFFFFF';
export const INK_SECONDARY = 'rgba(255,255,255,0.60)';
export const INK_MID = 'rgba(255,255,255,0.60)';
export const INK_DIM = 'rgba(255,255,255,0.45)';
export const INK_FAINT = 'rgba(255,255,255,0.25)';
export const INK_DISABLED = 'rgba(255,255,255,0.18)';

// ── Borders ───────────────────────────────────────
export const BORDER = 'rgba(255,255,255,0.06)';
export const BORDER_SUBTLE = 'rgba(255,255,255,0.07)';
export const BORDER_MID = 'rgba(255,255,255,0.10)';
export const BORDER_GLASS = 'rgba(255,255,255,0.10)';
export const BORDER_FOCUS = '#D4A843';

// ── Semantic ──────────────────────────────────────
export const SUCCESS = '#2ECC71';
export const SUCCESS_DIM = 'rgba(46,204,113,0.14)';
export const SUCCESS_TEXT = '#7BE7A2';
export const ERROR = '#E05252';
export const ERROR_TEXT = '#F08F8F';
export const DESTRUCTIVE = '#F87171';
export const DESTRUCTIVE_DIM = 'rgba(248,113,113,0.12)';
export const WARNING = '#FBBF24';
export const WARNING_DIM = 'rgba(251,191,36,0.12)';

// ── Spacing ───────────────────────────────────────
export const SPACE_1 = 4;
export const SPACE_2 = 8;
export const SPACE_3 = 12;
export const SPACE_4 = 16;
export const SPACE_5 = 20;
export const SPACE_6 = 24;
export const SPACE_8 = 32;
export const SPACE_10 = 40;
export const SPACE_12 = 48;

// ── Typography ────────────────────────────────────
// Fonts: Instrument Serif (display) · Plus Jakarta Sans (UI) · JetBrains Mono (numbers)
export const FONT_DISPLAY = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia',
}) as string;

export const FONT_UI = Platform.select({
  ios: '-apple-system',
  android: 'sans-serif',
  default: 'System',
}) as string;

export const FONT_MONO = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  default: 'monospace',
}) as string;

export const TYPE = {
  // Display: Instrument Serif equivalent, italic warmth
  display: {
    fontFamily: FONT_DISPLAY,
    fontSize: 36,
    fontWeight: '400' as const,
    lineHeight: 41,
    letterSpacing: -0.5,
  },
  displayItalic: {
    fontFamily: FONT_DISPLAY,
    fontSize: 36,
    fontWeight: '400' as const,
    fontStyle: 'italic' as const,
    lineHeight: 41,
    letterSpacing: -0.5,
  },
  // Heading: large display text
  heading: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    fontWeight: '400' as const,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  // Kicker: mono uppercase label (used as section subtitle/tag)
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 1.8,
  },
  // Body
  body: { fontFamily: FONT_UI, fontSize: 14, fontWeight: '400' as const, lineHeight: 21, letterSpacing: 0 },
  bodyEmphasis: { fontFamily: FONT_UI, fontSize: 14, fontWeight: '700' as const, lineHeight: 21, letterSpacing: 0 },
  // Mono numbers
  mono: {
    fontFamily: FONT_MONO,
    fontVariant: ['tabular-nums'] as const,
    letterSpacing: -0.02,
  },
  caption: { fontFamily: FONT_UI, fontSize: 12, fontWeight: '400' as const, lineHeight: 17, letterSpacing: 0.2 },
} as const;

// ── Card gradient pairs (tone → [top, bottom]) ────
export const CARD_GRADIENTS: Record<string, [string, string]> = {
  gold:   ['#3a2e15', '#1f1808'],
  forest: ['#1a3a2a', '#0d2018'],
  rock:   ['#3a2820', '#1c130d'],
  dusk:   ['#4a2415', '#1a0d08'],
  indigo: ['#1a2a4a', '#0a1226'],
};

export const CARD_COLORS: [string, string][] = [
  [FOREST, FOREST_DEEP],
  ['#1A3A6B', '#0A1A3A'],
  ['#3A1A6B', '#1A0A3A'],
  ['#6B3A1A', '#3A1A0A'],
  ['#1A6B5A', '#0A3A2F'],
];

// ── Radius ────────────────────────────────────────
export const RADIUS_SM = 8;
export const RADIUS_MD = 14;
export const RADIUS_LG = 20;
export const RADIUS_PILL = 100;
