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
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MapView, { Marker } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';
import {
  MapPin,
  AlertCircle,
  Navigation,
  CheckCircle,
  Package,
  Camera,
} from 'lucide-react-native';

const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const WS_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace('/api/v1', '');

type Screen = 'home' | 'incoming' | 'pickup' | 'active' | 'earnings';
type RiderStatusType = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
type EarningsPeriod = 'today' | 'week';

interface DeliveryRequest {
  id: string;
  pickupAddress: string;
  dropoffAddress: string;
  itemDescription: string;
  weightKg: number;
  fee: number;
  riderEarnings?: number;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  senderName?: string;
  distanceKm?: number;
}

interface EarningsData {
  totalEarnings: number;
  tripCount: number;
  acceptanceRate: number;
  avgRating: number;
  history?: Array<{
    id: string;
    completedAt: string;
    fee: number;
    riderEarnings?: number;
    pickupAddress?: string;
    dropoffAddress?: string;
  }>;
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

export default function RiderScreen() {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>('home');
  const [isOnline, setIsOnline] = useState(false);
  const [riderStatus, setRiderStatus] = useState<RiderStatusType>(null);
  const [currentOrder, setCurrentOrder] = useState<DeliveryRequest | null>(null);
  // H-08: useRef mirror so GPS watcher callback always reads latest order without stale closure
  const currentOrderRef = useRef<DeliveryRequest | null>(null);
  const [collected, setCollected] = useState(false);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const [respondCountdown, setRespondCountdown] = useState(15);
  const [earningsPeriod, setEarningsPeriod] = useState<EarningsPeriod>('today');
  const [loading, setLoading] = useState(false);
  const [creditBanner, setCreditBanner] = useState('');
  const [rating, setRating] = useState(0);

  // OTP state
  const [otpCells, setOtpCells] = useState<string[]>(['', '', '', '', '', '']);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState(false);
  const otpInputRefs = useRef<Array<any>>([]);

  // Photo proof state
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const respondTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  const { data: earningsData, isLoading: earningsLoading } = useQuery<EarningsData>({
    queryKey: ['rider-earnings', earningsPeriod],
    queryFn: () =>
      api.get(`/delivery/riders/earnings?period=${earningsPeriod}`).then((r) => r.data),
    enabled: screen === 'earnings',
  });

  const { data: todayEarnings } = useQuery<EarningsData>({
    queryKey: ['rider-earnings', 'today'],
    queryFn: () =>
      api.get('/delivery/riders/earnings?period=today').then((r) => r.data),
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
        socket.emit('join:rider');
      });

      socket.on('delivery:request', (req: DeliveryRequest) => {
        currentOrderRef.current = req;
        setCurrentOrder(req);
        startRespondCountdown();
        setScreen('incoming');
      });
    })();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, []);

  // ── Rider profile load ───────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/delivery/riders/me').then((r) => setRiderStatus(r.data?.status ?? null)).catch(() => {});
  }, []);

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
          currentOrderRef.current = null;
          setCurrentOrder(null);
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
      Alert.alert('Location required', 'Location access is required to go online. Enable it in Settings.');
      return false;
    }
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 0 },
      (loc) => {
        const { latitude, longitude } = loc.coords;
        setMyLat(latitude);
        setMyLng(longitude);
        // H-08: use currentOrderRef (not state) to avoid stale closure in long-running watcher
        if (socketRef.current && currentOrderRef.current) {
          socketRef.current.emit('rider:location', { deliveryId: currentOrderRef.current.id, lat: latitude, lng: longitude });
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
    if (riderStatus !== 'APPROVED') return;
    setLoading(true);
    const ok = await startLocationWatch();
    if (!ok) { setLoading(false); return; }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      await api.post('/delivery/go-online', { lat: pos.coords.latitude, lng: pos.coords.longitude });
      setIsOnline(true);
    } catch {
      Alert.alert('Error', 'Failed to go online. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [riderStatus, startLocationWatch]);

  const handleGoOffline = useCallback(async () => {
    setLoading(true);
    try {
      await api.post('/delivery/go-offline');
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

  // ── Delivery actions ─────────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (!currentOrder) return;
    setLoading(true);
    try {
      await api.patch(`/delivery/orders/${currentOrder.id}/accept`);
      stopRespondCountdown();
      setCollected(false);
      setScreen('pickup');
    } catch {
      Alert.alert('Error', 'Failed to accept delivery.');
    } finally {
      setLoading(false);
    }
  }, [currentOrder, stopRespondCountdown]);

  const handleDecline = useCallback(async () => {
    if (!currentOrder) return;
    setLoading(true);
    try {
      await api.patch(`/delivery/orders/${currentOrder.id}/decline`);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      stopRespondCountdown();
      currentOrderRef.current = null;
      setCurrentOrder(null);
      setScreen('home');
    }
  }, [currentOrder, stopRespondCountdown]);

  const handleCollect = useCallback(async () => {
    if (!currentOrder) return;
    setLoading(true);
    try {
      await api.patch(`/delivery/orders/${currentOrder.id}/collect`);
      // Reset OTP and photo state for new delivery
      setOtpCells(['', '', '', '', '', '']);
      setOtpVerified(false);
      setOtpError(false);
      setPhotoUri(null);
      setScreen('active');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Could not confirm collection.');
    } finally {
      setLoading(false);
    }
  }, [currentOrder]);

  // ── OTP verification ─────────────────────────────────────────────────────────
  const handleOtpChange = useCallback((index: number, value: string) => {
    const newCells = [...otpCells];
    newCells[index] = value;
    setOtpCells(newCells);
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
    // Auto-verify when all 6 cells filled
    if (newCells.every((c) => c !== '') && !otpVerified) {
      verifyOtp(newCells.join(''));
    }
  }, [otpCells, otpVerified]);

  const handleOtpKeyPress = useCallback((index: number, key: string) => {
    if (key === 'Backspace' && otpCells[index] === '' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }, [otpCells]);

  const verifyOtp = useCallback(async (otp: string) => {
    if (!currentOrder) return;
    try {
      await api.post(`/delivery/orders/${currentOrder.id}/verify-otp`, { otp });
      setOtpVerified(true);
      setOtpError(false);
    } catch {
      setOtpError(true);
      setOtpCells(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    }
  }, [currentOrder]);

  // ── Photo upload ─────────────────────────────────────────────────────────────
  const handlePickPhoto = useCallback(() => {
    Alert.alert(
      'Upload Proof of Delivery',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission required', 'Camera access is required to take a proof photo.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.7,
            });
            if (!result.canceled && result.assets.length > 0) {
              setPhotoUri(result.assets[0].uri);
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission required', 'Media library access is required to upload proof of delivery.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.7,
            });
            if (!result.canceled && result.assets.length > 0) {
              setPhotoUri(result.assets[0].uri);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, []);

  // ── Confirm delivery ─────────────────────────────────────────────────────────
  const handleConfirmDelivery = useCallback(async () => {
    if (!currentOrder || !otpVerified || !photoUri) return;
    Alert.alert(
      'Confirm delivery?',
      `₦${currentOrder.riderEarnings?.toFixed(0) ?? '0'} will be credited to your wallet immediately.`,
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, Confirm',
          onPress: async () => {
            setLoading(true);
            try {
              // L-07: use expo-file-system (avoids fetch+Buffer which can crash on large files in RN)
              const b64 = await FileSystem.readAsStringAsync(photoUri, {
                encoding: FileSystem.EncodingType.Base64,
              });

              const { data } = await api.patch(`/delivery/orders/${currentOrder.id}/complete`, {
                proofPhotoBase64: b64,
                senderRating: rating || undefined,
              });

              setCreditBanner(`₦${data?.riderEarnings?.toFixed(0) ?? '0'} credited to your wallet.`);
              queryClient.invalidateQueries({ queryKey: ['rider-earnings'] });
              setTimeout(() => {
                setCreditBanner('');
                currentOrderRef.current = null;
                setCurrentOrder(null);
                setCollected(false);
                setOtpCells(['', '', '', '', '', '']);
                setOtpVerified(false);
                setOtpError(false);
                setPhotoUri(null);
                setRating(0);
                setScreen('earnings');
              }, 2000);
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message ?? 'Failed to confirm delivery.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [currentOrder, otpVerified, photoUri, rating, queryClient]);

  // ── Rider status banner ──────────────────────────────────────────────────────
  const renderStatusBanner = () => {
    if (!riderStatus || riderStatus === 'APPROVED') return null;
    const copy =
      riderStatus === 'PENDING_REVIEW'
        ? 'Your KYC is under review. You cannot go online until approved.'
        : riderStatus === 'REJECTED'
        ? 'Your rider application was not approved. Contact support.'
        : 'Your account has been suspended. Contact support to resolve.';
    return (
      <View style={styles.statusBanner}>
        <AlertCircle size={14} color="#DC2626" />
        <Text style={styles.statusBannerText}>{copy}</Text>
      </View>
    );
  };

  // ── Screen: R-1 Home ─────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.homeContent}>
          <Text style={styles.heading}>Rider</Text>

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
                  "You won't receive new delivery requests.",
                  [
                    { text: 'Stay Online', style: 'cancel' },
                    { text: 'Go Offline', onPress: handleGoOffline },
                  ]
                );
              } else {
                handleGoOnline();
              }
            }}
            disabled={loading || (riderStatus !== 'APPROVED' && !isOnline)}
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

  // ── Screen: R-2 Incoming Delivery Request ────────────────────────────────────
  if (screen === 'incoming' && currentOrder) {
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

          {/* Delivery info rows */}
          <View style={styles.tripInfoRow}>
            <MapPin size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentOrder.pickupAddress ?? 'Pickup'}</Text>
          </View>
          <View style={styles.tripInfoRow}>
            <Navigation size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentOrder.dropoffAddress ?? 'Destination'}</Text>
          </View>
          <View style={styles.tripInfoRow}>
            <Package size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentOrder.itemDescription ?? 'Package'}</Text>
          </View>
          {currentOrder.weightKg && (
            <Text style={styles.tripDistanceText}>{currentOrder.weightKg} kg</Text>
          )}
          {currentOrder.distanceKm && (
            <Text style={styles.tripDistanceText}>{currentOrder.distanceKm.toFixed(1)} km away</Text>
          )}

          {/* Fee highlight */}
          <Text style={styles.incomingFare}>₦{currentOrder.fee?.toFixed(0) ?? '0'}</Text>

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

  // ── Screen: R-3 Active Pickup ─────────────────────────────────────────────────
  if (screen === 'pickup' && currentOrder) {
    const distanceToPickup =
      myLat && myLng && currentOrder.pickupLat && currentOrder.pickupLng
        ? haversineKm(myLat, myLng, currentOrder.pickupLat, currentOrder.pickupLng) * 1000
        : Infinity;
    const closeEnough = distanceToPickup <= 200;

    return (
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          initialRegion={
            currentOrder.pickupLat && currentOrder.pickupLng
              ? {
                  latitude: currentOrder.pickupLat,
                  longitude: currentOrder.pickupLng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }
              : undefined
          }
        >
          {currentOrder.pickupLat && currentOrder.pickupLng && (
            <Marker
              coordinate={{ latitude: currentOrder.pickupLat, longitude: currentOrder.pickupLng }}
              pinColor={GOLD}
              title="Pickup"
            />
          )}
          {myLat && myLng && (
            <Marker coordinate={{ latitude: myLat, longitude: myLng }} pinColor={FOREST} title="You" />
          )}
        </MapView>

        <View style={styles.tripCard}>
          <Text style={styles.driverNameText}>{currentOrder.senderName ?? 'Sender'}</Text>
          <View style={styles.tripInfoRow}>
            <MapPin size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentOrder.pickupAddress ?? 'Pickup location'}</Text>
          </View>
          <View style={styles.tripInfoRow}>
            <Package size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentOrder.itemDescription ?? 'Package'}</Text>
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, !closeEnough && styles.ctaDisabled]}
            onPress={handleCollect}
            disabled={!closeEnough || loading}
          >
            {loading ? (
              <ActivityIndicator color={JUNGLE} />
            ) : (
              <Text style={styles.ctaText}>{closeEnough ? "I've Collected" : 'Approach pickup point'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Screen: R-4 Active Delivery (OTP + Photo) ────────────────────────────────
  if (screen === 'active' && currentOrder) {
    const distanceToDropoff =
      myLat && myLng && currentOrder.dropoffLat && currentOrder.dropoffLng
        ? haversineKm(myLat, myLng, currentOrder.dropoffLat, currentOrder.dropoffLng) * 1000
        : Infinity;
    const atDropoff = distanceToDropoff <= 200;
    const canConfirm = otpVerified && photoUri !== null;

    // Sub-state A: navigating to recipient
    if (!atDropoff) {
      return (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            provider={Platform.OS === 'android' ? 'google' : undefined}
            initialRegion={
              currentOrder.dropoffLat && currentOrder.dropoffLng
                ? {
                    latitude: currentOrder.dropoffLat,
                    longitude: currentOrder.dropoffLng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }
                : undefined
            }
          >
            {currentOrder.dropoffLat && currentOrder.dropoffLng && (
              <Marker
                coordinate={{ latitude: currentOrder.dropoffLat, longitude: currentOrder.dropoffLng }}
                pinColor={GOLD}
                title="Dropoff"
              />
            )}
            {myLat && myLng && (
              <Marker coordinate={{ latitude: myLat, longitude: myLng }} pinColor={FOREST} title="You" />
            )}
          </MapView>

          <View style={styles.tripCard}>
            <View style={styles.tripInfoRow}>
              <Navigation size={14} color={GOLD} />
              <Text style={styles.tripInfoText}>{currentOrder.dropoffAddress ?? 'Destination'}</Text>
            </View>
            <Text style={styles.fareReminder}>
              ₦{currentOrder.fee?.toFixed(0) ?? '0'} — your share: ₦{currentOrder.riderEarnings?.toFixed(0) ?? '0'}
            </Text>

            {/* Approach banner */}
            <View style={styles.approachBanner}>
              <Text style={styles.approachBannerText}>Approach recipient to enter OTP and upload proof</Text>
            </View>

            <TouchableOpacity style={[styles.ctaButton, { backgroundColor: GOLD }, styles.ctaDisabled]} disabled>
              <Text style={styles.ctaText}>Confirm Delivery</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Sub-state B: at recipient (distance <= 200m from dropoff)
    return (
      <View style={styles.mapContainer}>
        {/* Shrunk map */}
        <MapView
          style={styles.mapShrunk}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          initialRegion={
            currentOrder.dropoffLat && currentOrder.dropoffLng
              ? {
                  latitude: currentOrder.dropoffLat,
                  longitude: currentOrder.dropoffLng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }
              : undefined
          }
        >
          {currentOrder.dropoffLat && currentOrder.dropoffLng && (
            <Marker
              coordinate={{ latitude: currentOrder.dropoffLat, longitude: currentOrder.dropoffLng }}
              pinColor={GOLD}
              title="Dropoff"
            />
          )}
          {myLat && myLng && (
            <Marker coordinate={{ latitude: myLat, longitude: myLng }} pinColor={FOREST} title="You" />
          )}
        </MapView>

        {/* Content below shrunk map */}
        <ScrollView style={styles.activeDeliveryScroll} contentContainerStyle={styles.activeDeliveryContent}>
          <View style={styles.tripInfoRow}>
            <Navigation size={14} color={GOLD} />
            <Text style={styles.tripInfoText}>{currentOrder.dropoffAddress ?? 'Destination'}</Text>
          </View>
          <Text style={styles.fareReminder}>
            ₦{currentOrder.fee?.toFixed(0) ?? '0'} — your share: ₦{currentOrder.riderEarnings?.toFixed(0) ?? '0'}
          </Text>

          {/* OTP section */}
          <Text style={styles.sectionHeading}>Enter OTP from recipient</Text>
          <View style={styles.otpRow}>
            {otpCells.map((cell, index) => (
              <TextInput
                key={index}
                ref={(el) => { otpInputRefs.current[index] = el; }}
                style={[
                  styles.otpCell,
                  otpVerified
                    ? styles.otpCellVerified
                    : otpError
                    ? styles.otpCellError
                    : { borderColor: 'rgba(255,255,255,0.15)' },
                ]}
                value={cell}
                onChangeText={(value) => handleOtpChange(index, value)}
                onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                editable={!otpVerified}
                selectTextOnFocus
              />
            ))}
          </View>
          {otpError && (
            <Text style={styles.otpErrorText}>Incorrect OTP. Ask recipient to check their SMS.</Text>
          )}

          {/* Photo upload section */}
          <Text style={styles.sectionHeading}>Upload proof of delivery</Text>
          <TouchableOpacity
            style={[
              styles.photoUploadButton,
              { borderColor: photoUri ? '#22C55E' : 'rgba(255,255,255,0.15)' },
            ]}
            onPress={handlePickPhoto}
          >
            {photoUri ? (
              <View style={styles.photoPreviewContainer}>
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoThumbnail}
                  resizeMode="cover"
                />
                <View style={styles.photoCheckOverlay}>
                  <CheckCircle size={20} color="#22C55E" />
                </View>
              </View>
            ) : (
              <>
                <Camera size={20} color="rgba(255,255,255,0.4)" />
                <Text style={styles.photoUploadText}>Tap to take or upload photo</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Confirm Delivery CTA */}
          {creditBanner ? (
            <View style={styles.creditBanner}>
              <CheckCircle size={14} color="#22C55E" />
              <Text style={styles.creditBannerText}>{creditBanner}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.ctaButton, { backgroundColor: GOLD, marginTop: 16 }, !canConfirm && styles.ctaDisabled]}
              onPress={handleConfirmDelivery}
              disabled={!canConfirm || loading}
            >
              {loading ? (
                <ActivityIndicator color={JUNGLE} />
              ) : (
                <Text style={styles.ctaText}>Confirm Delivery</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Screen: R-5 Earnings Dashboard ──────────────────────────────────────────
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
                  <Package size={20} color={GOLD} />
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
                  <Text style={styles.statLabel}>Deliveries</Text>
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

              <Text style={[styles.tripInfoText, { marginBottom: 8, marginTop: 16 }]}>Delivery History</Text>
            </View>
          }
          data={earnings?.history ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            !earningsLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No deliveries completed {periodLabel}. Go online to start earning.
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
                <Text style={styles.historyShare}>Your share: ₦{item.riderEarnings?.toFixed(0) ?? '0'}</Text>
              </View>
              <Text style={styles.historyFare}>₦{item.fee?.toFixed(0) ?? '0'}</Text>
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
  mapShrunk: { height: 180 },
  activeDeliveryScroll: { flex: 1, backgroundColor: JUNGLE },
  activeDeliveryContent: { padding: 16, paddingBottom: 40 },
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
  approachBanner: {
    backgroundColor: 'rgba(200,150,42,0.1)',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  approachBannerText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
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
  sectionHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    marginBottom: 8,
  },
  otpRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  otpCell: {
    width: 48,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  otpCellVerified: { borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.15)' },
  otpCellError: { borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.15)' },
  otpErrorText: { fontSize: 13, color: '#DC2626', marginTop: 4, textAlign: 'center' },
  photoUploadButton: {
    height: 80,
    backgroundColor: 'rgba(26,107,60,0.2)',
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
  },
  photoUploadText: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  photoPreviewContainer: { flex: 1, width: '100%', height: '100%', position: 'relative' },
  photoThumbnail: { width: '100%', height: '100%', borderRadius: 10 },
  photoCheckOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(28,43,43,0.7)',
    borderRadius: 10,
    padding: 2,
  },
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
  historyShare: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  historyFare: { fontSize: 14, fontWeight: 'bold', color: GOLD },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyStateText: { fontSize: 14, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
});
