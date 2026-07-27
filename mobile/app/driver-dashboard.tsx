import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { fetcher, api, getErrorMessage } from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { ChevronLeft, Car, TrendingUp, Clock, CheckCircle2, MapPin } from 'lucide-react-native';
import {
  SURFACE_DEEP, SURFACE_MID, SURFACE_ELEV,
  FOREST, GOLD, GOLD_DIM, GOLD_LINE,
  CREAM, INK, INK_MID, INK_FAINT,
  BORDER, FONT_DISPLAY, FONT_MONO,
} from '../lib/tokens';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₦${Number(n).toLocaleString('en-NG')}`;
}

// ── Shared local helper duplicated across mutation screens — reconciles the
// active session role to DRIVER before any driver mutation (mirrors
// organiser-dashboard.tsx's ensureOrganiserRole; RolesGuard checks the single
// active `role`, not `registeredRoles[]`, so a prior role switch could
// otherwise 403 this action even though the user already holds DRIVER). ────
async function ensureDriverRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'DRIVER') {
    const { data } = await api.patch('/users/me/role', { role: 'DRIVER' });
    if (data?.accessToken && data?.refreshToken) {
      await SecureStore.setItemAsync('access_token', data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    }
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DriverDashboardScreen() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(false);

  const { data: driverProfile } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => fetcher('/transport/drivers/me'),
  });

  const { data: me } = useQuery<{ role?: string }>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  useEffect(() => {
    if (driverProfile) setIsOnline(!!(driverProfile?.data ?? driverProfile)?.isOnline);
  }, [driverProfile]);

  // EarningsResponse is { totalEarnings, tripCount, acceptanceRate, avgRating } —
  // fetch 'today' and 'week' separately since the backend only returns one period per call.
  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ['driver-earnings', 'today'],
    queryFn: () => fetcher('/transport/drivers/earnings?period=today'),
    refetchInterval: 30_000,
  });
  const { data: weekData, isLoading: weekLoading } = useQuery({
    queryKey: ['driver-earnings', 'week'],
    queryFn: () => fetcher('/transport/drivers/earnings?period=week'),
    refetchInterval: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      await ensureDriverRole(me?.role);
      if (isOnline) return api.post('/transport/go-offline');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission is required to go online');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return api.post('/transport/go-online', { lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    onSuccess: () => {
      setIsOnline(v => !v);
      queryClient.invalidateQueries({ queryKey: ['driver-earnings'] });
      queryClient.invalidateQueries({ queryKey: ['driver-me'] });
    },
    onError: (e: any) => Alert.alert('Error', getErrorMessage(e, e?.message ?? 'Please try again.')),
  });

  const isLoading = todayLoading || weekLoading;
  const today = todayData?.data ?? todayData ?? {};
  const week = weekData?.data ?? weekData ?? {};
  const todayEarnings = Number(today.totalEarnings ?? 0);
  const weekEarnings = Number(week.totalEarnings ?? 0);
  const totalTrips = Number(week.tripCount ?? 0);
  const rating = Number(week.avgRating ?? 0);

  const stats = [
    { label: "Today's Earnings", value: fmt(todayEarnings), Icon: TrendingUp, accent: GOLD },
    { label: 'This Week', value: fmt(weekEarnings), Icon: Clock, accent: GOLD },
    { label: 'Total Trips', value: String(totalTrips), Icon: CheckCircle2, accent: FOREST },
    { label: 'Rating', value: rating > 0 ? `${rating.toFixed(1)} ★` : '—', Icon: Car, accent: GOLD },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#0E3F23', '#051A10']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(5,14,14,0.7)', 'rgba(5,14,14,0.0)', SURFACE_DEEP]}
        locations={[0, 0.25, 0.75]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <ChevronLeft size={20} color={INK} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerKicker}>DRIVER</Text>
            <Text style={styles.headerTitle}>Dashboard</Text>
          </View>
          {/* Online indicator */}
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22C55E' : BORDER }]} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Online toggle card */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleTitle}>{isOnline ? 'You are online' : 'You are offline'}</Text>
              <Text style={styles.toggleSub}>
                {isOnline ? 'Accepting ride requests in your area' : 'Go online to start earning'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, isOnline && styles.toggleBtnActive]}
              onPress={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
              activeOpacity={0.85}
            >
              {toggleMutation.isPending
                ? <ActivityIndicator color={isOnline ? SURFACE_DEEP : GOLD} size="small" />
                : <Text style={[styles.toggleBtnText, isOnline && styles.toggleBtnTextActive]}>
                    {isOnline ? 'Go Offline' : 'Go Online'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* Stats grid */}
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={GOLD} />
            </View>
          ) : (
            <View style={styles.statsGrid}>
              {stats.map(({ label, value, Icon, accent }) => (
                <View key={label} style={styles.statCard}>
                  <View style={[styles.statIconBox, { backgroundColor: `${accent}18` }]}>
                    <Icon size={18} color={accent} strokeWidth={1.8} />
                  </View>
                  <Text style={styles.statValue}>{value}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* How it works */}
          <View style={styles.infoSection}>
            <Text style={styles.infoKicker}>HOW TRIPS WORK</Text>
            {[
              { step: '1', text: 'Go online when ready to accept rides' },
              { step: '2', text: 'A ride request arrives — tap Accept within 15 seconds' },
              { step: '3', text: 'Navigate to pickup and tap Arrived' },
              { step: '4', text: 'Start the trip when passenger boards, end at destination' },
            ].map(({ step, text }) => (
              <View key={step} style={styles.infoRow}>
                <View style={styles.infoStep}>
                  <Text style={styles.infoStepText}>{step}</Text>
                </View>
                <Text style={styles.infoText}>{text}</Text>
              </View>
            ))}
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerKicker: {
    fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.8,
    color: GOLD, textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY, fontSize: 24, color: CREAM,
    fontWeight: '400', letterSpacing: -0.3,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },

  toggleCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 18, flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 20,
  },
  toggleLeft: { flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: INK, marginBottom: 3 },
  toggleSub: { fontSize: 12, color: INK_FAINT, lineHeight: 16 },
  toggleBtn: {
    height: 40, paddingHorizontal: 16, borderRadius: 10,
    borderWidth: 1.5, borderColor: GOLD_LINE,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnActive: { backgroundColor: GOLD, borderColor: GOLD },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: GOLD },
  toggleBtnTextActive: { color: SURFACE_DEEP },

  loadingBox: { height: 120, alignItems: 'center', justifyContent: 'center' },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28,
  },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: SURFACE_MID, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    padding: 16, gap: 8,
  },
  statIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: CREAM },
  statLabel: { fontFamily: FONT_MONO, fontSize: 9.5, color: INK_FAINT, letterSpacing: 0.8 },

  infoSection: { gap: 12 },
  infoKicker: {
    fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.8,
    color: GOLD, textTransform: 'uppercase', marginBottom: 4,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoStep: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_LINE,
    alignItems: 'center', justifyContent: 'center',
  },
  infoStepText: { fontFamily: FONT_MONO, fontSize: 10, fontWeight: '700', color: GOLD },
  infoText: { flex: 1, fontSize: 13.5, color: INK_MID, lineHeight: 19 },
});
