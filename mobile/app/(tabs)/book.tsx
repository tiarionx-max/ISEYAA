/**
 * Book hub — Plan 08-05 (extended in 09-11)
 *
 * Top-level 5-pane switcher (CONTEXT §Navigation Architecture, locked):
 *   1. Events       — <EventsSubsection /> (migrated from legacy book.tsx + events.tsx)
 *   2. Stays        — Airbnb-style 10-category strip + 2-col grid -> GET /properties
 *   3. Studio       — legacy look preserved (full redesign deferred)
 *   4. Marketplace  — Temu-style 8-category strip + 2-col product grid -> GET /products
 *   5. Tours        — 10-category strip + 2-col grid -> GET /tour-packages (Plan 09-11)
 *
 * Header bag icon -> useCartStore.totalCount() badge, tap -> router.push('/cart').
 *
 * Closes MOB-RD-03 + MOB-RD-05 + TOUR-03 (mobile browse).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Animated,
  Easing,
  TouchableOpacity,
  Dimensions,
  ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Heart,
  MapPin,
  ShoppingBag,
  Star,
} from 'lucide-react-native';

import { fetcher } from '../../lib/api';
import { useCartStore } from '../../lib/cart-store';
import {
  STAY_CATEGORIES,
  MARKETPLACE_CATEGORIES,
  TOUR_CATEGORIES,
  buildStayQuery,
  buildMarketplaceQuery,
  buildTourQuery,
  type StayCategory,
  type MarketplaceCategory,
  type TourCategory,
} from '../../lib/category-config';
import { TourCard, type TourPackage } from '../../components/tours/TourCard';

import { CategoryStrip, type CategoryStripItem } from '../../components/ui/CategoryStrip';
import { Chip } from '../../components/ui/Chip';
import { PressableScale } from '../../components/ui/PressableScale';
import { EventsSubsection } from '../../components/book/EventsSubsection';

import {
  BORDER,
  BORDER_SUBTLE,
  CARD_COLORS,
  CARD_GRADIENTS,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_DIM,
  INK_FAINT,
  INK_MID,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_SM,
  SPACE_4,
  SPACE_5,
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  TYPE,
} from '../../lib/tokens';

// ── Constants ──────────────────────────────────────────────────────────
type Section = 'events' | 'stays' | 'studio' | 'marketplace' | 'tours';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'events', label: 'Events' },
  { id: 'stays', label: 'Stays' },
  { id: 'studio', label: 'Studio' },
  { id: 'marketplace', label: 'Market' },
  { id: 'tours', label: 'Tours' },
];

// Discount badge red — only inline hex allowed per plan (Task 0 GREEN-LIT).
const DISCOUNT_RED = '#EF4444';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GUTTER = 12;
const GRID_H_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_H_PADDING * 2 - GRID_GUTTER) / 2;

// ── Shimmer (skeleton) ─────────────────────────────────────────────────
function useShimmer() {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 700, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 700, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

function GridSkeleton({ count = 4 }: { count?: number }) {
  const opacity = useShimmer();
  return (
    <View style={styles.gridSkeletonRow}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={[styles.skeletonCard, { opacity, width: CARD_WIDTH }]}
        >
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLine, { width: '75%' }]} />
            <View style={[styles.skeletonLine, { width: '48%', marginTop: 8 }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

// ── Price helper (mirrors web/src/app/stays/page.tsx::formatPrice) ────
type Property = {
  id: string;
  name: string;
  city?: string | null;
  propertyType?: string;
  bookingMode?: string;
  pricePerNight?: number | null;
  pricePerHour?: number | null;
  membershipMonthlyPrice?: number | null;
  coverImageUrl?: string | null;
  galleryImages?: string[];
  isFeatured?: boolean;
  maxGuests?: number;
  averageRating?: number | null;
  lga?: { name?: string } | null;
};

function formatPrice(p: Property): { primary: string; suffix: string } {
  const mode = p?.bookingMode ?? 'NIGHTLY';
  const fmt = (n: number | null | undefined) =>
    `₦${Number(n ?? 0).toLocaleString()}`;
  switch (mode) {
    case 'HOURLY':
      return { primary: fmt(p.pricePerHour ?? p.pricePerNight), suffix: '/ hour' };
    case 'MEMBERSHIP':
      return {
        primary: fmt(p.membershipMonthlyPrice ?? p.pricePerNight),
        suffix: '/ month',
      };
    case 'TIMED_EVENT':
      return { primary: `From ${fmt(p.pricePerNight)}`, suffix: 'per person' };
    case 'NIGHTLY':
    default:
      return { primary: fmt(p.pricePerNight), suffix: '/ night' };
  }
}

function typeBadgeLabel(type?: string): string {
  if (!type) return '';
  return type.charAt(0) + type.slice(1).toLowerCase();
}

// ── Stay card ─────────────────────────────────────────────────────────
function StayCard({ item, index }: { item: Property; index: number }) {
  const { primary, suffix } = formatPrice(item);
  const cover = item.coverImageUrl ?? item.galleryImages?.[0] ?? null;
  const fallback = CARD_COLORS[index % CARD_COLORS.length];
  const badge = typeBadgeLabel(item.propertyType);
  const rating = item.averageRating;

  return (
    <PressableScale
      onPress={() => router.push(`/stays/${item.id}` as never)}
      style={[styles.gridCard, { width: CARD_WIDTH }]}
    >
      <View style={styles.gridHero}>
        {cover ? (
          <ExpoImage
            source={{ uri: cover }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={fallback}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(5,14,14,0.65)']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
        />
        {badge ? (
          <View style={styles.gridBadgeTL}>
            <Text style={styles.gridBadgeText}>{badge}</Text>
          </View>
        ) : null}
        {rating != null ? (
          <View style={styles.gridStarBR}>
            <Star size={10} color={GOLD} fill={GOLD} />
            <Text style={styles.gridStarText}>
              {Number(rating).toFixed(1)}
            </Text>
          </View>
        ) : null}
        <View style={styles.gridPriceChipBL}>
          <Chip label={primary} active />
        </View>
      </View>
      <View style={styles.gridBody}>
        <Text style={styles.gridTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.gridMetaRow}>
          <MapPin size={10} color={INK_MID} />
          <Text style={styles.gridMetaText} numberOfLines={1}>
            {item.lga?.name ?? item.city ?? 'Ogun State'}
          </Text>
        </View>
        <Text style={styles.gridPriceSuffix}>{suffix}</Text>
      </View>
    </PressableScale>
  );
}

// ── Stays section ─────────────────────────────────────────────────────
function StaysSection() {
  const [activeId, setActiveId] = useState<string>('all');

  const activeCat = useMemo<StayCategory>(
    () => STAY_CATEGORIES.find((c) => c.id === activeId) ?? STAY_CATEGORIES[0],
    [activeId],
  );

  const stripItems: CategoryStripItem[] = useMemo(
    () =>
      STAY_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
      })),
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['stays-browse', activeId],
    queryFn: () => fetcher(`/properties?${buildStayQuery(activeCat)}`),
    staleTime: 30_000,
  });

  const properties: Property[] = data ?? [];

  const renderItem = ({ item, index }: ListRenderItemInfo<Property>) => (
    <StayCard item={item} index={index} />
  );

  return (
    <View style={styles.sectionRoot}>
      <CategoryStrip items={stripItems} activeId={activeId} onChange={setActiveId} />
      {isLoading ? (
        <View style={styles.gridPadding}>
          <GridSkeleton count={4} />
          <GridSkeleton count={4} />
        </View>
      ) : properties.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No stays in this category yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GUTTER, paddingHorizontal: GRID_H_PADDING }}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GUTTER }} />}
        />
      )}
    </View>
  );
}

// ── Studio section (legacy preserved — CONTEXT decision: redesign deferred) ──
type StudioItem = {
  id: string;
  name?: string;
  type?: string;
  pricePerHour?: number;
  averageRating?: number | null;
  rating?: number | null;
  location?: string;
  lga?: { name?: string } | null;
};

function StudioSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['studio-slots'],
    queryFn: () => fetcher('/studio/feed?limit=10'),
  });
  const studios: StudioItem[] = (data?.data ?? data ?? []) as StudioItem[];

  if (isLoading) {
    return (
      <View style={styles.gridPadding}>
        <GridSkeleton count={4} />
        <GridSkeleton count={4} />
      </View>
    );
  }

  if (studios.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No studio spaces available yet.</Text>
      </View>
    );
  }

  // Reproduce legacy single-column FeedCard rendering with same fields.
  return (
    <View style={styles.legacyFeedList}>
      {studios.map((item, i) => {
        const colors = (CARD_GRADIENTS[
          ['gold', 'forest', 'rock', 'dusk', 'indigo'][i % 5] as keyof typeof CARD_GRADIENTS
        ] as string[]).slice(0, 2) as [string, string];
        const rating = item.averageRating ?? item.rating;
        return (
          <PressableScale
            key={item.id ?? i}
            onPress={() =>
              router.push({
                pathname: '/ai-chat',
                params: {
                  prompt: `Book ${item.name ?? 'this studio space'} for me`,
                },
              } as never)
            }
            style={styles.legacyCard}
          >
            <View style={styles.legacyHero}>
              <LinearGradient
                colors={colors}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <LinearGradient
                colors={['transparent', 'rgba(5,14,14,0.55)']}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0.3 }}
                end={{ x: 0, y: 1 }}
              />
              <View style={styles.legacyTagWrap}>
                <View style={styles.legacyTag}>
                  <Text style={styles.legacyTagText}>STUDIO</Text>
                </View>
              </View>
              {rating != null && (
                <View style={styles.legacyStar}>
                  <Star size={11} color={GOLD} fill={GOLD} />
                  <Text style={styles.legacyStarText}>
                    {Number(rating).toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.legacyBody}>
              <Text style={styles.legacyTitle} numberOfLines={2}>
                {item.name ?? 'Studio Space'}
              </Text>
              <View style={styles.legacyMetaRow}>
                <MapPin size={11} color={INK_MID} />
                <Text style={styles.legacyMetaText} numberOfLines={1}>
                  {item.lga?.name ?? item.location ?? 'Ogun State'}
                </Text>
              </View>
              <View style={styles.legacyPriceRow}>
                <Text style={styles.legacyPrice}>
                  ₦{Number(item.pricePerHour ?? 0).toLocaleString()}
                </Text>
                <Text style={styles.legacyPriceLabel}>/ hour</Text>
              </View>
              <View style={styles.legacyDivider} />
              <View style={styles.legacyFooter}>
                <Text style={styles.legacyMetaText} numberOfLines={1}>
                  {item.type ?? 'Recording'}
                </Text>
                <View style={styles.legacyAction}>
                  <Text style={styles.legacyActionText}>Book Studio</Text>
                </View>
              </View>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── Marketplace section ───────────────────────────────────────────────
type ProductItem = {
  id: string;
  name: string;
  price: number | string;
  compareAtPrice?: number | string | null;
  imageUrls?: string[];
  category?: string;
  isFeatured?: boolean;
  vendor?: { id?: string; businessName?: string | null } | null;
  inventory?: number;
  description?: string | null;
};

// Dynamic haptics — same pattern as profile.tsx:18-26 and PressableScale.tsx.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Haptics: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch (_) {
  // no-op
}

function ProductCard({
  item,
  wishlisted,
  onToggleWishlist,
}: {
  item: ProductItem;
  wishlisted: boolean;
  onToggleWishlist: (id: string) => void;
}) {
  const price = Number(item.price ?? 0);
  const compareAt =
    item.compareAtPrice != null ? Number(item.compareAtPrice) : null;
  const hasDiscount = compareAt != null && compareAt > price;
  const discountPct = hasDiscount
    ? Math.round(((compareAt - price) / compareAt) * 100)
    : 0;
  const cover = item.imageUrls?.[0] ?? null;

  function handleAdd() {
    useCartStore.getState().addItem(
      {
        id: item.id,
        name: item.name,
        price: item.price,
        imageUrls: item.imageUrls,
        vendor: item.vendor ?? null,
      },
      1,
    );
    if (Haptics) {
      try {
        Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
      } catch (_) {
        // ignore
      }
    }
  }

  return (
    <PressableScale
      onPress={() => router.push(`/marketplace/${item.id}` as never)}
      style={[styles.gridCard, { width: CARD_WIDTH }]}
    >
      {/* Square thumbnail */}
      <View style={styles.productThumb}>
        {cover ? (
          <ExpoImage
            source={{ uri: cover }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: SURFACE_RAISED }]} />
        )}
        {hasDiscount ? (
          <View style={styles.discountPill}>
            <Text style={styles.discountText}>-{discountPct}%</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => onToggleWishlist(item.id)}
          style={styles.wishlistBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Toggle wishlist"
        >
          <Heart
            size={16}
            color={wishlisted ? '#F87171' : INK}
            fill={wishlisted ? '#F87171' : 'transparent'}
          />
        </Pressable>
      </View>

      {/* Body */}
      <View style={styles.productBody}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.productPriceRow}>
          <Text style={styles.productPrice}>
            ₦{price.toLocaleString()}
          </Text>
          {hasDiscount && compareAt != null ? (
            <Text style={styles.productCompareAt}>
              ₦{compareAt.toLocaleString()}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name} to cart`}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
    </PressableScale>
  );
}

function MarketplaceSection() {
  const [activeId, setActiveId] = useState<string>('all');
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());

  const activeCat = useMemo<MarketplaceCategory>(
    () =>
      MARKETPLACE_CATEGORIES.find((c) => c.id === activeId) ??
      MARKETPLACE_CATEGORIES[0],
    [activeId],
  );

  const stripItems: CategoryStripItem[] = useMemo(
    () =>
      MARKETPLACE_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
      })),
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['products-browse', activeId],
    queryFn: () =>
      fetcher(`/products?${buildMarketplaceQuery(activeCat)}`),
    staleTime: 30_000,
  });

  const products: ProductItem[] = data ?? [];

  function toggleWishlist(id: string) {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const renderItem = ({ item }: ListRenderItemInfo<ProductItem>) => (
    <ProductCard
      item={item}
      wishlisted={wishlist.has(item.id)}
      onToggleWishlist={toggleWishlist}
    />
  );

  return (
    <View style={styles.sectionRoot}>
      <CategoryStrip items={stripItems} activeId={activeId} onChange={setActiveId} />
      {isLoading ? (
        <View style={styles.gridPadding}>
          <GridSkeleton count={4} />
          <GridSkeleton count={4} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No products in this category yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GUTTER, paddingHorizontal: GRID_H_PADDING }}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GUTTER }} />}
        />
      )}
    </View>
  );
}

// ── Tours section ─────────────────────────────────────────────────────
function ToursSection() {
  const [activeId, setActiveId] = useState<string>('all');

  const activeCat = useMemo<TourCategory>(
    () => TOUR_CATEGORIES.find((c) => c.id === activeId) ?? TOUR_CATEGORIES[0],
    [activeId],
  );

  const stripItems: CategoryStripItem[] = useMemo(
    () =>
      TOUR_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
      })),
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['tours-browse', activeId],
    queryFn: () => fetcher(`/tour-packages?${buildTourQuery(activeCat)}`),
    staleTime: 30_000,
  });

  const packages: TourPackage[] = data ?? [];

  const renderItem = ({ item, index }: ListRenderItemInfo<TourPackage>) => (
    <TourCard
      pkg={item}
      index={index}
      cardWidth={CARD_WIDTH}
      onPress={(p) => router.push(`/tours/${p.slug}` as never)}
    />
  );

  return (
    <View style={styles.sectionRoot}>
      <CategoryStrip items={stripItems} activeId={activeId} onChange={setActiveId} />
      {isLoading ? (
        <View style={styles.gridPadding}>
          <GridSkeleton count={4} />
          <GridSkeleton count={4} />
        </View>
      ) : packages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No tour packages in this category yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GUTTER, paddingHorizontal: GRID_H_PADDING }}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GUTTER }} />}
        />
      )}
    </View>
  );
}

// ── Header ────────────────────────────────────────────────────────────
function CartBag() {
  // Subscribe to items length so the badge re-renders on add/remove.
  const count = useCartStore((s) => s.items.reduce((a, i) => a + i.quantity, 0));
  return (
    <Pressable
      onPress={() => router.push('/cart' as any)}
      style={({ pressed }) => [
        styles.bagBtn,
        pressed && { opacity: 0.7 },
      ]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open cart"
    >
      <ShoppingBag size={20} color={INK} />
      {count > 0 ? (
        <View style={styles.bagBadge}>
          <Text style={styles.bagBadgeText}>
            {count > 99 ? '99+' : String(count)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const VALID_SECTIONS: Section[] = ['events', 'stays', 'studio', 'marketplace', 'tours'];

// ── Main screen ────────────────────────────────────────────────────────
export default function BookScreen() {
  // Quick actions on the Discover tab deep-link here with ?section=... (e.g. "Buy
  // Ticket" -> events, "Order Food" -> marketplace) — without this, every quick
  // action landed on the same default section regardless of what it promised.
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  // Default: Stays — showcase redesign this phase per CONTEXT.
  const [activeSection, setActiveSection] = useState<Section>('stays');

  // expo-router's bottom-tab screens stay mounted across tab switches — a plain
  // useState initializer only runs once on first mount, so navigating back here
  // with a *different* ?section= after the screen is already mounted would be
  // silently ignored. Re-sync on every param change instead.
  useEffect(() => {
    if (VALID_SECTIONS.includes(sectionParam as Section)) {
      setActiveSection(sectionParam as Section);
    }
  }, [sectionParam]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Book</Text>
        <CartBag />
      </View>

      {/* Sub-section switcher */}
      <View style={styles.switcherWrap}>
        {SECTIONS.map((s) => (
          <View key={s.id} style={styles.switcherItem}>
            <Chip
              label={s.label}
              active={activeSection === s.id}
              onPress={() => setActiveSection(s.id)}
            />
          </View>
        ))}
      </View>

      {/* Active sub-section */}
      <View style={styles.sectionHost}>
        {activeSection === 'events' && <EventsSubsection />}
        {activeSection === 'stays' && <StaysSection />}
        {activeSection === 'studio' && <StudioSection />}
        {activeSection === 'marketplace' && <MarketplaceSection />}
        {activeSection === 'tours' && <ToursSection />}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE_MID },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_4,
    paddingTop: SPACE_4,
    paddingBottom: 8,
  },
  headerTitle: {
    ...TYPE.heading,
    color: INK,
  },
  bagBtn: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: RADIUS_PILL,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bagBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bagBadgeText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '700',
    color: SURFACE_DEEP,
  },

  // Sub-section switcher
  switcherWrap: {
    flexDirection: 'row',
    paddingHorizontal: SPACE_4,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  switcherItem: {
    // Wrapper enforces 44pt touch target around the inner Chip body.
    minHeight: 44,
    justifyContent: 'center',
  },

  sectionHost: { flex: 1 },
  sectionRoot: { flex: 1 },

  // Grid
  gridContent: {
    paddingTop: 12,
    paddingBottom: 120,
  },
  gridPadding: {
    paddingHorizontal: GRID_H_PADDING,
    paddingTop: 12,
    gap: 12,
  },
  gridSkeletonRow: {
    flexDirection: 'row',
    gap: GRID_GUTTER,
  },

  // Generic grid card (Stays + Marketplace share)
  gridCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },

  // Stay card hero
  gridHero: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  gridBadgeTL: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  gridBadgeText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    color: GOLD,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  gridStarBR: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    backgroundColor: 'rgba(5,14,14,0.55)',
  },
  gridStarText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: GOLD,
    fontWeight: '600',
  },
  gridPriceChipBL: {
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  gridBody: {
    padding: 10,
    gap: 4,
  },
  gridTitle: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    lineHeight: 17,
  },
  gridMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  gridMetaText: {
    fontFamily: FONT_UI,
    fontSize: 11,
    color: INK_MID,
    flex: 1,
  },
  gridPriceSuffix: {
    fontFamily: FONT_UI,
    fontSize: 10.5,
    color: INK_DIM,
    marginTop: 2,
  },

  // Product card (Marketplace)
  productThumb: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: SURFACE_RAISED,
  },
  discountPill: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS_SM,
    backgroundColor: DISCOUNT_RED,
  },
  discountText: {
    fontSize: 10,
    fontWeight: '700',
    color: INK,
    fontFamily: FONT_MONO,
  },
  wishlistBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(5,14,14,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  productBody: {
    padding: 10,
    gap: 6,
  },
  productName: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    lineHeight: 17,
    minHeight: 34, // 2 lines reserved so all cards align
  },
  productPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  productPrice: {
    fontFamily: FONT_MONO,
    fontSize: 15,
    fontWeight: '700',
    color: GOLD,
  },
  productCompareAt: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: INK_FAINT,
    textDecorationLine: 'line-through',
  },
  addBtn: {
    minHeight: 44, // M-2 fix: 44pt touch target floor (NOT 40pt)
    borderRadius: RADIUS_SM,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  addBtnText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: SURFACE_DEEP,
    letterSpacing: 0.3,
  },

  // Skeleton
  skeletonCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  skeletonHero: { height: 160, backgroundColor: '#1B3636' },
  skeletonBody: { padding: 10 },
  skeletonLine: { height: 11, borderRadius: 5, backgroundColor: '#1B3636' },

  // Empty state
  emptyState: {
    paddingHorizontal: SPACE_5,
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: INK_FAINT,
  },

  // Legacy Studio rendering (preserved — single-column FeedCard look)
  legacyFeedList: {
    paddingHorizontal: SPACE_5,
    paddingTop: 14,
    gap: 14,
    paddingBottom: 120,
  },
  legacyCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  legacyHero: { height: 180, width: '100%', position: 'relative' },
  legacyTagWrap: { position: 'absolute', top: 10, left: 10 },
  legacyTag: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legacyTagText: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    color: GOLD,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  legacyStar: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5,14,14,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
  },
  legacyStarText: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: GOLD,
    fontWeight: '600',
  },
  legacyBody: {
    paddingVertical: 14,
    paddingHorizontal: SPACE_4,
    gap: 6,
  },
  legacyTitle: {
    fontFamily: FONT_UI,
    fontSize: 16,
    fontWeight: '700',
    color: INK,
    lineHeight: 22,
  },
  legacyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legacyMetaText: {
    fontFamily: FONT_UI,
    fontSize: 11.5,
    color: INK_MID,
    flex: 1,
  },
  legacyPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  legacyPrice: {
    fontFamily: FONT_MONO,
    fontSize: 15,
    fontWeight: '600',
    color: GOLD,
  },
  legacyPriceLabel: {
    fontFamily: FONT_UI,
    fontSize: 11.5,
    color: INK_MID,
  },
  legacyDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginTop: 6,
    marginBottom: 2,
  },
  legacyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  legacyAction: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legacyActionText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: SURFACE_DEEP,
  },
});
