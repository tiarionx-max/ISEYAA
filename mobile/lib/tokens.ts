// ── Surfaces ──────────────────────────────────────
export const SURFACE_DEEP = '#050E0E';
export const SURFACE_MID = '#0D1F1F';
export const SURFACE_RAISED = '#162B2B';
export const SURFACE_HIGH = '#1E3535';
export const SURFACE_OVERLAY = 'rgba(5,14,14,0.85)';

// ── Brand ─────────────────────────────────────────
export const FOREST = '#1A6B3C';
export const FOREST_DIM = 'rgba(26,107,60,0.20)';
export const FOREST_DEEP = '#0A3A1F';
export const GOLD = '#D4A843';
export const GOLD_DIM = 'rgba(212,168,67,0.15)';
export const GOLD_BORDER = 'rgba(212,168,67,0.35)';
export const GOLD_TEXT = '#D4A843';
export const CREAM = '#F5EDD6';

// ── Text ──────────────────────────────────────────
export const INK = '#FFFFFF';
export const INK_SECONDARY = 'rgba(255,255,255,0.60)';
export const INK_FAINT = 'rgba(255,255,255,0.32)';
export const INK_DISABLED = 'rgba(255,255,255,0.18)';

// ── Borders ───────────────────────────────────────
export const BORDER_SUBTLE = 'rgba(255,255,255,0.07)';
export const BORDER_GLASS = 'rgba(255,255,255,0.10)';
export const BORDER_FOCUS = '#D4A843';

// ── Semantic ──────────────────────────────────────
export const SUCCESS = '#22C55E';
export const SUCCESS_DIM = 'rgba(34,197,94,0.12)';
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
export const TYPE = {
  display: { fontSize: 36, fontWeight: '700' as const, lineHeight: 41, letterSpacing: -0.5 },
  heading: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.3 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 21, letterSpacing: 0 },
  bodyEmphasis: { fontSize: 14, fontWeight: '700' as const, lineHeight: 21, letterSpacing: 0 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 17, letterSpacing: 0.2 },
} as const;

// ── Card colours (gradient fallbacks) ─────────────
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
