/**
 * Property Bookings — quick task 260727-c0m
 *
 * Lists bookings for a single property owned by the current host, via
 * GET /properties/:id/bookings. Shows guest name/phone, dates, guest count,
 * total price, status, and a pending/released earnings badge derived from
 * escrowReleasedAt.
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { User, Phone, CalendarDays, Users } from 'lucide-react-native';

import { fetcher } from '../../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  SUCCESS,
  SUCCESS_DIM,
  WARNING,
  WARNING_DIM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  RADIUS_LG,
  RADIUS_PILL,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../../lib/tokens';

// ── Types ────────────────────────────────────────────

interface Booking {
  id: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice: number | string;
  status: string;
  escrowReleasedAt?: string | null;
  user?: { firstName?: string; lastName?: string; phone?: string } | null;
}

// ── Helpers ──────────────────────────────────────────
// Duplicated from wallet.tsx's formatCurrency convention (₦ prefixed at the call
// site, NOT book.tsx's formatPrice per-unit-suffix formatter).

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Booking row ──────────────────────────────────────

function BookingRow({ item }: { item: Booking }) {
  const guestName = [item.user?.firstName, item.user?.lastName].filter(Boolean).join(' ') || 'Guest';
  const released = !!item.escrowReleasedAt;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.guestRow}>
          <User size={14} color={GOLD} />
          <Text style={styles.guestName}>{guestName}</Text>
        </View>
        <View style={[styles.earningsBadge, released ? styles.earningsReleased : styles.earningsPending]}>
          <Text style={[styles.earningsBadgeText, { color: released ? SUCCESS : WARNING }]}>
            {released ? 'Released' : 'Pending'}
          </Text>
        </View>
      </View>

      {item.user?.phone ? (
        <View style={styles.metaRow}>
          <Phone size={12} color={INK_MID} />
          <Text style={styles.metaText}>{item.user.phone}</Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <CalendarDays size={12} color={INK_MID} />
        <Text style={styles.metaText}>
          {formatDate(item.checkIn)} — {formatDate(item.checkOut)}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Users size={12} color={INK_MID} />
        <Text style={styles.metaText}>{item.guests} guest{item.guests === 1 ? '' : 's'}</Text>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.statusText}>{item.status}</Text>
        <Text style={styles.totalPrice}>₦{formatCurrency(Number(item.totalPrice))}</Text>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────

export default function PropertyBookingsScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery<Booking[]>({
    queryKey: ['property-bookings', id],
    queryFn: () => fetcher(`/properties/${id}/bookings`),
    enabled: !!id,
  });

  const bookings = data ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Could not load bookings. Please try again.</Text>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptyText}>Bookings for this listing will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <BookingRow item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: SPACE_3 }} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE_5, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: INK },
  emptyText: { fontSize: 13, color: INK_MID, textAlign: 'center' },

  listContent: { paddingHorizontal: SPACE_5, paddingTop: SPACE_4, paddingBottom: 60 },

  card: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: SPACE_4,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestName: { fontSize: 14, fontWeight: '700', color: INK },

  earningsBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS_PILL },
  earningsReleased: { backgroundColor: SUCCESS_DIM },
  earningsPending: { backgroundColor: WARNING_DIM },
  earningsBadgeText: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12.5, color: INK_MID },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: GOLD,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  totalPrice: { fontSize: 15, fontWeight: '700', color: INK },
});
