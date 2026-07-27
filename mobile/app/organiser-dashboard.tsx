/**
 * Organiser Dashboard — quick task 260727-d80
 *
 * Self-service entry point for the ORGANISER role. Renders a "Become an
 * organiser" gate (POST /users/me/become-organiser, no approval needed) when
 * the current user has not yet registered the role, then flips to a real
 * dashboard listing every one of the organiser's own events (GET /events/mine,
 * all six EventStatus values) with an Add event CTA and per-event
 * Edit / Submit-for-approval / View-analytics actions.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus, Pencil, Send, BarChart3, Megaphone } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { PressableScale } from '../components/ui/PressableScale';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_MID,
  INK_DIM,
  INK_FAINT,
  BORDER,
  SUCCESS,
  SUCCESS_DIM,
  WARNING,
  WARNING_DIM,
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  TYPE,
  FONT_UI,
  FONT_MONO,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../lib/tokens';

// ── Shared local helper duplicated across mutation screens — reconciles the
// active session role to ORGANISER before any event mutation (mirrors
// property-create.tsx's ensureHostRole; RolesGuard checks the single active
// `role`, not `registeredRoles[]`, so a prior role switch could otherwise 403
// this action even though the user already holds ORGANISER). ──────────────
async function ensureOrganiserRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'ORGANISER') {
    const { data } = await api.patch('/users/me/role', { role: 'ORGANISER' });
    if (data?.accessToken && data?.refreshToken) {
      await SecureStore.setItemAsync('access_token', data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    }
  }
}

// ── Types ────────────────────────────────────────────

type EventStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

interface Me {
  role?: string;
  registeredRoles?: string[];
}

interface OrganiserEvent {
  id: string;
  title: string;
  venue: string;
  startDate: string;
  status: EventStatus;
}

// ── Status badge ─────────────────────────────────────

const STATUS_STYLES: Record<EventStatus, { text: string; bg: string; label: string }> = {
  DRAFT: { text: INK_MID, bg: SURFACE_RAISED, label: 'Draft' },
  PENDING_APPROVAL: { text: WARNING, bg: WARNING_DIM, label: 'Pending approval' },
  APPROVED: { text: SUCCESS, bg: SUCCESS_DIM, label: 'Approved' },
  PUBLISHED: { text: GOLD, bg: GOLD_DIM, label: 'Published' },
  CANCELLED: { text: DESTRUCTIVE, bg: DESTRUCTIVE_DIM, label: 'Cancelled' },
  COMPLETED: { text: INK_DIM, bg: SURFACE_RAISED, label: 'Completed' },
};

function StatusBadge({ status }: { status: EventStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT;
  return (
    <View style={[badgeStyles.pill, { backgroundColor: style.bg }]}>
      <Text style={[badgeStyles.text, { color: style.text }]}>{style.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});

// ── Helpers ──────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date TBD';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Event row ────────────────────────────────────────

function EventRow({ item, meRole }: { item: OrganiserEvent; meRole: string | undefined }) {
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async () => {
      await ensureOrganiserRole(meRole);
      return api.patch(`/events/${item.id}/submit-for-approval`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
    onError: (err) => {
      Alert.alert('Could not submit', getErrorMessage(err, 'Please try again.'));
    },
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.cardMeta} numberOfLines={1}>{item.venue}</Text>
      <Text style={styles.cardMeta}>{formatDate(item.startDate)}</Text>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => router.push(`/event-edit/${item.id}` as never)}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.title}`}
        >
          <Pencil size={14} color={GOLD} />
          <Text style={styles.actionBtnText}>Edit</Text>
        </Pressable>

        {item.status === 'DRAFT' ? (
          <Pressable
            onPress={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            style={({ pressed }) => [styles.actionBtn, (pressed || submitMutation.isPending) && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={`Submit ${item.title} for approval`}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator size="small" color={GOLD} />
            ) : (
              <>
                <Send size={14} color={GOLD} />
                <Text style={styles.actionBtnText}>Submit</Text>
              </>
            )}
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => router.push(`/event-analytics/${item.id}` as never)}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={`View analytics for ${item.title}`}
        >
          <BarChart3 size={14} color={GOLD} />
          <Text style={styles.actionBtnText}>Analytics</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────

export default function OrganiserDashboardScreen(): JSX.Element {
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const isOrganiser = (me?.registeredRoles ?? []).includes('ORGANISER');

  const becomeOrganiserMutation = useMutation({
    mutationFn: () => api.post('/users/me/become-organiser'),
    onSuccess: async (response) => {
      const data = response?.data;
      if (data?.accessToken && data?.refreshToken) {
        await SecureStore.setItemAsync('access_token', data.accessToken);
        await SecureStore.setItemAsync('refresh_token', data.refreshToken);
      }
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => {
      Alert.alert('Error', getErrorMessage(err, 'Something went wrong. Please try again.'));
    },
  });

  const { data: events, isLoading: eventsLoading } = useQuery<OrganiserEvent[]>({
    queryKey: ['my-events'],
    queryFn: () => fetcher('/events/mine'),
    enabled: isOrganiser,
  });

  if (meLoading) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    );
  }

  // ── Gate state: not yet an organiser ──────────────────────────────────
  if (!isOrganiser) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <View style={styles.gateWrap}>
          <View style={styles.gateIconBox}>
            <Megaphone size={28} color={GOLD} />
          </View>
          <Text style={styles.gateTitle}>Become an organiser</Text>
          <Text style={styles.gateSub}>
            Create and manage your own events on Iṣẹ́yáá — no approval needed to get started.
          </Text>
          <PressableScale
            onPress={() => becomeOrganiserMutation.mutate()}
            disabled={becomeOrganiserMutation.isPending}
            style={styles.gateBtn}
            hapticStyle="medium"
          >
            {becomeOrganiserMutation.isPending ? (
              <ActivityIndicator color={SURFACE_DEEP} />
            ) : (
              <Text style={styles.gateBtnText}>Become an organiser</Text>
            )}
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  // ── Dashboard state ────────────────────────────────────────────────────
  const eventsList = events ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Events</Text>
          <Text style={styles.headerSub}>
            {eventsList.length} event{eventsList.length === 1 ? '' : 's'}
          </Text>
        </View>
        <PressableScale
          onPress={() => router.push('/event-create' as never)}
          style={styles.addBtn}
          hapticStyle="medium"
        >
          <Plus size={16} color={SURFACE_DEEP} />
          <Text style={styles.addBtnText}>Add event</Text>
        </PressableScale>
      </View>

      {eventsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : eventsList.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No events yet</Text>
          <Text style={styles.emptyText}>
            Create your first event to start selling tickets on Iṣẹ́yáá.
          </Text>
          <PressableScale
            onPress={() => router.push('/event-create' as never)}
            style={styles.emptyCta}
            hapticStyle="medium"
          >
            <Text style={styles.emptyCtaText}>Add event</Text>
          </PressableScale>
        </View>
      ) : (
        <FlatList
          data={eventsList}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventRow item={item} meRole={me?.role} />}
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
  root: { flex: 1, backgroundColor: SURFACE_MID },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE_5 },

  // Gate state
  gateWrap: { alignItems: 'center', paddingHorizontal: SPACE_5, gap: SPACE_3 },
  gateIconBox: {
    width: 64,
    height: 64,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE_2,
  },
  gateTitle: { ...TYPE.heading, fontSize: 20, color: INK, textAlign: 'center' },
  gateSub: { ...TYPE.body, color: INK_MID, textAlign: 'center' },
  gateBtn: {
    marginTop: SPACE_3,
    minHeight: 52,
    paddingHorizontal: SPACE_5,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
  },
  gateBtnText: { fontFamily: FONT_UI, fontSize: 15, fontWeight: '700', color: SURFACE_DEEP },

  // Header
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
  addBtnText: { fontFamily: FONT_UI, fontSize: 13, fontWeight: '700', color: SURFACE_DEEP },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE_5, gap: SPACE_3 },
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

  // Event card
  card: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: SPACE_4,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE_3 },
  cardTitle: { fontFamily: FONT_UI, fontSize: 15, fontWeight: '700', color: INK, flex: 1 },
  cardMeta: { fontFamily: FONT_UI, fontSize: 12, color: INK_MID },

  actionsRow: { flexDirection: 'row', gap: SPACE_3, marginTop: SPACE_3, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: SPACE_3,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  actionBtnText: { fontFamily: FONT_UI, fontSize: 12, fontWeight: '700', color: GOLD },
});
