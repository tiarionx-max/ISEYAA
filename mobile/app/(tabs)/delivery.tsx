import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';
import MapView, { Marker, Region } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';
import {
  MapPin,
  Package,
  Star,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  Navigation,
} from 'lucide-react-native';

const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const WS_BASE = API_BASE.replace('/api/v1', '');

type Screen = 'home' | 'quote' | 'matching' | 'active' | 'complete';

interface FeeEstimate {
  baseFee: number;
  weightSurcharge: number;
  distanceKm: number;
  totalFee: number;
  weightKg: number;
  perKgRate: number;
}

interface DeliveryOrder {
  id: string;
  status: string;
  riderId?: string;
  riderName?: string;
  fee: number;
  recipientOtp?: string;
  proofPhotoUrl?: string;
}

export default function DeliveryScreen() {
  const [screen, setScreen] = useState<Screen>('home');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLat, setDropoffLat] = useState<number | null>(null);
  const [dropoffLng, setDropoffLng] = useState<number | null>(null);
  const [itemDescription, setItemDescription] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [riderLocation, setRiderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [orderExpired, setOrderExpired] = useState(false);
  const [rating, setRating] = useState(0);
  const [loading, setLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      socket.on('rider:assigned', (data: { order: DeliveryOrder }) => {
        setOrder(data.order);
        stopCountdown();
        setScreen('active');
      });

      socket.on('rider:location', (data: { lat: number; lng: number }) => {
        setRiderLocation({ lat: data.lat, lng: data.lng });
      });

      socket.on('delivery:expired', () => {
        stopCountdown();
        setOrderExpired(true);
      });

      socket.on('delivery:completed', () => {
        setScreen('complete');
      });
    })();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, []);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(60);
    setOrderExpired(false);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          stopCountdown();
          setOrderExpired(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [stopCountdown]);

  useEffect(() => {
    return () => stopCountdown();
  }, [stopCountdown]);

  // ── Location helper ──────────────────────────────────────────────────────────
  const fetchCurrentLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location required', 'Location access is required to request delivery. Enable it in Settings.');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setPickupLat(pos.coords.latitude);
    setPickupLng(pos.coords.longitude);
    setPickupAddress(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
  }, []);

  // ── API handlers ─────────────────────────────────────────────────────────────
  const handleGetFeeEstimate = useCallback(async () => {
    if (!pickupAddress || !dropoffAddress || !itemDescription || !weightKg) return;
    setLoading(true);
    try {
      // Get GPS for pickup
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location required', 'Location access is required. Enable it in Settings.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const pLat = pos.coords.latitude;
      const pLng = pos.coords.longitude;
      setPickupLat(pLat);
      setPickupLng(pLng);

      // MVP: dropoff coords = pickup + small offset (~5 km north-east)
      const dLat = pLat + 0.045;
      const dLng = pLng + 0.045;
      setDropoffLat(dLat);
      setDropoffLng(dLng);

      const { data } = await api.get('/delivery/fee-estimate', {
        params: {
          pickupLat: pLat,
          pickupLng: pLng,
          dropoffLat: dLat,
          dropoffLng: dLng,
          weightKg: parseFloat(weightKg),
        },
      });
      setFeeEstimate(data);
      setScreen('quote');
    } catch {
      Alert.alert('Error', 'Something went wrong. Your delivery request was not sent. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pickupAddress, dropoffAddress, itemDescription, weightKg]);

  const handleConfirmDelivery = useCallback(async () => {
    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng || !feeEstimate) return;
    setLoading(true);
    try {
      const { data } = await api.post('/delivery/orders', {
        pickupLat,
        pickupLng,
        pickupAddress,
        dropoffLat,
        dropoffLng,
        dropoffAddress,
        itemDescription,
        weightKg: parseFloat(weightKg),
      });
      setOrder(data);
      socketRef.current?.emit('join:delivery', data.id);
      setScreen('matching');
      startCountdown();
    } catch {
      Alert.alert('Error', 'Something went wrong. Your delivery request was not sent. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, itemDescription, weightKg, feeEstimate, startCountdown]);

  const handleCancelDelivery = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    try {
      await api.patch(`/delivery/orders/${order.id}/cancel`);
    } catch {
      // ignore — navigate home regardless
    } finally {
      setLoading(false);
      stopCountdown();
      setScreen('home');
      setOrder(null);
      setFeeEstimate(null);
      setRiderLocation(null);
      setOrderExpired(false);
    }
  }, [order, stopCountdown]);

  const handleCompleteDelivery = useCallback(async () => {
    if (!order || rating === 0) return;
    setLoading(true);
    try {
      await api.patch(`/delivery/orders/${order.id}/rate`, { rating });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      resetToHome();
    }
  }, [order, rating]);

  const resetToHome = useCallback(() => {
    stopCountdown();
    setScreen('home');
    setOrder(null);
    setFeeEstimate(null);
    setRiderLocation(null);
    setRating(0);
    setOrderExpired(false);
    setPickupAddress('');
    setPickupLat(null);
    setPickupLng(null);
    setDropoffAddress('');
    setDropoffLat(null);
    setDropoffLng(null);
    setItemDescription('');
    setWeightKg('');
  }, [stopCountdown]);

  // ── Render screens ───────────────────────────────────────────────────────────
  if (screen === 'home') {
    const canRequest = !!pickupAddress && !!dropoffAddress && !!itemDescription && !!weightKg;
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.homeContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Delivery</Text>

          {/* Pickup input */}
          <TouchableOpacity style={styles.locationRow} onPress={fetchCurrentLocation}>
            <MapPin size={16} color={GOLD} />
            <TextInput
              style={styles.locationInput}
              placeholder="Pickup address"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={pickupAddress}
              onChangeText={(v) => {
                setPickupAddress(v);
                setPickupLat(null);
                setPickupLng(null);
              }}
            />
          </TouchableOpacity>

          {/* Dropoff input */}
          <View style={styles.locationRow}>
            <Navigation size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.locationInput}
              placeholder="Dropoff address"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={dropoffAddress}
              onChangeText={(v) => {
                setDropoffAddress(v);
                setDropoffLat(null);
                setDropoffLng(null);
              }}
            />
          </View>

          {/* Item description input */}
          <View style={styles.locationRow}>
            <Package size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.locationInput}
              placeholder="Item description (e.g. documents, clothing)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={itemDescription}
              onChangeText={setItemDescription}
            />
          </View>

          {/* Weight input */}
          <View style={styles.locationRow}>
            <TextInput
              style={[styles.locationInput, { flex: 1 }]}
              placeholder="Estimated weight"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
            />
            <Text style={styles.weightSuffix}>kg</Text>
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, !canRequest && styles.ctaDisabled]}
            onPress={handleGetFeeEstimate}
            disabled={!canRequest || loading}
          >
            {loading ? (
              <ActivityIndicator color={JUNGLE} />
            ) : (
              <Text style={styles.ctaText}>Get Delivery Quote</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'quote' && feeEstimate) {
    const mapRegion: Region | undefined =
      pickupLat && pickupLng && dropoffLat && dropoffLng
        ? {
            latitude: (pickupLat + dropoffLat) / 2,
            longitude: (pickupLng + dropoffLng) / 2,
            latitudeDelta: Math.abs(pickupLat - dropoffLat) * 1.5 + 0.01,
            longitudeDelta: Math.abs(pickupLng - dropoffLng) * 1.5 + 0.01,
          }
        : undefined;

    return (
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          initialRegion={mapRegion}
          region={mapRegion}
        >
          {pickupLat && pickupLng && (
            <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }} pinColor={FOREST} title="Pickup" />
          )}
          {dropoffLat && dropoffLng && (
            <Marker coordinate={{ latitude: dropoffLat, longitude: dropoffLng }} pinColor={GOLD} title="Dropoff" />
          )}
        </MapView>

        {/* Quote card overlay */}
        <View style={styles.fareCard}>
          <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
            <ChevronLeft size={22} color="white" accessibilityLabel="Go back" />
          </TouchableOpacity>

          <Text style={styles.fareCardTitle}>Delivery Quote</Text>

          <View style={styles.quoteCard}>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Base fee</Text>
              <Text style={styles.fareValue}>₦{feeEstimate.baseFee.toFixed(0)}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Distance ({feeEstimate.distanceKm.toFixed(1)} km)</Text>
              <Text style={styles.fareValue}>₦{(feeEstimate.distanceKm * (feeEstimate.perKgRate ?? 0)).toFixed(0)}</Text>
            </View>
            {feeEstimate.weightSurcharge > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Weight surcharge ({feeEstimate.weightKg} kg)</Text>
                <Text style={styles.fareValue}>₦{feeEstimate.weightSurcharge.toFixed(0)}</Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.fareRow}>
              <Text style={[styles.fareLabel, { fontWeight: 'bold', color: 'white' }]}>Total</Text>
              <Text style={styles.fareTotalAmount}>₦{feeEstimate.totalFee.toFixed(0)}</Text>
            </View>
          </View>

          {/* Package summary row */}
          <View style={[styles.fareRow, { marginTop: 12 }]}>
            <Package size={14} color={GOLD} />
            <Text style={[styles.fareLabel, { marginLeft: 6 }]}>{itemDescription}</Text>
          </View>

          <TouchableOpacity style={styles.ctaButton} onPress={handleConfirmDelivery} disabled={loading}>
            {loading ? <ActivityIndicator color={JUNGLE} /> : <Text style={styles.ctaText}>Confirm Delivery</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'matching') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        {orderExpired ? (
          <>
            <AlertCircle size={48} color="rgba(255,255,255,0.4)" />
            <Text style={[styles.heading, { marginTop: 16, textAlign: 'center' }]}>No riders available</Text>
            <Text style={styles.matchingSubtext}>
              No rider accepted your request within 60 seconds. Please try again.
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={[styles.heading, { marginTop: 16, textAlign: 'center' }]}>Finding a rider...</Text>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.matchingSubtext}>seconds remaining</Text>
            <Text style={[styles.matchingSubtext, { marginTop: 4 }]}>Searching for available riders nearby</Text>
          </>
        )}

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={orderExpired ? resetToHome : handleCancelDelivery}
        >
          <Text style={styles.cancelButtonText}>{orderExpired ? 'Go Back' : 'Cancel Request'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (screen === 'active') {
    const riderRegion: Region | undefined =
      riderLocation && pickupLat && pickupLng
        ? {
            latitude: (riderLocation.lat + pickupLat) / 2,
            longitude: (riderLocation.lng + pickupLng) / 2,
            latitudeDelta: Math.abs(riderLocation.lat - pickupLat) * 2 + 0.01,
            longitudeDelta: Math.abs(riderLocation.lng - pickupLng) * 2 + 0.01,
          }
        : undefined;

    // Determine active delivery stage from order status
    const statusStages = ['Picking Up', 'In Transit', 'Delivered'];
    const activeStageIndex =
      order?.status === 'COLLECTING' ? 0 : order?.status === 'IN_TRANSIT' ? 1 : order?.status === 'DELIVERED' ? 2 : 0;

    return (
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          region={riderRegion}
        >
          {pickupLat && pickupLng && (
            <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }} pinColor={GOLD} title="You" />
          )}
          {riderLocation && (
            <Marker
              coordinate={{ latitude: riderLocation.lat, longitude: riderLocation.lng }}
              pinColor={FOREST}
              title="Rider"
            />
          )}
        </MapView>

        {/* Delivery info card overlay */}
        <View style={styles.tripCard}>
          {/* Rider avatar + name + ETA chip */}
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>{order?.riderName?.charAt(0) ?? 'R'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.driverName}>{order?.riderName ?? 'Your Rider'}</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingText}>Delivery in progress</Text>
              </View>
            </View>
            <View style={styles.etaChip}>
              <Text style={styles.etaText}>~{riderLocation ? '5' : '—'} min</Text>
            </View>
          </View>

          {/* Delivery status stages */}
          <View style={styles.stageRow}>
            {statusStages.map((stage, idx) => (
              <Text
                key={stage}
                style={[
                  styles.stageText,
                  idx === activeStageIndex && styles.stageTextActive,
                ]}
              >
                {stage}{idx < statusStages.length - 1 ? ' › ' : ''}
              </Text>
            ))}
          </View>

          {/* OTP display box — sender shares this code with recipient */}
          <View style={styles.otpBox}>
            <Text style={styles.otpLabel}>Share this code with recipient</Text>
            <Text style={styles.otpValue}>{order?.recipientOtp ?? '------'}</Text>
          </View>

          {/* Cancel text button */}
          <TouchableOpacity
            style={styles.cancelTextButton}
            onPress={() =>
              Alert.alert(
                'Cancel this delivery?',
                'The rider may already be en route to pick up your parcel.',
                [
                  { text: 'Keep Delivery', style: 'cancel' },
                  { text: 'Yes, Cancel', style: 'destructive', onPress: handleCancelDelivery },
                ]
              )
            }
          >
            <Text style={styles.cancelTextButtonLabel}>Cancel delivery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'complete') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.completeContent}>
          <CheckCircle size={64} color="#22C55E" style={{ marginBottom: 16 }} />
          <Text style={[styles.heading, { textAlign: 'center' }]}>Delivered!</Text>

          <Text style={[styles.fareTotalAmount, { fontSize: 48, marginBottom: 16 }]}>
            ₦{order?.fee?.toFixed(0) ?? '0'}
          </Text>

          <View style={[styles.fareRow, { marginTop: 8 }]}>
            <Text style={styles.fareLabel}>Pickup</Text>
            <Text style={styles.fareValue}>{pickupAddress || '—'}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Dropoff</Text>
            <Text style={styles.fareValue}>{dropoffAddress || '—'}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Item</Text>
            <Text style={styles.fareValue}>{itemDescription || '—'}</Text>
          </View>
          {feeEstimate && (
            <>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Weight</Text>
                <Text style={styles.fareValue}>{feeEstimate.weightKg} kg</Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Distance</Text>
                <Text style={styles.fareValue}>{feeEstimate.distanceKm.toFixed(1)} km</Text>
              </View>
            </>
          )}

          <View style={styles.divider} />

          {/* Proof photo thumbnail */}
          {order?.proofPhotoUrl && (
            <View style={{ width: '100%', marginBottom: 16 }}>
              <Text style={styles.proofLabel}>Proof of delivery</Text>
              <Image
                source={{ uri: order.proofPhotoUrl }}
                style={styles.proofPhoto}
                resizeMode="cover"
              />
            </View>
          )}

          <Text style={[styles.fareLabel, { marginBottom: 8 }]}>Rate your rider</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)}>
                <Star
                  size={32}
                  color={GOLD}
                  fill={n <= rating ? GOLD : 'transparent'}
                  style={{ marginHorizontal: 4 }}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, rating === 0 && styles.ctaDisabled, { marginTop: 24 }]}
            onPress={handleCompleteDelivery}
            disabled={rating === 0 || loading}
          >
            {loading ? <ActivityIndicator color={JUNGLE} /> : <Text style={styles.ctaText}>Done</Text>}
          </TouchableOpacity>
        </ScrollView>
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
  homeContent: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 16 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  locationInput: { flex: 1, color: 'white', fontSize: 14 },
  weightSuffix: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  ctaButton: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontSize: 14, fontWeight: 'bold', color: JUNGLE },
  fareCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: JUNGLE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 280,
  },
  quoteCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 8,
  },
  fareCardTitle: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 12, marginTop: 8 },
  backButton: { position: 'absolute', top: 16, left: 16 },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    alignItems: 'center',
  },
  fareLabel: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  fareValue: { fontSize: 14, color: 'white' },
  fareTotalAmount: { fontSize: 24, fontWeight: 'bold', color: GOLD },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 12 },
  countdownText: { fontSize: 48, fontWeight: 'bold', color: GOLD, marginTop: 8 },
  matchingSubtext: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 4 },
  cancelButton: {
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 24,
  },
  cancelButtonText: { fontSize: 14, fontWeight: 'bold', color: '#DC2626' },
  tripCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: JUNGLE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    height: 240,
  },
  driverRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(26,107,60,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: { fontSize: 24, fontWeight: 'bold', color: GOLD },
  driverName: { fontSize: 14, fontWeight: 'bold', color: 'white' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  etaChip: {
    backgroundColor: 'rgba(200,150,42,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  etaText: { fontSize: 13, fontWeight: 'bold', color: GOLD },
  stageRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  stageText: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  stageTextActive: { fontWeight: 'bold', color: GOLD },
  otpBox: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  otpLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  otpValue: { fontSize: 24, fontWeight: 'bold', color: GOLD, letterSpacing: 8 },
  cancelTextButton: { alignItems: 'center', marginTop: 8 },
  cancelTextButtonLabel: { fontSize: 13, color: 'rgba(220,38,38,0.8)' },
  completeContent: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  proofLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  proofPhoto: { width: '100%', height: 160, borderRadius: 12 },
  starRow: { flexDirection: 'row', marginTop: 8, marginBottom: 8 },
});
