/**
 * Event Analytics — quick task 260727-d80
 *
 * Fetches GET /events/:id/analytics and renders tickets_sold / revenue /
 * check_in_rate (as a %) / hourly_sales_chart (as a simple bar-list — no
 * charting library is installed beyond react-native-svg, per this codebase's
 * constraints). Zero-value analytics on an unpublished/no-sales event are a
 * legitimate, correct result — there is currently no backend endpoint to
 * create/update TicketType rows for organiser-created events (known
 * pre-existing backend limitation, out of scope for this plan).
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Ticket, Wallet, CheckCircle2 } from 'lucide-react-native';

import { fetcher } from '../../lib/api';
import {
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  INK,
  INK_MID,
  BORDER,
  FONT_UI,
  FONT_MONO,
  TYPE,
  RADIUS_LG,
  RADIUS_MD,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../../lib/tokens';

// ── Currency formatting (duplicated verbatim from events/[id].tsx per this
// codebase's per-screen small-helper duplication convention) ─────────────
function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

// ── Types ────────────────────────────────────────────

interface HourlySale {
  hour: string;
  count: number;
}

interface EventAnalytics {
  tickets_sold: number;
  revenue: number;
  check_in_rate: number;
  hourly_sales_chart: HourlySale[];
}

function formatHourLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit' });
}

// ── Screen ───────────────────────────────────────────

export default function EventAnalyticsScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading } = useQuery<EventAnalytics>({
    queryKey: ['event-analytics', id],
    queryFn: () => fetcher(`/events/${id}/analytics`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    );
  }

  const ticketsSold = data?.tickets_sold ?? 0;
  const revenue = data?.revenue ?? 0;
  const checkInRate = data?.check_in_rate ?? 0;
  const hourlySales = data?.hourly_sales_chart ?? [];
  const maxCount = Math.max(1, ...hourlySales.map((h) => h.count));

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Stat tiles */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Ticket size={18} color={GOLD} />
            <Text style={styles.statValue}>{ticketsSold}</Text>
            <Text style={styles.statLabel}>TICKETS SOLD</Text>
          </View>
          <View style={styles.statCell}>
            <Wallet size={18} color={GOLD} />
            <Text style={styles.statValue}>{formatCurrency(revenue)}</Text>
            <Text style={styles.statLabel}>REVENUE</Text>
          </View>
          <View style={styles.statCell}>
            <CheckCircle2 size={18} color={GOLD} />
            <Text style={styles.statValue}>{(checkInRate * 100).toFixed(1)}%</Text>
            <Text style={styles.statLabel}>CHECK-IN RATE</Text>
          </View>
        </View>

        {/* Hourly sales chart */}
        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Hourly sales</Text>
          {hourlySales.length === 0 ? (
            <Text style={styles.emptyText}>No ticket sales yet.</Text>
          ) : (
            <View style={styles.chartList}>
              {hourlySales.map((entry) => (
                <View key={entry.hour} style={styles.chartRow}>
                  <Text style={styles.chartRowLabel} numberOfLines={1}>
                    {formatHourLabel(entry.hour)}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${(entry.count / maxCount) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartRowCount}>{entry.count}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_MID },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: SPACE_5, paddingTop: SPACE_5, paddingBottom: 60, gap: SPACE_5 },

  statsRow: { flexDirection: 'row', gap: SPACE_3 },
  statCell: {
    flex: 1,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: RADIUS_LG,
    paddingVertical: SPACE_4,
    paddingHorizontal: SPACE_2,
    alignItems: 'center',
    gap: 6,
  },
  statValue: { ...TYPE.bodyEmphasis, fontSize: 16, color: INK, textAlign: 'center' },
  statLabel: {
    fontFamily: FONT_MONO,
    fontSize: 8.5,
    fontWeight: '600',
    color: INK_MID,
    letterSpacing: 0.8,
    textAlign: 'center',
  },

  chartSection: { gap: SPACE_3 },
  chartTitle: { ...TYPE.bodyEmphasis, fontSize: 15, color: INK },
  emptyText: { ...TYPE.body, color: INK_MID },

  chartList: { gap: SPACE_3 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE_3 },
  chartRowLabel: { fontFamily: FONT_UI, fontSize: 11, color: INK_MID, width: 92 },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: GOLD, borderRadius: RADIUS_MD },
  chartRowCount: { fontFamily: FONT_MONO, fontSize: 12, fontWeight: '700', color: GOLD, width: 28, textAlign: 'right' },
});
