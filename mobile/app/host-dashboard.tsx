/**
 * Host Dashboard — quick task 260727-c0m
 *
 * Replaces the "Coming soon" stub previously on host.tsx's "Go to dashboard" CTA.
 * Lists every property owned by the current host (including paused ones — this is
 * the one view where inactive listings should ever appear), with per-property
 * Edit / View bookings actions and an Add listing CTA.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Plus, Pencil, CalendarCheck, MapPin, PauseCircle } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

import { api, fetcher } from '../lib/api';
import { Chip } from '../components/ui/Chip';
import { PressableScale } from '../components/ui/PressableScale';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_SUBTLE,
  CARD_COLORS,
  TYPE,
  FONT_MONO,
  FONT_UI,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../lib/tokens';

// ── Types ────────────────────────────────────────────

interface HostProperty {
  id: string;
  name: string;
  type?: string;
  bookingMode?: string;
  pricePerNight?: number | string | null;
  pricePerHour?: number | string | null;
  membershipMonthlyPrice?: number | string | null;
  coverImageUrl?: string | null;
  imageUrls?: string[];
  isActive: boolean;
  lga?: { name?: string } | null;
  address?: string;
}

interface Me {
  role?: string;
}

// ── Helpers ──────────────────────────────────────────
// Duplicated from mobile/app/(tabs)/book.tsx::formatPrice (not exported from that
// file — this codebase's convention already duplicates such small pure helpers).

function formatPrice(p: HostProperty): { primary: string; suffix: string } {
  const mode = p?.bookingMode ?? 'NIGHTLY';
  const fmt = (n: number | string | null | undefined) =>
    `₦${Number(n ?? 0).toLocaleString()}`;
  switch (mode) {
    case 'HOURLY':
      return { primary: fmt(p.pricePerHour ?? p.pricePerNight), suffix: '/ hour' };
    case 'MEMBERSHIP':
      return { primary: fmt(p.membershipMonthlyPrice ?? p.pricePerNight), suffix: '/ month' };
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

// Reconciles the active role to HOST before the my-properties read fires — mirrors
// the same-named helper in property-create.tsx used before writes.
async function ensureHostRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'HOST') {
    const { data } = await api.patch('/users/me/role', { role: 'HOST' });
    if (data?.accessToken && data?.refreshToken) {
      await SecureStore.setItemAsync('access_token', data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    }
  }
}

// ── Property row ─────────────────────────────────────

function PropertyRow({ item, index }: { item: HostProperty; index: number }) {
  const { primary, suffix } = formatPrice(item);
  const cover = item.coverImageUrl ?? item.imageUrls?.[0] ?? null;
  const fallback = CARD_COLORS[index % CARD_COLORS.length];
  const badge = typeBadgeLabel(item.type);
  const paused = item.isActive === false;

  return (
    <View style={[styles.card, paused && styles.cardPaused]}>
      <View style={styles.hero}>
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
          <View style={styles.badgeTL}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <View style={styles.priceChipBL}>
          <Chip label={primary} active />
        </View>
        {/* Dimmed overlay + "Paused" badge — the one place inactive listings appear */}
        {paused ? (
          <View style={StyleSheet.absoluteFillObject}>
            <View style={styles.pausedScrim} pointerEvents="none" />
            <View style={styles.pausedBadge}>
              <PauseCircle size={12} color={CREAM} />
              <Text style={styles.pausedBadgeText}>Paused</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          <MapPin size={11} color={INK_MID} />
          <Text style={styles.metaText} numberOfLines={1}>
            {item.lga?.name ?? item.address ?? 'Ogun State'}
          </Text>
        </View>
        <Text style={styles.priceSuffix}>{suffix}</Text>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => router.push(`/property-edit/${item.id}` as never)}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
          >
            <Pencil size={14} color={GOLD} />
            <Text style={styles.actionBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/property-bookings/${item.id}` as never)}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={`View bookings for ${item.name}`}
          >
            <CalendarCheck size={14} color={GOLD} />
            <Text style={styles.actionBtnText}>Bookings</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────

export default function HostDashboardScreen(): JSX.Element {
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });
  const [roleReconciled, setRoleReconciled] = useState(false);

  useEffect(() => {
    if (me && !roleReconciled) {
      ensureHostRole(me.role).finally(() => setRoleReconciled(true));
    }
  }, [me, roleReconciled]);

  const { data, isLoading, isError } = useQuery<HostProperty[]>({
    queryKey: ['my-properties'],
    queryFn: () => fetcher('/properties/mine'),
    enabled: roleReconciled,
  });

  const properties = data ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Properties</Text>
          <Text style={styles.headerSub}>
            {properties.length} listing{properties.length === 1 ? '' : 's'}
          </Text>
        </View>
        <PressableScale
          onPress={() => router.push('/property-create' as never)}
          style={styles.addBtn}
          hapticStyle="medium"
        >
          <Plus size={16} color={SURFACE_DEEP} />
          <Text style={styles.addBtnText}>Add listing</Text>
        </PressableScale>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            Could not load your properties. Pull to refresh or try again shortly.
          </Text>
        </View>
      ) : properties.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No listings yet</Text>
          <Text style={styles.emptyText}>
            Add your first property to start earning through Iṣẹ́yáá.
          </Text>
          <PressableScale
            onPress={() => router.push('/property-create' as never)}
            style={styles.emptyCta}
            hapticStyle="medium"
          >
            <Text style={styles.emptyCtaText}>Add your first listing</Text>
          </PressableScale>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => <PropertyRow item={item} index={index} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: SPACE_4 }} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_MID },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_4,
    paddingBottom: SPACE_3,
  },
  headerTitle: { ...TYPE.heading, fontSize: 20, color: INK },
  headerSub: { ...TYPE.caption, color: INK_MID, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: SPACE_4,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD,
  },
  addBtnText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: SURFACE_DEEP,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE_5 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE_5,
    gap: SPACE_3,
  },
  emptyTitle: { ...TYPE.bodyEmphasis, fontSize: 16, color: INK },
  emptyText: { ...TYPE.body, color: INK_MID, textAlign: 'center' },
  emptyCta: {
    marginTop: SPACE_3,
    minHeight: 48,
    paddingHorizontal: SPACE_5,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: { fontFamily: FONT_UI, fontSize: 14, fontWeight: '700', color: SURFACE_DEEP },

  listContent: { paddingHorizontal: SPACE_5, paddingTop: SPACE_2, paddingBottom: 60 },

  card: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardPaused: { opacity: 0.85 },

  hero: { height: 150, width: '100%', position: 'relative' },
  badgeTL: {
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
  badgeText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    color: GOLD,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  priceChipBL: { position: 'absolute', bottom: 8, left: 8 },

  pausedScrim: {
    backgroundColor: 'rgba(5,14,14,0.55)',
  },
  pausedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
  },
  pausedBadgeText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '700',
    color: CREAM,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  body: { padding: SPACE_4, gap: 4 },
  title: { fontFamily: FONT_UI, fontSize: 15, fontWeight: '700', color: INK },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: FONT_UI, fontSize: 12, color: INK_MID, flex: 1 },
  priceSuffix: { fontFamily: FONT_UI, fontSize: 11, color: INK_FAINT, marginTop: 2 },

  actionsRow: { flexDirection: 'row', gap: SPACE_3, marginTop: SPACE_3 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: SPACE_3,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  actionBtnText: { fontFamily: FONT_UI, fontSize: 12.5, fontWeight: '700', color: GOLD },
});
