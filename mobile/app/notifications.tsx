import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fetcher } from '../lib/api';
import {
  type LucideIcon,
  ArrowLeft,
  Car,
  Package,
  Sparkles,
  Shield,
  CreditCard,
  Heart,
  Ticket,
  Building2,
  Bell,
} from 'lucide-react-native';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  SUCCESS_TEXT,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tone = 'gold' | 'forest' | 'success';

interface NotificationItem {
  id: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  sub: string;
  time: string;
  unread: boolean;
}

interface Section {
  label: string;
  items: NotificationItem[];
}

// ── Filters ────────────────────────────────────────────────────────────────────

const FILTER_CHIPS = ['All', 'Bookings', 'Money', 'Rides', 'Events', 'Social'] as const;
type FilterChip = (typeof FILTER_CHIPS)[number];

// ── Type → icon/tone mapping ───────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: LucideIcon; tone: Tone }> = {
  RIDE:          { icon: Car,        tone: 'gold'    },
  DELIVERY:      { icon: Package,    tone: 'forest'  },
  EVENT:         { icon: Sparkles,   tone: 'gold'    },
  KYC:           { icon: Shield,     tone: 'forest'  },
  WALLET_CREDIT: { icon: CreditCard, tone: 'success' },
  WALLET_DEBIT:  { icon: CreditCard, tone: 'gold'    },
  SOCIAL:        { icon: Heart,      tone: 'gold'    },
  TICKET:        { icon: Ticket,     tone: 'gold'    },
  STAY:          { icon: Building2,  tone: 'forest'  },
  // Real push types currently sent by TourNotificationsService
  // (backend/src/modules/tour-bookings/tour-notifications.service.ts) — these
  // live in Notification.data.type, not a top-level `type` column.
  tour_t_minus_24h: { icon: Car,      tone: 'gold'   },
  tour_t_minus_2h:  { icon: Car,      tone: 'gold'   },
  tour_post_rating: { icon: Heart,    tone: 'gold'   },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yest';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', { weekday: 'short' });
}

function toNotifItem(n: any): NotificationItem {
  // Notification (backend/prisma/schema.prisma model Notification) has no
  // top-level `type` column — the category string real callers set (e.g.
  // TourNotificationsService) lives inside the `data` JSON field instead.
  // Reading `n.type` here always resolved to undefined, so every notification
  // silently fell back to the generic Sparkles/gold icon regardless of kind.
  const cfg = TYPE_CONFIG[n.data?.type ?? n.type] ?? { icon: Sparkles, tone: 'gold' as Tone };
  return {
    id:     n.id,
    icon:   cfg.icon,
    tone:   cfg.tone,
    title:  n.title   ?? 'Notification',
    sub:    n.body    ?? n.message ?? '',
    time:   n.createdAt ? formatTimeAgo(n.createdAt) : '',
    unread: !n.readAt,
  };
}

