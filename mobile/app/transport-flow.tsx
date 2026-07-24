import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Car, Bus, MapPin, X, Navigation } from 'lucide-react-native';
import type { Socket } from 'socket.io-client';
import { api, fetcher, getErrorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { LocationPicker, type PickedLocation } from '../components/LocationPicker';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_ELEV,
  GOLD,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  BORDER,
  BORDER_MID,
  SUCCESS_TEXT,
  ERROR_TEXT,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────

type VehicleType = 'BIKE' | 'TRICYCLE' | 'CAR' | 'MINIBUS';

const VEHICLES: { type: VehicleType; label: string; Icon: typeof Car }[] = [
  { type: 'BIKE', label: 'Bike', Icon: Bike },
  { type: 'TRICYCLE', label: 'Tricycle', Icon: Car },
  { type: 'CAR', label: 'Car', Icon: Car },
  { type: 'MINIBUS', label: 'Minibus', Icon: Bus },
];

type Stage = 'form' | 'searching' | 'matched' | 'arrived' | 'in_progress' | 'completed' | 'ended';

function fmtNGN(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

const TRIP_STATUS_TO_STAGE: Record<string, Stage> = {
  SEARCHING: 'searching',
  MATCHED: 'matched',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'ended',
  EXPIRED: 'ended',
};

export default function TransportFlowScreen() {
  const { tripId: resumeTripId } = useLocalSearchParams<{ tripId?: string }>();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const [pickup, setPickup] = useState<PickedLocation | null>(null);
  const [dropoff, setDropoff] = useState<PickedLocation | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType>('CAR');
  const [pickingField, setPickingField] = useState<'pickup' | 'dropoff' | null>(null);

  const [stage, setStage] = useState<Stage>(resumeTripId ? 'searching' : 'form');
  const [tripId, setTripId] = useState<string | null>(resumeTripId ?? null);
  const [endedMessage, setEndedMessage] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [completedFare, setCompletedFare] = useState<number | null>(null);

  const canRequest = !!pickup && !!dropoff;

  const { data: fareData, isFetching: fareLoading } = useQuery({
    queryKey: ['fare-estimate', pickup, dropoff, vehicleType],
    queryFn: () =>
      fetcher(
        `/transport/fare-estimate?vehicleType=${vehicleType}&pickupLat=${pickup!.lat}&pickupLng=${pickup!.lng}&dropoffLat=${dropoff!.lat}&dropoffLng=${dropoff!.lng}`,
      ),
    enabled: canRequest,
  });

  const requestMutation = useMutation({
    mutationFn: () =>
      api
        .post('/transport/trips', {
          pickupLat: pickup!.lat,
          pickupLng: pickup!.lng,
          pickupAddress: pickup!.address,
          dropoffLat: dropoff!.lat,
          dropoffLng: dropoff!.lng,
          dropoffAddress: dropoff!.address,
          vehicleType,
        })
        .then((r) => r.data),
    onSuccess: async (trip: any) => {
      setTripId(trip.id);
      setStage('searching');
      try {
        const socket = await getSocket();
        socketRef.current = socket;
        socket.emit('join:trip', trip.id);
        attachTripListeners(socket);
      } catch {
        Alert.alert('Connection issue', 'Could not connect for live updates — pull to refresh trip status.');
      }
    },
    onError: (err: any) => {
      Alert.alert('Could not request ride', getErrorMessage(err, 'Please try again.'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/transport/trips/${tripId}/cancel`),
    onSuccess: () => {
      setStage('ended');
      setEndedMessage('Ride cancelled.');
    },
    onError: (err: any) => {
      Alert.alert('Could not cancel', getErrorMessage(err, 'Please try again.'));
    },
  });

  function attachTripListeners(socket: Socket) {
    socket.on('driver:matched', (payload: { driver: any; trip: any }) => {
      setDriverInfo(payload.driver);
      setStage('matched');
    });
    socket.on('driver:arrived', () => setStage('arrived'));
    socket.on('trip:started', () => setStage('in_progress'));
    socket.on('trip:completed', (payload: { driverEarnings: number }) => {
      setCompletedFare(payload?.driverEarnings ?? null);
      setStage('completed');
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    });
    socket.on('trip:cancelled', () => {
      setStage('ended');
      setEndedMessage('The driver cancelled this ride.');
    });
    socket.on('trip:expired', () => {
      setStage('ended');
      setEndedMessage('No driver was found nearby. Please try again.');
    });
    socket.on('driver:location', (payload: { lat: number; lng: number }) => {
      setDriverLocation({ lat: payload.lat, lng: payload.lng });
    });
  }

  // Resume an in-progress trip (e.g. reopened from rider-dashboard) — hydrate real
  // status from /transport/trips/me (no single-trip GET endpoint exists) then attach
  // listeners for further live updates.
  useEffect(() => {
    if (!resumeTripId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher('/transport/trips/me');
        const trips: any[] = res?.data ?? res ?? [];
        const trip = trips.find((t) => t.id === resumeTripId);
        if (cancelled) return;
        if (trip) {
          setStage(TRIP_STATUS_TO_STAGE[trip.status] ?? 'ended');
          if (trip.driver) setDriverInfo(trip.driver);
          if (trip.status === 'CANCELLED') setEndedMessage('This ride was cancelled.');
          if (trip.status === 'EXPIRED') setEndedMessage('No driver was found for this ride.');
        }
        const socket = await getSocket();
        if (cancelled) return;
        socketRef.current = socket;
        socket.emit('join:trip', resumeTripId);
        attachTripListeners(socket);
      } catch {
        if (!cancelled) {
          Alert.alert('Could not load ride', 'Please try again from My Rides.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeTripId]);

  useEffect(() => {
    return () => {
      const socket = socketRef.current;
      if (socket) {
        socket.off('driver:matched');
        socket.off('driver:arrived');
        socket.off('trip:started');
        socket.off('trip:completed');
        socket.off('trip:cancelled');
        socket.off('trip:expired');
        socket.off('driver:location');
      }
    };
  }, []);

  function resetToForm() {
    setStage('form');
    setTripId(null);
    setDriverInfo(null);
    setDriverLocation(null);
    setCompletedFare(null);
    setEndedMessage(null);
  }

  const fare = fareData ? Number(fareData.fare ?? fareData.total ?? 0) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button">
          <X size={18} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request a ride</Text>
      </View>

      {stage === 'form' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity style={styles.locationRow} onPress={() => setPickingField('pickup')} activeOpacity={0.8}>
            <View style={[styles.locationDot, { backgroundColor: SUCCESS_TEXT }]} />
            <Text style={styles.locationLabel} numberOfLines={1}>
              {pickup?.address ?? 'Set pickup location'}
            </Text>
          </TouchableOpacity>
          <View style={styles.locationDivider} />
          <TouchableOpacity style={styles.locationRow} onPress={() => setPickingField('dropoff')} activeOpacity={0.8}>
            <View style={[styles.locationDot, { backgroundColor: GOLD }]} />
            <Text style={styles.locationLabel} numberOfLines={1}>
              {dropoff?.address ?? 'Set destination'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>VEHICLE</Text>
          <View style={styles.vehicleRow}>
            {VEHICLES.map(({ type, label, Icon }) => {
              const active = vehicleType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.vehicleCard, active && styles.vehicleCardActive]}
                  onPress={() => setVehicleType(type)}
                  activeOpacity={0.8}
                >
                  <Icon size={20} color={active ? '#050E0E' : GOLD} />
                  <Text style={[styles.vehicleLabel, active && styles.vehicleLabelActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {canRequest && (
            <View style={styles.fareBox}>
              {fareLoading ? (
                <ActivityIndicator color={GOLD} />
              ) : fare != null ? (
                <>
                  <Text style={styles.fareLabel}>ESTIMATED FARE</Text>
                  <Text style={styles.fareValue}>{fmtNGN(fare)}</Text>
                </>
              ) : (
                <Text style={styles.fareLabel}>Could not estimate fare</Text>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.ctaBtn, (!canRequest || requestMutation.isPending) && styles.ctaBtnDisabled]}
            onPress={() => requestMutation.mutate()}
            disabled={!canRequest || requestMutation.isPending}
            activeOpacity={0.85}
          >
            {requestMutation.isPending ? (
              <ActivityIndicator color="#050E0E" />
            ) : (
              <Text style={styles.ctaBtnText}>Request ride</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {(stage === 'searching' || stage === 'matched' || stage === 'arrived' || stage === 'in_progress') && (
        <View style={styles.statusScreen}>
          {stage === 'searching' && (
            <>
              <ActivityIndicator color={GOLD} size="large" />
              <Text style={styles.statusTitle}>Finding you a driver…</Text>
              <Text style={styles.statusSub}>This usually takes under a minute.</Text>
            </>
          )}
          {stage === 'matched' && (
            <>
              <Navigation size={40} color={GOLD} />
              <Text style={styles.statusTitle}>Driver is on the way</Text>
              {driverInfo?.licenceNumber && (
                <Text style={styles.statusSub}>Licence {driverInfo.licenceNumber}</Text>
              )}
              {driverLocation && (
                <Text style={styles.statusSub}>
                  Driver location: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                </Text>
              )}
            </>
          )}
          {stage === 'arrived' && (
            <>
              <MapPin size={40} color={GOLD} />
              <Text style={styles.statusTitle}>Your driver has arrived</Text>
              <Text style={styles.statusSub}>Head to the pickup point.</Text>
            </>
          )}
          {stage === 'in_progress' && (
            <>
              <Car size={40} color={GOLD} />
              <Text style={styles.statusTitle}>Trip in progress</Text>
              <Text style={styles.statusSub}>Enjoy your ride.</Text>
            </>
          )}

          {(stage === 'searching' || stage === 'matched') && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel ride'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {stage === 'completed' && (
        <View style={styles.statusScreen}>
          <Text style={styles.statusTitle}>Trip completed</Text>
          {completedFare != null && (
            <Text style={styles.statusSub}>Fare charged: {fmtNGN(completedFare)}</Text>
          )}
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'ended' && (
        <View style={styles.statusScreen}>
          <Text style={[styles.statusTitle, { color: ERROR_TEXT }]}>{endedMessage}</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={resetToForm} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      <LocationPicker
        visible={pickingField !== null}
        title={pickingField === 'pickup' ? 'Set pickup location' : 'Set destination'}
        onSelect={(loc) => {
          if (pickingField === 'pickup') setPickup(loc);
          else setDropoff(loc);
          setPickingField(null);
        }}
        onClose={() => setPickingField(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: SURFACE_MID,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: FONT_DISPLAY, fontSize: 20, color: CREAM },
  scroll: { padding: 20, gap: 4 },

  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, padding: 14,
  },
  locationDot: { width: 10, height: 10, borderRadius: 5 },
  locationLabel: { flex: 1, fontSize: 14, color: INK, fontWeight: '600' },
  locationDivider: { width: 1, height: 14, backgroundColor: BORDER_MID, marginLeft: 24 },

  sectionLabel: {
    fontFamily: FONT_MONO, fontSize: 10, fontWeight: '600', letterSpacing: 1.6,
    color: GOLD, textTransform: 'uppercase', marginTop: 24, marginBottom: 10,
  },
  vehicleRow: { flexDirection: 'row', gap: 8 },
  vehicleCard: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER, borderRadius: 14,
  },
  vehicleCardActive: { backgroundColor: GOLD, borderColor: GOLD },
  vehicleLabel: { fontSize: 11, fontWeight: '600', color: INK_MID },
  vehicleLabelActive: { color: '#050E0E' },

  fareBox: {
    marginTop: 24, alignItems: 'center', backgroundColor: SURFACE_ELEV,
    borderWidth: 1, borderColor: GOLD_LINE, borderRadius: 14, padding: 18, gap: 4,
  },
  fareLabel: { fontFamily: FONT_MONO, fontSize: 10, color: INK_MID, letterSpacing: 1.4 },
  fareValue: { fontFamily: FONT_DISPLAY, fontSize: 30, color: GOLD },

  ctaBtn: {
    marginTop: 28, height: 52, borderRadius: 14, backgroundColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnDisabled: { opacity: 0.45 },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#050E0E' },

  statusScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  statusTitle: { fontFamily: FONT_DISPLAY, fontSize: 22, color: CREAM, textAlign: 'center' },
  statusSub: { fontSize: 13, color: INK_MID, textAlign: 'center' },
  cancelBtn: {
    marginTop: 24, borderWidth: 1, borderColor: GOLD_LINE, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: GOLD },
});
