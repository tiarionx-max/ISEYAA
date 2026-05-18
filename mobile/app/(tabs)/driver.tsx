import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  FlatList,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MapView, { Marker } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';
import {
  Car,
  MapPin,
  Star,
  AlertCircle,
  Navigation,
  CheckCircle,
} from 'lucide-react-native';

const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const WS_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace('/api/v1', '');

type Screen = 'home' | 'incoming' | 'pickup' | 'active' | 'earnings';
type DriverStatusType = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
type EarningsPeriod = 'today' | 'week';

interface IncomingTrip {
  id: string;
  fare: number;
  driverEarnings?: number;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  riderName?: string;
  distanceKm?: number;
}

interface EarningsData {
  totalEarnings: number;
  tripCount: number;
  acceptanceRate: number;
  avgRating: number;
  history?: Array<{ id: string; completedAt: string; fare: number; pickupAddress?: string; dropoffAddress?: string }>;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverScreen() {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>('home');
  const [isOnline, setIsOnline] = useState(false);
  const [driverStatus, setDriverStatus] = useState<DriverStatusType>(null);
  const [currentTrip, setCurrentTrip] = useState<IncomingTrip | null>(null);
  // H-09: useRef mirror so GPS watcher callback always reads latest trip without stale closure
  const currentTripRef = useRef<IncomingTrip | null>(null);
  const [arrived, setArrived] = useState(false);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const [respondCountdown, setRespondCountdown] = useState(15);
  const [earningsPeriod, setEarningsPeriod] = useState<EarningsPeriod>('today');
  const [loading, setLoading] = useState(false);
  const [creditBanner, setCreditBanner] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const respondTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  const { data: earningsData, isLoading: earningsLoading } = useQuery<EarningsData>({
    queryKey: ['driver-earnings', earningsPeriod],
    queryFn: () =>
      api.get(`/transport/drivers/earnings?period=${earningsPeriod}`).then((r) => r.data),
    enabled: screen === 'earnings',
  });

  const { data: todayEarnings } = useQuery<EarningsData>({
    queryKey: ['driver-earnings', 'today'],
    queryFn: () =>
      api.get('/transport/drivers/earnings?period=today').then((r) => r.data),
  });

  // ── WebSocket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await SecureStore.getItemAsync('access_token');
      if (cancelled) return;
      const socket = io(WS_BASE, {
        transports: ['websocket'],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join:driver');
      });

      socket.on('ride:request', (req: IncomingTrip) => {
        currentTripRef.current = req;
        setCurrentTrip(req);
        startRespondCountdown();
        setScreen('incoming');
      });

      socket.on('pickup:confirmed', () => {
        // Rider confirmed; visual cue to enable Start Trip (already enabled after arrived)
      });
    })();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, []);

  // ── Driver profile load (polls every 5s until APPROVED) ─────────────────────
  const { data: driverProfile } = useQuery({
    queryKey: ['driver-profile'],
    queryFn: () => api.get('/transport/drivers/me').then((r) => r.data),
    refetchInterval: (data: any) => data?.status === 'APPROVED' ? false : 5000,
  });

  useEffect(() => {
    setDriverStatus(driverProfile?.status ?? null);
  }, [driverProfile]);

  // ── Respond countdown ────────────────────────────────────────────────────────
  const startRespondCountdown = useCallback(() => {
    setRespondCountdown(15);
    progressAnim.setValue(1);
    Animated.timing(progressAnim, { toValue: 0, duration: 15000, useNativeDriver: false }).start();
    if (respondTimerRef.current) clearInterval(respondTimerRef.current);
    respondTimerRef.current = setInterval(() => {
      setRespondCountdown((c) => {
        if (c <= 1) {
          clearInterval(respondTimerRef.current!);
          respondTimerRef.current = null;
          setScreen('home');
          currentTripRef.current = null;
          setCurrentTrip(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [progressAnim]);

  const stopRespondCountdown = useCallback(() => {
    if (respondTimerRef.current) {
      clearInterval(respondTimerRef.current);
      respondTimerRef.current = null;
    }
    progressAnim.stopAnimation();
  }, [progressAnim]);

  useEffect(() => () => stopRespondCountdown(), [stopRespondCountdown]);

  // ── GPS location watch ───────────────────────────────────────────────────────
  const startLocationWatch = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location required', 'Location access is required to request a ride. Enable it in Settings.');
      return false;
    }
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 0 },
      (loc) => {
        const { latitude, longitude } = loc.coords;
        setMyLat(latitude);
        setMyLng(longitude);
        // H-09: use currentTripRef (not state) to avoid stale closure in long-running watcher
        if (socketRef.current && currentTripRef.current) {
          socketRef.current.emit('driver:location', { tripId: currentTripRef.current.id, lat: latitude, lng: longitude });
        }
      }
    );
    locationWatchRef.current = sub;
    return true;
  }, []);

  const stopLocationWatch = useCallback(() => {
    locationWatchRef.current?.remove();
    locationWatchRef.current = null;
  }, []);

  useEffect(() => () => stopLocationWatch(), [stopLocationWatch]);

  // ── Go online/offline ────────────────────────────────────────────────────────
  const handleGoOnline = useCallback(async () => {
    if (driverStatus !== 'APPROVED') return;
    setLoading(true);
    const ok = await startLocationWatch();
    if (!ok) { setLoading(false); return; }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      await api.post('/transport/go-online', { lat: pos.coords.latitude, lng: pos.coords.longitude });
      setIsOnline(true);
    } catch {
      Alert.alert('Error', 'Failed to go online. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [driverStatus, startLocationWatch]);

  const handleGoOffline = useCallback(async () => {
    setLoading(true);
    try {
      await api.post('/transport/go-offline');
      setIsOnline(false);
      stopLocationWatch();
    } catch {
      // ignore — toggle optimistically
      setIsOnline(false);
      stopLocationWatch();
    } finally {
      setLoading(false);
    }
  }, [stopLocationWatch]);

  // ── Trip actions ─────────────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (!currentTrip) return;
    setLoading(true);
    try {
      await api.patch(`/transport/trips/${currentTrip.id}/accept`);
      stopRespondCountdown();
      setArrived(false);
      setScreen('pickup');
    } catch {
      Alert.alert('Error', 'Failed to accept ride.');
    } finally {
      setLoading(false);
    }
  }, [currentTrip, stopRespondCountdown]);

  const handleDecline = useCallback(async () => {
    if (!currentTrip) return;
    setLoading(true);
    try {
      await api.patch(`/transport/trips/${currentTrip.id}/decline`);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      stopRespondCountdown();
      currentTripRef.current = null;
      setCurrentTrip(null);
      setScreen('home');
    }
  }, [currentTrip, stopRespondCountdown]);

  const handleArrived = useCallback(async () => {
    if (!currentTrip) return;
    setLoading(true);
    try {
      await api.patch(`/transport/trips/${currentTrip.id}/arrive`);
      setArrived(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Could not confirm arrival.');
    } finally {
      setLoading(false);
    }
  }, [currentTrip]);

  const handleStartTrip = useCallback(async () => {
    if (!currentTrip) return;
    setLoading(true);
    try {
      await api.patch(`/transport/trips/${currentTrip.id}/start`);
      setScreen('active');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Waiting for rider to confirm pickup');
    } finally {
      setLoading(false);
    }
  }, [currentTrip]);

  const handleCompleteTrip = useCallback(async () => {
    if (!currentTrip) return;
    setLoading(true);
    try {
      const { data } = await api.patch(`/transport/trips/${currentTrip.id}/complete`);
      setCreditBanner(`₦${data?.driverEarnings?.toFixed(0) ?? '0'} credited to your wallet.`);
      queryClient.invalidateQueries({ queryKey: ['driver-earnings'] });
      setTimeout(() => {
        setCreditBanner('');
        currentTripRef.current = null;
        setCurrentTrip(null);
        setArrived(false);
        setScreen('earnings');
      }, 2000);
    } catch {
      Alert.alert('Error', 'Failed to complete trip.');
    } finally {
      setLoading(false);
    }
  }, [currentTrip, queryClient]);

  // ── Driver status banner ─────────────────────────────────────────────────────
  const renderStatusBanner = () => {
    if (!driverStatus || driverStatus === 'APPROVED') return null;
    const copy =
      driverStatus === 'PENDING_REVIEW'
        ? 'Your KYC is under review. You cannot go online until approved.'
        : driverStatus === 'REJECTED'
        ? 'Your driver application was not approved. Contact support.'
        : 'Your account has been suspended. Contact support to resolve.';
    return (
      <View style={styles.statusBanner}>
        <AlertCircle size={14} color="#DC2626" />
        <Text style={styles.statusBannerText}>{copy}</Text>
      </View>
    );
  };

  // ── Screen: D-1 Home ─────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.homeContent}>
          <Text style={styles.heading}>Driver</Text>

          {renderStatusBanner()}

          {/* Status row */}
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22C55E' : '#6B7280' }]} />
            <Text style={[styles.statusLabel, { color: isOnline ? 'white' : 'rgba(255,255,255,0.4)' }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          {/* Go online/offline toggle */}
          <TouchableOpacity
            style={[styles.toggleButton, isOnline ? styles.toggleOnline : styles.toggleOffline]}
            onPress={() => {
              if (isOnline) {
                Alert.alert(
                  'Go offline?',
                  "You won't receive new ride requests.",
                  [
                    { text: 'Stay Online', style: 'cancel' },
                    { text: 'Go Offline', onPress: handleGoOffline },
                  ]
                );
              } else {
                handleGoOnline();
              }
            }}
            disabled={loading || (driverStatus !== 'APPROVED' && !isOnline)}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.toggleLabel}>{isOnline ? 'GO\nOFFLINE' : 'GO\nONLINE'}</Text>
            )}
          </TouchableOpacity>

          {/* Today's earnings chip */}
          <View style={styles.earningsChip}>
            <Text style={styles.earningsChipLabel}>Today's earnings</Text>
            <Text style={styles.earningsChipAmount}>
              ₦{todayEarnings?.totalEarnings?.toFixed(0) ?? '0'}
            </Text>
          </View>

          <TouchableOpacity onPress={() => setScreen('earnings')}>
            <Text style={styles.earningsLink}>View Earnings Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Screen: D-2 Incoming Request ─────────────────────────────────────────────
  if (screen === 'incoming' && currentTrip) {
    const progressBarColor = respondCountdown <= 5 ? '#DC2626' : GOLD;
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <View style={styles.incomingCard}>
          {/* Timer bar */}
          <Animated.View
            style={[styles.timerBar, {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: progressBarColor,
            }]}
          />
          <Text style={styles.timerLabel}>{respondCountdown}s to respond</Text>

          {/* Trip info */}
          <View style={styles.tripInfoRow}>
            <MapPin size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentTrip.pickupAddress ?? 'Pickup'}</Text>
          </View>
          <View style={styles.tripInfoRow}>
            <Navigation size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentTrip.dropoffAddress ?? 'Destination'}</Text>
          </View>
          {currentTrip.distanceKm && (
            <Text style={styles.tripDistanceText}>{currentTrip.distanceKm.toFixed(1)} km</Text>
          )}

          {/* Fare highlight */}
          <Text style={styles.incomingFare}>₦{currentTrip.fare?.toFixed(0) ?? '0'}</Text>

          {/* Accept + Decline */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.acceptButton} onPress={handleAccept} disabled={loading}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.acceptButtonText}>Accept</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineButton} onPress={handleDecline} disabled={loading}>
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Screen: D-3 Active Pickup ────────────────────────────────────────────────
  if (screen === 'pickup' && currentTrip) {
    const distanceToPickup =
      myLat && myLng && currentTrip.pickupLat && currentTrip.pickupLng
        ? haversineKm(myLat, myLng, currentTrip.pickupLat, currentTrip.pickupLng) * 1000
        : Infinity;
    const closeEnough = distanceToPickup <= 200;

    return (
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          initialRegion={
            currentTrip.pickupLat && currentTrip.pickupLng
              ? {
                  latitude: currentTrip.pickupLat,
                  longitude: currentTrip.pickupLng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }
              : undefined
          }
        >
          {currentTrip.pickupLat && currentTrip.pickupLng && (
            <Marker coordinate={{ latitude: currentTrip.pickupLat, longitude: currentTrip.pickupLng }} pinColor={GOLD} title="Pickup" />
          )}
          {myLat && myLng && (
            <Marker coordinate={{ latitude: myLat, longitude: myLng }} pinColor={FOREST} title="You" />
          )}
        </MapView>

        <View style={styles.tripCard}>
          <Text style={styles.driverNameText}>{currentTrip.riderName ?? 'Rider'}</Text>
          <View style={styles.tripInfoRow}>
            <MapPin size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentTrip.pickupAddress ?? 'Pickup location'}</Text>
          </View>

          {!arrived ? (
            <TouchableOpacity
              style={[styles.ctaButton, !closeEnough && styles.ctaDisabled]}
              onPress={handleArrived}
              disabled={!closeEnough || loading}
            >
              {loading ? (
                <ActivityIndicator color={JUNGLE} />
              ) : (
                <Text style={styles.ctaText}>{closeEnough ? "I've Arrived" : 'Approach pickup point'}</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.ctaButton, { backgroundColor: FOREST }]} onPress={handleStartTrip} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={[styles.ctaText, { color: 'white' }]}>Start Trip</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Screen: D-4 Active Trip ──────────────────────────────────────────────────
  if (screen === 'active' && currentTrip) {
    return (
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          initialRegion={
            currentTrip.dropoffLat && currentTrip.dropoffLng
              ? {
                  latitude: currentTrip.dropoffLat,
                  longitude: currentTrip.dropoffLng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }
              : undefined
          }
        >
          {currentTrip.dropoffLat && currentTrip.dropoffLng && (
            <Marker coordinate={{ latitude: currentTrip.dropoffLat, longitude: currentTrip.dropoffLng }} pinColor={GOLD} title="Destination" />
          )}
          {myLat && myLng && (
            <Marker coordinate={{ latitude: myLat, longitude: myLng }} pinColor={FOREST} title="You" />
          )}
        </MapView>

        <View style={styles.tripCard}>
          <View style={styles.tripInfoRow}>
            <Navigation size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentTrip.dropoffAddress ?? 'Destination'}</Text>
          </View>
          <Text style={styles.fareReminder}>
            ₦{currentTrip.fare?.toFixed(0) ?? '0'} — your share: ₦{currentTrip.driverEarnings?.toFixed(0) ?? '0'}
          </Text>

          {creditBanner ? (
            <View style={styles.creditBanner}>
              <CheckCircle size={14} color="#22C55E" />
              <Text style={styles.creditBannerText}>{creditBanner}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.ctaButton, { backgroundColor: FOREST }]}
              onPress={() =>
                Alert.alert(
                  'Complete this trip?',
                  `₦${currentTrip.driverEarnings?.toFixed(0) ?? '0'} will be credited to your wallet immediately.`,
                  [
                    { text: 'Not Yet', style: 'cancel' },
                    { text: 'Yes, Complete', onPress: handleCompleteTrip },
                  ]
                )
              }
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={[styles.ctaText, { color: 'white' }]}>Complete Trip</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Screen: D-5 Earnings Dashboard ──────────────────────────────────────────
  if (screen === 'earnings') {
    const earnings = earningsData;
    const periodLabel = earningsPeriod === 'today' ? 'today' : 'this week';
    return (
      <SafeAreaView style={styles.container}>
        <FlatList
          ListHeaderComponent={
            <View style={styles.earningsHeader}>
              <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => setScreen('home')}>
                  <Car size={20} color={GOLD} />
                </TouchableOpacity>
                <Text style={styles.heading}>Earnings</Text>
              </View>

              {/* Period toggle */}
              <View style={styles.periodToggle}>
                {(['today', 'week'] as EarningsPeriod[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.periodSegment, earningsPeriod === p && styles.periodSegmentActive]}
                    onPress={() => setEarningsPeriod(p)}
                  >
                    <Text style={[styles.periodLabel, earningsPeriod === p && styles.periodLabelActive]}>
                      {p === 'today' ? 'Today' : 'This Week'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Total */}
              {earningsLoading ? (
                <ActivityIndicator color={GOLD} style={{ marginTop: 24 }} />
              ) : (
                <Text style={styles.earningsTotal}>₦{earnings?.totalEarnings?.toFixed(0) ?? '0'}</Text>
              )}

              {/* Stats row */}
              <View style={styles.statsRow}>
                <View style={styles.statChip}>
                  <Text style={styles.statValue}>{earnings?.tripCount ?? 0}</Text>
                  <Text style={styles.statLabel}>Trips</Text>
                </View>
                <View style={styles.statChip}>
                  <Text style={styles.statValue}>{earnings?.acceptanceRate?.toFixed(0) ?? 0}%</Text>
                  <Text style={styles.statLabel}>Acceptance</Text>
                </View>
                <View style={styles.statChip}>
                  <Text style={styles.statValue}>★ {earnings?.avgRating?.toFixed(1) ?? '—'}</Text>
                  <Text style={styles.statLabel}>Rating</Text>
                </View>
              </View>

              <Text style={[styles.tripInfoText, { marginBottom: 8, marginTop: 16 }]}>Trip History</Text>
            </View>
          }
          data={earnings?.history ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            !earningsLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No trips completed {periodLabel}. Go online to start earning.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDate}>
                  {new Date(item.completedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                </Text>
                <Text style={styles.historyRoute} numberOfLines={1}>
                  {item.pickupAddress ?? '—'} → {item.dropoffAddress ?? '—'}
                </Text>
              </View>
              <Text style={styles.historyFare}>₦{item.fare?.toFixed(0) ?? '0'}</Text>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: JUNGLE },
  centered: { alignItems: 'center', justifyContent: 'center' },
  mapContainer: { flex: 1, backgroundColor: JUNGLE },
  map: { flex: 1 },
  homeContent: { padding: 16, paddingBottom: 40, alignItems: 'center' },
  heading: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 14, fontWeight: 'bold' },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
    marginBottom: 16,
    width: '100%',
  },
  statusBannerText: { fontSize: 13, color: '#DC2626', flex: 1 },
  toggleButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    marginBottom: 24,
  },
  toggleOnline: { backgroundColor: FOREST, borderColor: '#22C55E' },
  toggleOffline: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: '#6B7280' },
  toggleLabel: { fontSize: 14, fontWeight: 'bold', color: 'white', textAlign: 'center' },
  earningsChip: {
    backgroundColor: 'rgba(26,107,60,0.2)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 24,
    alignItems: 'center',
    width: '100%',
  },
  earningsChipLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  earningsChipAmount: { fontSize: 24, fontWeight: 'bold', color: GOLD, marginTop: 4 },
  earningsLink: { fontSize: 14, color: GOLD, marginTop: 16 },
  incomingCard: {
    backgroundColor: JUNGLE,
    borderRadius: 20,
    margin: 16,
    padding: 20,
    overflow: 'hidden',
    width: '92%',
  },
  timerBar: { height: 4, borderRadius: 2, marginBottom: 8 },
  timerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 },
  tripInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tripInfoText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', flex: 1 },
  tripDistanceText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  incomingFare: { fontSize: 24, fontWeight: 'bold', color: GOLD, marginVertical: 16 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  acceptButton: {
    flex: 1,
    backgroundColor: FOREST,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptButtonText: { fontSize: 14, fontWeight: 'bold', color: 'white' },
  declineButton: {
    flex: 1,
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
  },
  declineButtonText: { fontSize: 14, fontWeight: 'bold', color: '#DC2626' },
  tripCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: JUNGLE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    minHeight: 180,
  },
  driverNameText: { fontSize: 14, fontWeight: 'bold', color: 'white', marginBottom: 8 },
  ctaButton: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontSize: 14, fontWeight: 'bold', color: JUNGLE },
  fareReminder: { fontSize: 24, fontWeight: 'bold', color: GOLD, marginBottom: 4 },
  creditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 8,
    padding: 8,
    marginTop: 12,
  },
  creditBannerText: { fontSize: 13, color: '#22C55E' },
  earningsHeader: { padding: 16 },
  earningsTotal: { fontSize: 48, fontWeight: 'bold', color: GOLD, textAlign: 'center', marginTop: 8 },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    padding: 4,
  },
  periodSegment: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  periodSegmentActive: { backgroundColor: FOREST },
  periodLabel: { fontSize: 13, fontWeight: 'bold', color: 'rgba(255,255,255,0.4)' },
  periodLabelActive: { color: 'white' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  statLabel: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  historyDate: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
  historyRoute: { fontSize: 14, color: 'white' },
  historyFare: { fontSize: 14, fontWeight: 'bold', color: GOLD },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyStateText: { fontSize: 14, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
});