function buildSections(items: any[]): Section[] {
  if (!items.length) return [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const newItems     = items.filter((n) => !n.readAt);
  const todayRead    = items.filter((n) => n.readAt && new Date(n.createdAt) >= todayStart);
  const earlierRead  = items.filter((n) => n.readAt && new Date(n.createdAt) < todayStart);

  const sections: Section[] = [];
  if (newItems.length)    sections.push({ label: 'New',     items: newItems.map(toNotifItem)    });
  if (todayRead.length)   sections.push({ label: 'Today',   items: todayRead.map(toNotifItem)   });
  if (earlierRead.length) sections.push({ label: 'Earlier', items: earlierRead.map(toNotifItem) });
  return sections;
}

// ── Tone helpers ───────────────────────────────────────────────────────────────

const TONE_BG: Record<Tone, string> = {
  gold:    GOLD_DIM,
  forest:  'rgba(26,107,60,0.18)',
  success: 'rgba(46,204,113,0.14)',
};

const TONE_ICON: Record<Tone, string> = {
  gold:    GOLD,
  forest:  '#7DD49E',
  success: SUCCESS_TEXT,
};

// ── Components ─────────────────────────────────────────────────────────────────

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const IconComp = item.icon;
  return (
    <TouchableOpacity
      style={[styles.notifRow, item.unread && styles.notifRowUnread]}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[styles.notifIconBox, { backgroundColor: TONE_BG[item.tone] }]}>
        <IconComp size={17} color={TONE_ICON[item.tone]} />
      </View>
      <View style={styles.notifContent}>
        <Text style={[styles.notifTitle, item.unread && styles.notifTitleUnread]}>{item.title}</Text>
        <Text style={styles.notifSub} numberOfLines={1}>{item.sub}</Text>
      </View>
      <View style={styles.notifRight}>
        {item.unread && <View style={styles.unreadDot} />}
        <Text style={styles.notifTime}>{item.time}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SkeletonRow() {
  return (
    <View style={[styles.notifRow, { opacity: 0.5 }]}>
      <View style={[styles.notifIconBox, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 11, width: '65%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.07)' }} />
        <View style={{ height: 9, width: '45%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)' }} />
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Bell size={44} color={INK_FAINT} strokeWidth={1.3} />
      <Text style={styles.emptyTitle}>All clear</Text>
      <Text style={styles.emptySub}>
        No notifications yet. We'll let you know when something comes in.
      </Text>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterChip>('All');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetcher('/notifications'),
    retry: 1,
  });

  const rawItems: any[] = Array.isArray(data?.data ?? data) ? (data?.data ?? data) : [];
  const sections = buildSections(rawItems);
  const unreadCount = rawItems.filter((n) => !n.readAt).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <ArrowLeft size={18} color={INK} />
          </TouchableOpacity>
          <View style={styles.titleSection}>
            <Text style={styles.kicker}>Inbox</Text>
            <Text style={styles.titleRow}>
              <Text style={styles.titleMain}>Notifications</Text>
              {unreadCount > 0 && <Text style={styles.titleCount}> · {unreadCount}</Text>}
            </Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              activeOpacity={0.7}
              onPress={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
            >
              <Text style={styles.markAllText}>Mark all</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filter chips ──────────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
          {FILTER_CHIPS.map((chip) => {
            const isActive = chip === activeFilter;
            return (
              <TouchableOpacity
                key={chip}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(chip)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{chip}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Loading skeleton ──────────────────────────────────────────────── */}
        {isLoading && (
          <View style={styles.sections}>
            <View style={styles.sectionBlock}>
              <View style={styles.sectionCard}>
                <View style={styles.notifDivider}><SkeletonRow /></View>
                <View style={styles.notifDivider}><SkeletonRow /></View>
                <SkeletonRow />
              </View>
            </View>
          </View>
        )}

        {/* ── Empty / error ──────────────────────────────────────────────────── */}
        {!isLoading && (isError || sections.length === 0) && <EmptyState />}

        {/* ── Notification sections ─────────────────────────────────────────── */}
        {!isLoading && !isError && sections.length > 0 && (
          <View style={styles.sections}>
            {sections.map((section) => (
              <View key={section.label} style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                <View style={styles.sectionCard}>
                  {section.items.map((item, idx) => (
                    <View key={item.id} style={idx < section.items.length - 1 ? styles.notifDivider : undefined}>
                      <NotificationRow
                        item={item}
                        onPress={() => item.unread && markReadMutation.mutate(item.id)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 80 },

  // Header
  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  titleSection: { flex: 1 },
  kicker: { fontFamily: FONT_MONO, fontSize: 10, fontWeight: '600', letterSpacing: 1.8, color: GOLD, textTransform: 'uppercase' },
  titleRow: { marginTop: 2 },
  titleMain: { fontFamily: FONT_DISPLAY, fontSize: 26, color: CREAM, letterSpacing: -0.4, lineHeight: 30 },
  titleCount: { fontFamily: FONT_DISPLAY, fontSize: 26, color: GOLD, letterSpacing: -0.4, lineHeight: 30 },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: GOLD_LINE, marginTop: 18 },
  markAllText: { fontSize: 11, fontWeight: '600', color: GOLD },

  // Filter chips
  chipsScroll: { marginTop: 0 },
  chipsContent: { paddingHorizontal: 20, paddingTop: 8, gap: 8, alignItems: 'center' },
  filterChip: { height: 30, borderRadius: 99, paddingHorizontal: 12, backgroundColor: 'transparent', borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: GOLD_DIM, borderColor: GOLD_LINE },
  filterChipText: { fontSize: 11.5, fontWeight: '600', color: INK_MID },
  filterChipTextActive: { color: GOLD },

  // Sections
  sections: { paddingTop: 20 },
  sectionBlock: { marginBottom: 20 },
  sectionLabel: { fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: '600', letterSpacing: 1.8, color: INK_MID, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8 },
  sectionCard: { marginHorizontal: 20, borderRadius: 16, overflow: 'hidden', backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER },
  notifDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },

  // Notification row
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, paddingHorizontal: 14, gap: 12 },
  notifRowUnread: { backgroundColor: 'rgba(212,168,67,0.04)' },
  notifIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 13, fontWeight: '600', color: INK, lineHeight: 18 },
  notifTitleUnread: { fontWeight: '700' },
  notifSub: { fontSize: 11, color: INK_MID, marginTop: 3, lineHeight: 15 },
  notifRight: { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD },
  notifTime: { fontFamily: FONT_MONO, fontSize: 9.5, color: INK_FAINT },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 14 },
  emptyTitle: { fontFamily: FONT_DISPLAY, fontSize: 22, color: CREAM, letterSpacing: -0.3 },
  emptySub: { fontSize: 13, color: INK_MID, textAlign: 'center', lineHeight: 20 },
});
