import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, X, Truck, CheckCircle2 } from 'lucide-react-native';
import type { Socket } from 'socket.io-client';
import { api, fetcher } from '../lib/api';
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
  INK_FAINT,
  BORDER,
  BORDER_MID,
  SUCCESS_TEXT,
  ERROR_TEXT,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────

type Stage = 'form' | 'searching' | 'matched' | 'collecting' | 'in_transit' | 'delivered' | 'ended';

function fmtNGN(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

const NG_PHONE_RE = /^(\+234|0)\d{10}$/;

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function DeliveryFlowScreen() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const [pickup, setPickup] = useState<PickedLocation | null>(null);
  const [dropoff, setDropoff] = useState<PickedLocation | null>(null);
  const [pickingField, setPickingField] = useState<'pickup' | 'dropoff' | null>(null);
  const [itemDescription, setItemDescription] = useState('');
  const [weightKg, setWeightKg] = useState('1');
  const [recipientPhone, setRecipientPhone] = useState('');

  const [stage, setStage] = useState<Stage>('form');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [endedMessage, setEndedMessage] = useState<string | null>(null);
  const [riderInfo, setRiderInfo] = useState<any>(null);
  const [riderLocation, setRiderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [completedEarnings, setCompletedEarnings] = useState<number | null>(null);

  const numericWeight = parseFloat(weightKg) || 0;
  const validPhone = NG_PHONE_RE.test(recipientPhone.trim());
  const canRequest =
    !!pickup && !!dropoff && itemDescription.trim().length > 0 &&
    numericWeight >= 0.1 && numericWeight <= 500 && validPhone;

  const { data: feeData, isFetching: feeLoading } = useQuery({
    queryKey: ['fee-estimate', pickup, dropoff, numericWeight],
    queryFn: () =>
      fetcher(
        `/delivery/fee-estimate?pickupLat=${pickup!.lat}&pickupLng=${pickup!.lng}&dropoffLat=${dropoff!.lat}&dropoffLng=${dropoff!.lng}&weightKg=${numericWeight}`,
      ),
    enabled: !!pickup && !!dropoff && numericWeight >= 0.1,
  });

  const requestMutation = useMutation({
    mutationFn: () =>
      api
        .post('/delivery/orders', {
          pickupLat: pickup!.lat,
          pickupLng: pickup!.lng,
          pickupAddress: pickup!.address,
          dropoffLat: dropoff!.lat,
          dropoffLng: dropoff!.lng,
          dropoffAddress: dropoff!.address,
          itemDescription: itemDescription.trim(),
          weightKg: numericWeight,
          recipientPhone: recipientPhone.trim(),
        })
        .then((r) => r.data),
    onSuccess: async (order: any) => {
      setOrderId(order.id);
      setStage('searching');
      try {
        const socket = await getSocket();
        socketRef.current = socket;
        socket.emit('join:delivery', order.id);
        attachOrderListeners(socket);
      } catch {
        Alert.alert('Connection issue', 'Could not connect for live updates — pull to refresh order status.');
      }
    },
    onError: (err: any) => {
      Alert.alert('Could not request delivery', err?.response?.data?.message ?? 'Please try again.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/delivery/orders/${orderId}/cancel`),
    onSuccess: () => {
      setStage('ended');
      setEndedMessage('Delivery cancelled.');
    },
    onError: (err: any) => {
      Alert.alert('Could not cancel', err?.response?.data?.message ?? 'Please try again.');
    },
  });

  function attachOrderListeners(socket: Socket) {
    socket.on('rider:assigned', (payload: { rider: any; order: any }) => {
      setRiderInfo(payload.rider);
      setStage('matched');
    });
    socket.on('delivery:collecting', () => setStage('collecting'));
    socket.on('delivery:in_transit', () => setStage('in_transit'));
    socket.on('delivery:completed', (payload: { riderEarnings: number }) => {
      setCompletedEarnings(payload?.riderEarnings ?? null);
      setStage('delivered');
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    });
    socket.on('delivery:cancelled', () => {
      setStage('ended');
      setEndedMessage('The rider cancelled this delivery.');
    });
    socket.on('delivery:expired', () => {
      setStage('ended');
      setEndedMessage('No rider was found nearby. Please try again.');
    });
    socket.on('rider:location', (payload: { lat: number; lng: number }) => {
      setRiderLocation({ lat: payload.lat, lng: payload.lng });
    });
  }

  useEffect(() => {
    return () => {
      const socket = socketRef.current;
      if (socket) {
        socket.off('rider:assigned');
        socket.off('delivery:collecting');
        socket.off('delivery:in_transit');
        socket.off('delivery:completed');
        socket.off('delivery:cancelled');
        socket.off('delivery:expired');
        socket.off('rider:location');
      }
    };
  }, []);

  function resetToForm() {
    setStage('form');
    setOrderId(null);
    setRiderInfo(null);
    setRiderLocation(null);
    setCompletedEarnings(null);
    setEndedMessage(null);
  }

  const fee = feeData ? Number(feeData.totalFee ?? feeData.total ?? 0) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button">
          <X size={18} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send a delivery</Text>
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
              {dropoff?.address ?? 'Set drop-off location'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>WHAT ARE YOU SENDING?</Text>
          <TextInput
            style={styles.input}
            value={itemDescription}
            onChangeText={setItemDescription}
            placeholder="e.g. Sealed food parcel"
            placeholderTextColor={INK_FAINT}
          />

          <Text style={styles.sectionLabel}>WEIGHT (KG)</Text>
          <TextInput
            style={styles.input}
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={INK_FAINT}
          />

          <Text style={styles.sectionLabel}>RECIPIENT PHONE (OTP SENT HERE)</Text>
          <TextInput
            style={styles.input}
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
            placeholder="0801 234 5678"
            placeholderTextColor={INK_FAINT}
          />
          {recipientPhone.length > 0 && !validPhone && (
            <Text style={styles.errorText}>Enter a full Nigerian phone number</Text>
          )}

          {!!pickup && !!dropoff && numericWeight >= 0.1 && (
            <View style={styles.feeBox}>
              {feeLoading ? (
                <ActivityIndicator color={GOLD} />
              ) : fee != null ? (
                <>
                  <Text style={styles.feeLabel}>ESTIMATED FEE</Text>
                  <Text style={styles.feeValue}>{fmtNGN(fee)}</Text>
                </>
              ) : (
                <Text style={styles.feeLabel}>Could not estimate fee</Text>
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
              <Text style={styles.ctaBtnText}>Request delivery</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {(stage === 'searching' || stage === 'matched' || stage === 'collecting' || stage === 'in_transit') && (
        <View style={styles.statusScreen}>
          {stage === 'searching' && (
            <>
              <ActivityIndicator color={GOLD} size="large" />
              <Text style={styles.statusTitle}>Finding you a rider…</Text>
              <Text style={styles.statusSub}>This usually takes under a minute.</Text>
            </>
          )}
          {stage === 'matched' && (
            <>
              <Truck size={40} color={GOLD} />
              <Text style={styles.statusTitle}>Rider is heading to pickup</Text>
              {riderLocation && (
                <Text style={styles.statusSub}>
                  Rider location: {riderLocation.lat.toFixed(4)}, {riderLocation.lng.toFixed(4)}
                </Text>
              )}
            </>
          )}
          {stage === 'collecting' && (
            <>
              <Package size={40} color={GOLD} />
              <Text style={styles.statusTitle}>Parcel collected</Text>
              <Text style={styles.statusSub}>Your rider is packing up before heading to drop-off.</Text>
            </>
          )}
          {stage === 'in_transit' && (
            <>
              <Truck size={40} color={GOLD} />
              <Text style={styles.statusTitle}>On the way to drop-off</Text>
              <Text style={styles.statusSub}>
                The recipient will confirm delivery with the OTP sent to their phone.
              </Text>
              {riderLocation && (
                <Text style={styles.statusSub}>
                  Rider location: {riderLocation.lat.toFixed(4)}, {riderLocation.lng.toFixed(4)}
                </Text>
              )}
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
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel delivery'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {stage === 'delivered' && (
        <View style={styles.statusScreen}>
          <CheckCircle2 size={40} color={SUCCESS_TEXT} />
          <Text style={styles.statusTitle}>Delivered!</Text>
          {completedEarnings != null && (
            <Text style={styles.statusSub}>Delivery fee charged: {fmtNGN(completedEarnings)}</Text>
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
        title={pickingField === 'pickup' ? 'Set pickup location' : 'Set drop-off location'}
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
    color: GOLD, textTransform: 'uppercase', marginTop: 20, marginBottom: 8,
  },
  input: {
    height: 48, borderRadius: 12, backgroundColor: SURFACE_MID,
    borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14,
    fontSize: 14, color: INK,
  },
  errorText: { fontSize: 11, color: ERROR_TEXT, marginTop: 6 },

  feeBox: {
    marginTop: 24, alignItems: 'center', backgroundColor: SURFACE_ELEV,
    borderWidth: 1, borderColor: GOLD_LINE, borderRadius: 14, padding: 18, gap: 4,
  },
  feeLabel: { fontFamily: FONT_MONO, fontSize: 10, color: INK_MID, letterSpacing: 1.4 },
  feeValue: { fontFamily: FONT_DISPLAY, fontSize: 30, color: GOLD },

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
