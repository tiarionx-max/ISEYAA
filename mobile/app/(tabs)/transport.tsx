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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';
import {
  MapPin,
  Car,
  Bike,
  Truck,
  Bus,
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

type Screen = 'home' | 'estimate' | 'matching' | 'active' | 'complete';
type VehicleType = 'BIKE' | 'TRICYCLE' | 'CAR' | 'MINIBUS';

interface FareEstimate {
  baseFare: number;
  distanceKm: number;
  perKmFare: number;
  surgeMultiplier: number;
  totalFare: number;
}

interface DriverInfo {
  id?: string;
  name?: string;
  rating?: number;
}

interface Trip {
  id: string;
  fare: number;
  driverEarnings?: number;
  pickupAddress?: string;
  dropoffAddress?: string;
}

const VEHICLE_ICONS: Record<VehicleType, JSX.Element> = {
  BIKE: <Bike size={28} color={GOLD} />,
  TRICYCLE: <Truck size={28} color={GOLD} />,
  CAR: <Car size={28} color={GOLD} />,
  MINIBUS: <Bus size={28} color={GOLD} />,
};

export default function TransportScreen() {
  const [screen, setScreen] = useState<Screen>('home');
  const [vehicleType, setVehicleType] = useState<VehicleType>('CAR');
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffLat, setDropoffLat] = useState<number | null>(null);
  const [dropoffLng, setDropoffLng] = useState<number | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [tripExpired, setTripExpired] = useState(false);
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

      socket.on('driver:matched', (data: { driver: DriverInfo; trip: Trip }) => {
        setDriver(data.driver);
        setTrip(data.trip);
        stopCountdown();
        setScreen('active');
      });

      socket.on('driver:location', (data: { lat: number; lng: number }) => {
        setDriverLocation(data);
      });

      socket.on('trip:expired', () => {
        setTripExpired(true);
        stopCountdown();
      });

      socket.on('trip:completed', () => {
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
    setTripExpired(false);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          stopCountdown();
          setTripExpired(true);
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
      Alert.alert('Location required', 'Location access is required to request a ride. Enable it in Settings.');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setPickupLat(pos.coords.latitude);
    setPickupLng(pos.coords.longitude);
    setPickupAddress(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
  }, []);

  // ── API handlers ─────────────────────────────────────────────────────────────
  const handleGetFareEstimate = useCallback(async () => {
    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) return;
    setLoading(true);
    try {
      const { data } = await api.get('/transport/fare-estimate', {
        params: { vehicleType, pickupLat, pickupLng, dropoffLat, dropoffLng },
      });
      setFareEstimate(data);
      setScreen('estimate');
    } catch {
      Alert.alert('Error', 'Something went wrong. Your ride request was not sent. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType]);

  const handleConfirmRide = useCallback(async () => {
    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) return;
    setLoading(true);
    try {
      const { data } = await api.post('/transport/trips', {
        pickupLat, pickupLng, pickupAddress,
        dropoffLat, dropoffLng, dropoffAddress,
        vehicleType,
      });
      setTrip(data);
      socketRef.current?.emit('join:trip', data.id);
      setScreen('matching');
      startCountdown();
    } catch {
      Alert.alert('Error', 'Something went wrong. Your ride request was not sent. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, vehicleType, startCountdown]);

  const handleCancelRide = useCallback(async () => {
    if (!trip) return;
    setLoading(true);
    try {
      await api.patch(`/transport/trips/${trip.id}/cancel`);
    } catch {
      // ignore — navigate home regardless
    } finally {
      setLoading(false);
      stopCountdown();
      setScreen('home');
      setTrip(null);
      setDriver(null);
      setFareEstimate(null);
    }
  }, [trip, stopCountdown]);

  const handleCompleteTrip = useCallback(async () => {
    if (!trip || rating === 0) return;
    setLoading(true);
    try {
      await api.patch(`/transport/trips/${trip.id}/complete`, { driverRating: rating });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setScreen('home');
      setTrip(null);
      setDriver(null);
      setFareEstimate(null);
      setDriverLocation(null);
      setRating(0);
    }
  }, [trip, rating]);

  const resetToHome = useCallback(() => {
    stopCountdown();
    setScreen('home');
    setTrip(null);
    setDriver(null);
    setFareEstimate(null);
    setDriverLocation(null);
    setRating(0);
    setTripExpired(false);
  }, [stopCountdown]);

  // ── Render screens ───────────────────────────────────────────────────────────
  if (screen === 'home') {
    const canRequest = !!pickupLat && !!pickupLng && !!dropoffLat && !!dropoffLng;
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.homeContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Transport</Text>

          {/* Surge banner */}
          {fareEstimate && fareEstimate.surgeMultiplier > 1.0 && (
            <View style={styles.surgeBanner}>
              <Text style={styles.surgeBannerText}>
                Surge pricing active — {fareEstimate.surgeMultiplier}× fare
              </Text>
            </View>
          )}

          {/* Vehicle type selector */}
          <View style={styles.vehicleRow}>
            {(['BIKE', 'TRICYCLE', 'CAR', 'MINIBUS'] as VehicleType[]).map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.vehicleCard, vehicleType === v && styles.vehicleCardSelected]}
                onPress={() => setVehicleType(v)}
              >
                {VEHICLE_ICONS[v]}
                <Text style={styles.vehicleLabel}>{v === 'TRICYCLE' ? 'Keke' : v.charAt(0) + v.slice(1).toLowerCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Pickup input */}
          <TouchableOpacity style={styles.locationRow} onPress={fetchCurrentLocation}>
            <MapPin size={16} color={GOLD} />
            <TextInput
              style={styles.locationInput}
              placeholder="Enter pickup location"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={pickupAddress}
              onChangeText={(v) => { setPickupAddress(v); setPickupLat(null); setPickupLng(null); }}
            />
          </TouchableOpacity>

          {/* Dropoff input */}
          <View style={styles.locationRow}>
            <Navigation size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.locationInput}
              placeholder="Enter destination"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={dropoffAddress}
              onChangeText={(v) => {
                setDropoffAddress(v);
                // Simple: require numeric coords typed as "lat,lng"
                const parts = v.split(',');
                if (parts.length === 2) {
                  const lat = parseFloat(parts[0]);
                  const lng = parseFloat(parts[1]);
                  if (!isNaN(lat) && !isNaN(lng)) { setDropoffLat(lat); setDropoffLng(lng); }
                }
              }}
            />
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, !canRequest && styles.ctaDisabled]}
            onPress={handleGetFareEstimate}
            disabled={!canRequest || loading}
          >
            {loading ? (
              <ActivityIndicator color={JUNGLE} />
            ) : (
              <Text style={styles.ctaText}>Get Fare Estimate</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'estimate' && fareEstimate) {
    const mapRegion: Region | undefined = pickupLat && pickupLng && dropoffLat && dropoffLng
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
          {pickupLat && pickupLng && dropoffLat && dropoffLng && (
            <Polyline
              coordinates={[
                { latitude: pickupLat, longitude: pickupLng },
                { latitude: dropoffLat, longitude: dropoffLng },
              ]}
              strokeColor={GOLD}
              strokeWidth={3}
            />
          )}
        </MapView>

        {/* Fare card overlay */}
        <View style={styles.fareCard}>
          <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
            <ChevronLeft size={22} color="white" accessibilityLabel="Go back" />
          </TouchableOpacity>

          <Text style={styles.fareCardTitle}>Fare Estimate</Text>

          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Base fare</Text>
            <Text style={styles.fareValue}>₦{fareEstimate.baseFare.toFixed(0)}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Distance ({fareEstimate.distanceKm.toFixed(1)} km)</Text>
            <Text style={styles.fareValue}>₦{(fareEstimate.distanceKm * fareEstimate.perKmFare).toFixed(0)}</Text>
          </View>
          {fareEstimate.surgeMultiplier > 1.0 && (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Surge (×{fareEstimate.surgeMultiplier})</Text>
              <Text style={styles.fareValue}>included</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.fareRow}>
            <Text style={[styles.fareLabel, { fontWeight: 'bold', color: 'white' }]}>Total</Text>
            <Text style={styles.fareTotalAmount}>₦{fareEstimate.totalFare.toFixed(0)}</Text>
          </View>

          <TouchableOpacity style={styles.ctaButton} onPress={handleConfirmRide} disabled={loading}>
            {loading ? <ActivityIndicator color={JUNGLE} /> : <Text style={styles.ctaText}>Confirm Ride</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'matching') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        {tripExpired ? (
          <>
            <AlertCircle size={48} color="rgba(255,255,255,0.4)" />
            <Text style={[styles.heading, { marginTop: 16, textAlign: 'center' }]}>No drivers nearby</Text>
            <Text style={styles.matchingSubtext}>
              No driver accepted your request within 60 seconds. Please try again.
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={[styles.heading, { marginTop: 16, textAlign: 'center' }]}>Finding your driver...</Text>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.matchingSubtext}>seconds remaining</Text>
            <Text style={[styles.matchingSubtext, { marginTop: 4 }]}>Searching within 5 km of your location</Text>
          </>
        )}

        <TouchableOpacity style={styles.cancelButton} onPress={tripExpired ? resetToHome : handleCancelRide}>
          <Text style={styles.cancelButtonText}>{tripExpired ? 'Go Back' : 'Cancel Request'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (screen === 'active') {
    const driverRegion: Region | undefined = driverLocation && pickupLat && pickupLng
      ? {
          latitude: (driverLocation.lat + pickupLat) / 2,
          longitude: (driverLocation.lng + pickupLng) / 2,
          latitudeDelta: Math.abs(driverLocation.lat - pickupLat) * 2 + 0.01,
          longitudeDelta: Math.abs(driverLocation.lng - pickupLng) * 2 + 0.01,
        }
      : undefined;

    return (
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          region={driverRegion}
        >
          {pickupLat && pickupLng && (
            <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }} pinColor={GOLD} title="You" />
          )}
          {driverLocation && (
            <Marker coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }} pinColor={FOREST} title="Driver" />
          )}
        </MapView>

        {/* Trip info card overlay */}
        <View style={styles.tripCard}>
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>{driver?.name?.charAt(0) ?? 'D'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.driverName}>{driver?.name ?? 'Your Driver'}</Text>
              <View style={styles.ratingRow}>
                <Star size={14} color={GOLD} fill={GOLD} />
                <Text style={styles.ratingText}>{driver?.rating?.toFixed(1) ?? '—'}</Text>
              </View>
            </View>
            <View style={styles.etaChip}>
              <Text style={styles.etaText}>~{driverLocation ? '2' : '—'} min away</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.cancelTextButton}
            onPress={() =>
              Alert.alert(
                'Cancel this ride?',
                'You may be charged a cancellation fee if the driver has already arrived.',
                [
                  { text: 'Keep Ride', style: 'cancel' },
                  { text: 'Yes, Cancel', style: 'destructive', onPress: handleCancelRide },
                ]
              )
            }
          >
            <Text style={styles.cancelTextButtonLabel}>Cancel trip</Text>
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
          <Text style={[styles.heading, { textAlign: 'center' }]}>Trip Complete</Text>

          <Text style={styles.fareTotalAmount}>
            ₦{trip?.fare?.toFixed(0) ?? '0'}
          </Text>

          <View style={[styles.fareRow, { marginTop: 16 }]}>
            <Text style={styles.fareLabel}>Pickup</Text>
            <Text style={styles.fareValue}>{pickupAddress || '—'}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Dropoff</Text>
            <Text style={styles.fareValue}>{dropoffAddress || '—'}</Text>
          </View>
          {fareEstimate && (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Distance</Text>
              <Text style={styles.fareValue}>{fareEstimate.distanceKm.toFixed(1)} km</Text>
            </View>
          )}

          <View style={styles.divider} />

          <Text style={[styles.fareLabel, { marginBottom: 8 }]}>Rate your driver</Text>
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
            onPress={handleCompleteTrip}
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
  surgeBanner: {
    backgroundColor: GOLD,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  surgeBannerText: { fontSize: 13, fontWeight: 'bold', color: JUNGLE },
  vehicleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  vehicleCard: {
    width: 76,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 4,
  },
  vehicleCardSelected: { borderColor: GOLD },
  vehicleLabel: { fontSize: 13, color: 'white', fontWeight: 'bold' },
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
    minHeight: 220,
  },
  fareCardTitle: { fontSize: 14, fontWeight: 'bold', color: 'white', marginBottom: 12, marginTop: 8 },
  backButton: { position: 'absolute', top: 16, left: 16 },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    height: 200,
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
  cancelTextButton: { alignItems: 'center', marginTop: 8 },
  cancelTextButtonLabel: { fontSize: 13, color: 'rgba(220,38,38,0.8)' },
  completeContent: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  starRow: { flexDirection: 'row', marginTop: 8, marginBottom: 8 },
});
