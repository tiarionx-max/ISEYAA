/**
 * Ministry Dashboard — quick task 260727-exm
 *
 * Read-only mobile port of web/src/app/admin/ministry/page.tsx. Gated on the
 * current session's active `role` (MINISTRY_VIEWER / STATE_ADMIN / SUPER_ADMIN),
 * mirroring RolesGuard's own check server-side. No CSV/PDF export, no charting
 * library beyond plain bar-lists (mobile has no recharts/victory-native/etc —
 * confirmed via mobile/package.json), and the web's LGA×Month heatmap is
 * replaced with a "Top LGAs by visitor count" ranked list computed client-side
 * from the already-fetched visitor-entries data (zero extra network request).
 *
 * There is no self-service path to the gated roles anywhere in this codebase
 * (confirmed via exhaustive grep) — this screen never renders a "become a
 * ministry viewer" CTA of any kind.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';

import { fetcher } from '../lib/api';
import { Chip } from '../components/ui/Chip';
import {
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  INK,
  INK_MID,
  INK_DIM,
  BORDER,
  FONT_UI,
  FONT_MONO,
  TYPE,
  RADIUS_MD,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../lib/tokens';

// ── Currency formatting (duplicated verbatim from event-analytics/[id].tsx
// per this codebase's per-screen small-helper duplication convention) ─────
function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

// ── Types (field names verified directly against backend service files) ──

interface VisitorEntryRow {
  lgaId: string | null;
  lgaName: string | null;
  month: string; // "YYYY-MM"
  userRole: string;
  count: number;
}

interface PurposeRow {
  purpose: string;
  month: string; // "YYYY-MM"
  count: number;
}

interface ModuleRevenueRow {
  module: string;
  total: number;
}

interface MonthRevenueRow {
  month: string;
  total: number;
}

interface ModuleLgaRevenueRow {
  module: string;
  lgaId: string | null;
  lgaName: string | null;
  total: number;
}

interface RevenueData {
  byModule: ModuleRevenueRow[];
  byMonth: MonthRevenueRow[];
  byModuleLga: ModuleLgaRevenueRow[];
}

interface LgaOption {
  id: string;
  name: string;
}

// ── Date helpers (mirrors web's defaultDateRange()) ────────────────────

function defaultFromDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

function toQueryDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Aggregation helpers ─────────────────────────────────────────────────

interface VisitorLgaAgg {
  lgaName: string;
  total: number;
  tourist: number;
  citizen: number;
  other: number;
}

function aggregateVisitorEntriesByLga(rows: VisitorEntryRow[]): VisitorLgaAgg[] {
  const map = new Map<string, VisitorLgaAgg>();
  for (const row of rows) {
    const lgaName = row.lgaName ?? 'Unknown';
    const existing = map.get(lgaName) ?? { lgaName, total: 0, tourist: 0, citizen: 0, other: 0 };
    existing.total += row.count;
    if (row.userRole === 'TOURIST') existing.tourist += row.count;
    else if (row.userRole === 'CITIZEN') existing.citizen += row.count;
    else existing.other += row.count;
    map.set(lgaName, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

interface PurposeAgg {
  purpose: string;
  total: number;
}

function aggregatePurposeBreakdown(rows: PurposeRow[]): PurposeAgg[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.purpose, (map.get(row.purpose) ?? 0) + row.count);
  }
  return Array.from(map.entries())
    .map(([purpose, total]) => ({ purpose, total }))
    .sort((a, b) => b.total - a.total);
}

// ── Bar list (verbatim structural pattern from event-analytics/[id].tsx:
// chartList/chartRow/barTrack/barFill) ───────────────────────────────────

interface BarListEntry {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  caption?: string;
}

function BarList({ entries }: { entries: BarListEntry[] }): JSX.Element {
  const maxValue = Math.max(1, ...entries.map((e) => e.value));
  return (
    <View style={styles.chartList}>
      {entries.map((entry) => (
        <View key={entry.key} style={styles.chartRowWrap}>
          <View style={styles.chartRow}>
            <Text style={styles.chartRowLabel} numberOfLines={1}>
              {entry.label}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(entry.value / maxValue) * 100}%` }]} />
            </View>
            <Text style={styles.chartRowCount} numberOfLines={1}>
              {entry.valueLabel}
            </Text>
          </View>
          {entry.caption ? <Text style={styles.chartRowCaption}>{entry.caption}</Text> : null}
        </View>
      ))}
    </View>
  );
}

// ── Screen ───────────────────────────────────────────

export default function MinistryDashboardScreen(): JSX.Element {
  const { data: me, isLoading: meLoading } = useQuery<{ role?: string }>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const canViewMinistry = ['MINISTRY_VIEWER', 'STATE_ADMIN', 'SUPER_ADMIN'].includes(me?.role ?? '');

  useEffect(() => {
    if (!meLoading && !canViewMinistry) {
      router.replace('/(tabs)' as any);
    }
  }, [meLoading, canViewMinistry]);

  const [fromDate, setFromDate] = useState<Date>(defaultFromDate());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [lgaId, setLgaId] = useState('');

  const from = toQueryDate(fromDate);
  const to = toQueryDate(toDate);
  const lgaParam = lgaId ? `&lgaId=${lgaId}` : '';

  const { data: lgas } = useQuery<LgaOption[]>({
    queryKey: ['lgas'],
    queryFn: () => fetcher('/lgas'),
    enabled: canViewMinistry,
  });

  const { data: visitorEntries, isLoading: visitorEntriesLoading } = useQuery<VisitorEntryRow[]>({
    queryKey: ['ministry-visitor-entries', from, to, lgaId],
    queryFn: () => fetcher(`/ministry/visitor-entries?from=${from}&to=${to}${lgaParam}`),
    enabled: canViewMinistry,
  });

  const { data: purposeBreakdown, isLoading: purposeBreakdownLoading } = useQuery<PurposeRow[]>({
    queryKey: ['ministry-purpose-breakdown', from, to, lgaId],
    queryFn: () => fetcher(`/ministry/purpose-breakdown?from=${from}&to=${to}${lgaParam}`),
    enabled: canViewMinistry,
  });

  // No lgaParam here — GET /ministry/revenue does not accept an lgaId query param.
  const { data: revenue, isLoading: revenueLoading } = useQuery<RevenueData>({
    queryKey: ['ministry-revenue', from, to],
    queryFn: () => fetcher(`/ministry/revenue?from=${from}&to=${to}`),
    enabled: canViewMinistry,
  });

  if (meLoading || !canViewMinistry) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    );
  }

  const visitorEntryRows = visitorEntries ?? [];
  const purposeRows = purposeBreakdown ?? [];

  const visitorLgaAgg = aggregateVisitorEntriesByLga(visitorEntryRows);
  const purposeAgg = aggregatePurposeBreakdown(purposeRows);

  const visitorBarEntries: BarListEntry[] = visitorLgaAgg.map((agg) => ({
    key: agg.lgaName,
    label: agg.lgaName,
    value: agg.total,
    valueLabel: String(agg.total),
    caption: `Tourist ${agg.tourist} · Citizen ${agg.citizen} · Other ${agg.other}`,
  }));

  const purposeBarEntries: BarListEntry[] = purposeAgg.map((agg) => ({
    key: agg.purpose,
    label: agg.purpose,
    value: agg.total,
    valueLabel: String(agg.total),
  }));

  // Mirrors the web page's own empty-state check for the ministry-wallet-unresolved
  // degradation case (backend returns {byModule:[],byMonth:[],byModuleLga:[]}, never an error).
  const revenueIsEmpty =
    !!revenue && revenue.byModule.length === 0 && revenue.byMonth.length === 0 && revenue.byModuleLga.length === 0;

  const revenueByModuleEntries: BarListEntry[] = (revenue?.byModule ?? [])
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((row) => ({ key: row.module, label: row.module, value: row.total, valueLabel: formatCurrency(row.total) }));

  const revenueByMonthEntries: BarListEntry[] = (revenue?.byMonth ?? [])
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => ({ key: row.month, label: row.month, value: row.total, valueLabel: formatCurrency(row.total) }));

  const revenueByLgaMap = new Map<string, number>();
  for (const row of revenue?.byModuleLga ?? []) {
    const lgaName = row.lgaName ?? 'Unknown';
    revenueByLgaMap.set(lgaName, (revenueByLgaMap.get(lgaName) ?? 0) + row.total);
  }
  const revenueByLgaEntries: BarListEntry[] = Array.from(revenueByLgaMap.entries())
    .map(([lgaName, total]) => ({ key: lgaName, label: lgaName, value: total, valueLabel: formatCurrency(total) }))
    .sort((a, b) => b.value - a.value);

  // Top LGAs panel reuses the already-fetched visitorLgaAgg (from Task 1's
  // aggregateVisitorEntriesByLga) — zero additional network request.
  const topLgas = visitorLgaAgg.slice(0, 10);
  const topLgaMax = Math.max(1, ...topLgas.map((l) => l.total));

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Ministry Dashboard</Text>
          <Text style={styles.headerSubtitle}>Visitor entries, purpose-of-visit, and revenue-to-government</Text>
        </View>

        {/* Filters */}
        <View style={styles.filtersSection}>
          <View style={styles.dateRow}>
            <Pressable
              style={({ pressed }) => [styles.dateField, pressed && { opacity: 0.8 }]}
              onPress={() => setShowFromPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Pick from date"
            >
              <CalendarDays size={14} color={GOLD} />
              <View>
                <Text style={styles.dateFieldLabel}>From</Text>
                <Text style={styles.dateFieldValue}>{formatDateLabel(fromDate)}</Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.dateField, pressed && { opacity: 0.8 }]}
              onPress={() => setShowToPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Pick to date"
            >
              <CalendarDays size={14} color={GOLD} />
              <View>
                <Text style={styles.dateFieldLabel}>To</Text>
                <Text style={styles.dateFieldValue}>{formatDateLabel(toDate)}</Text>
              </View>
            </Pressable>
          </View>
          {showFromPicker && (
            <DateTimePicker
              value={fromDate}
              mode="date"
              onChange={(_: unknown, d?: Date) => {
                if (Platform.OS !== 'ios') setShowFromPicker(false);
                if (d) setFromDate(d);
              }}
            />
          )}
          {showToPicker && (
            <DateTimePicker
              value={toDate}
              mode="date"
              onChange={(_: unknown, d?: Date) => {
                if (Platform.OS !== 'ios') setShowToPicker(false);
                if (d) setToDate(d);
              }}
            />
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.lgaChipsScroll}
            contentContainerStyle={styles.lgaChipsRow}
          >
            <Chip label="All LGAs" active={lgaId === ''} onPress={() => setLgaId('')} />
            {(lgas ?? []).map((lga) => (
              <Chip key={lga.id} label={lga.name} active={lgaId === lga.id} onPress={() => setLgaId(lga.id)} />
            ))}
          </ScrollView>
        </View>

        {/* Visitor Entries panel */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Visitor entries</Text>
          {visitorEntriesLoading ? (
            <ActivityIndicator color={GOLD} />
          ) : visitorBarEntries.length === 0 ? (
            <Text style={styles.emptyText}>No visitor entries for this period.</Text>
          ) : (
            <BarList entries={visitorBarEntries} />
          )}
        </View>

        {/* Purpose Breakdown panel */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Purpose of visit</Text>
          {purposeBreakdownLoading ? (
            <ActivityIndicator color={GOLD} />
          ) : purposeBarEntries.length === 0 ? (
            <Text style={styles.emptyText}>No purpose-of-visit data for this period.</Text>
          ) : (
            <BarList entries={purposeBarEntries} />
          )}
        </View>

        {/* Revenue panel */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Revenue to government</Text>
          {revenueLoading ? (
            <ActivityIndicator color={GOLD} />
          ) : revenueIsEmpty ? (
            <Text style={styles.emptyText}>No revenue data for this period.</Text>
          ) : (
            <View style={styles.revenueSubsections}>
              <View style={styles.revenueSubsection}>
                <Text style={styles.revenueSubsectionTitle}>By module</Text>
                {revenueByModuleEntries.length === 0 ? (
                  <Text style={styles.emptyText}>No data.</Text>
                ) : (
                  <BarList entries={revenueByModuleEntries} />
                )}
              </View>
              <View style={styles.revenueSubsection}>
                <Text style={styles.revenueSubsectionTitle}>By month</Text>
                {revenueByMonthEntries.length === 0 ? (
                  <Text style={styles.emptyText}>No data.</Text>
                ) : (
                  <BarList entries={revenueByMonthEntries} />
                )}
              </View>
              <View style={styles.revenueSubsection}>
                <Text style={styles.revenueSubsectionTitle}>By LGA (stays, marketplace, tours)</Text>
                {revenueByLgaEntries.length === 0 ? (
                  <Text style={styles.emptyText}>No data.</Text>
                ) : (
                  <BarList entries={revenueByLgaEntries} />
                )}
              </View>
            </View>
          )}
        </View>

        {/* Top LGAs panel — replaces the web's LGA×Month heatmap (screen width
            cannot fit that grid); reuses the already-fetched visitorEntries
            data, zero additional network request. */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Top LGAs by visitor count</Text>
          {visitorEntriesLoading ? (
            <ActivityIndicator color={GOLD} />
          ) : topLgas.length === 0 ? (
            <Text style={styles.emptyText}>No visitor data to rank.</Text>
          ) : (
            <View style={styles.chartList}>
              {topLgas.map((lga, idx) => (
                <View key={lga.lgaName} style={styles.rankRow}>
                  <Text style={styles.rankBadge}>#{idx + 1}</Text>
                  <Text style={styles.chartRowLabel} numberOfLines={1}>
                    {lga.lgaName}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(lga.total / topLgaMax) * 100}%` }]} />
                  </View>
                  <Text style={styles.chartRowCount}>{lga.total}</Text>
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

  header: { gap: 4 },
  headerTitle: { ...TYPE.heading, fontSize: 22, color: INK },
  headerSubtitle: { ...TYPE.body, fontSize: 12.5, color: INK_MID },

  filtersSection: { gap: SPACE_3 },
  dateRow: { flexDirection: 'row', gap: SPACE_3 },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_2,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: RADIUS_MD,
    paddingHorizontal: SPACE_3,
    paddingVertical: SPACE_2,
  },
  dateFieldLabel: { fontFamily: FONT_MONO, fontSize: 8.5, fontWeight: '600', color: INK_DIM, letterSpacing: 0.8 },
  dateFieldValue: { fontFamily: FONT_UI, fontSize: 12.5, fontWeight: '600', color: INK },

  lgaChipsScroll: { marginTop: 2 },
  lgaChipsRow: { gap: SPACE_2, paddingRight: SPACE_5 },

  panel: { gap: SPACE_3 },
  panelTitle: { ...TYPE.bodyEmphasis, fontSize: 15, color: INK },
  emptyText: { ...TYPE.body, color: INK_MID },

  revenueSubsections: { gap: SPACE_4 },
  revenueSubsection: { gap: SPACE_2 },
  revenueSubsectionTitle: { fontFamily: FONT_UI, fontSize: 12.5, fontWeight: '700', color: INK_MID },

  chartList: { gap: SPACE_3 },
  chartRowWrap: { gap: 4 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE_3 },
  chartRowLabel: { fontFamily: FONT_UI, fontSize: 11, color: INK_MID, width: 100, flexShrink: 0 },
  chartRowCaption: { fontFamily: FONT_UI, fontSize: 10, color: INK_DIM, marginLeft: 112 },
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
  chartRowCount: { fontFamily: FONT_UI, fontSize: 12, fontWeight: '700', color: GOLD, width: 64, textAlign: 'right' },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE_3 },
  rankBadge: { fontFamily: FONT_MONO, fontSize: 11, fontWeight: '700', color: GOLD, width: 28 },
});
