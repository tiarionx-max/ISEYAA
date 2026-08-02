/**
 * Category config — single source of truth shared by the Book hub's
 * Stays + Marketplace + Tours sub-sections, their tests, and any
 * downstream filter/search surface.
 *
 * Mirrors `web/src/app/stays/page.tsx` (10 entries),
 * `web/src/app/marketplace/page.tsx` (8 entries), and
 * `web/src/app/tours/page.tsx` (10 entries) exactly — same ids,
 * same labels, same backend filter contract. If web edits its category
 * list, edit here too.
 *
 * Pure data module — no React imports.
 */

import {
  Sparkles,
  Home,
  Wine,
  Music2,
  Waves,
  MapPin,
  Crown,
  Mountain,
  Star,
  Shirt,
  Hammer,
  Cookie,
  Palette,
  Cpu,
  Wheat,
  Landmark,
  Music,
  PartyPopper,
  Utensils,
  Heart,
  BookOpen,
  Briefcase,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

// ── Stays ─────────────────────────────────────────────────────────
export type StayCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Comma-joined PropertyType filter (e.g. "HOTEL,GUESTHOUSE,APARTMENT,VILLA,RESORT"). */
  types?: string;
  /** Set to "MEMBERSHIP" for the memberships category. */
  bookingMode?: string;
  /** Set to true for the featured category. */
  featured?: boolean;
};

export const STAY_CATEGORIES: StayCategory[] = [
  { id: 'all',         label: 'All',          icon: Sparkles },
  { id: 'stays',       label: 'Stays',        icon: Home,     types: 'HOTEL,GUESTHOUSE,APARTMENT,VILLA,RESORT' },
  { id: 'lounges',     label: 'Lounges',      icon: Wine,     types: 'LOUNGE' },
  { id: 'clubs',       label: 'Social Clubs', icon: Music2,   types: 'CLUB' },
  { id: 'beach',       label: 'Beach',        icon: Waves,    types: 'BEACH' },
  { id: 'tours',       label: 'Tours',        icon: MapPin,   types: 'TOUR' },
  { id: 'experiences', label: 'Experiences',  icon: Sparkles, types: 'EXPERIENCE' },
  { id: 'memberships', label: 'Memberships',  icon: Crown,    bookingMode: 'MEMBERSHIP' },
  { id: 'attractions', label: 'Attractions',  icon: Mountain, types: 'ATTRACTION' },
  { id: 'featured',    label: 'Featured',     icon: Star,     featured: true },
];

// ── Marketplace ───────────────────────────────────────────────────
export type MarketplaceCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Backend category slug (e.g. "fashion"). Undefined = no category filter. */
  category?: string;
  /** Set to true for the featured category. */
  featured?: boolean;
};

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  { id: 'all',         label: 'All',         icon: Sparkles },
  { id: 'fashion',     label: 'Fashion',     icon: Shirt,    category: 'fashion' },
  { id: 'crafts',      label: 'Crafts',      icon: Hammer,   category: 'crafts' },
  { id: 'food',        label: 'Food',        icon: Cookie,   category: 'food' },
  { id: 'art',         label: 'Art',         icon: Palette,  category: 'art' },
  { id: 'tech',        label: 'Tech',        icon: Cpu,      category: 'tech' },
  { id: 'agriculture', label: 'Agriculture', icon: Wheat,    category: 'agriculture' },
  { id: 'featured',    label: 'Featured',    icon: Star,     featured: true },
];

// ── Query-string builders ─────────────────────────────────────────
// Mirror web/src/app/stays/page.tsx::buildQueryString and
// web/src/app/marketplace/page.tsx::buildQuery — keep page size at 48.

export function buildStayQuery(c: StayCategory): string {
  const params = new URLSearchParams();
  params.set('limit', '48');
  if (c.types) params.set('types', c.types);
  if (c.bookingMode) params.set('bookingMode', c.bookingMode);
  if (c.featured) params.set('featured', 'true');
  return params.toString();
}

export function buildMarketplaceQuery(c: MarketplaceCategory): string {
  const params = new URLSearchParams();
  params.set('limit', '48');
  if (c.category) params.set('category', c.category);
  if (c.featured) params.set('featured', 'true');
  return params.toString();
}

// ── Tours ─────────────────────────────────────────────────────────────
export type TourCategory = {
  id: 'all' | 'heritage' | 'cultural' | 'adire' | 'festival' | 'food' | 'family' | 'faith' | 'school' | 'corporate';
  label: string;
  icon: LucideIcon;
  /** Backend category filter value (undefined = no filter, show all). */
  category?: string;
};

export const TOUR_CATEGORIES: TourCategory[] = [
  { id: 'all',       label: 'All',       icon: Sparkles },
  { id: 'heritage',  label: 'Heritage',  icon: Landmark,    category: 'HERITAGE' },
  { id: 'cultural',  label: 'Cultural',  icon: Music,       category: 'CULTURAL' },
  { id: 'adire',     label: 'Adire',     icon: Palette,     category: 'ADIRE' },
  { id: 'festival',  label: 'Festival',  icon: PartyPopper, category: 'FESTIVAL' },
  { id: 'food',      label: 'Food',      icon: Utensils,    category: 'FOOD' },
  { id: 'family',    label: 'Family',    icon: Heart,       category: 'FAMILY' },
  { id: 'faith',     label: 'Faith',     icon: Star,        category: 'FAITH' },
  { id: 'school',    label: 'School',    icon: BookOpen,    category: 'SCHOOL' },
  { id: 'corporate', label: 'Corporate', icon: Briefcase,   category: 'CORPORATE' },
];

export function buildTourQuery(c: TourCategory): string {
  const p = new URLSearchParams({ limit: '48' });
  if (c.category) p.set('category', c.category);
  return p.toString();
}
