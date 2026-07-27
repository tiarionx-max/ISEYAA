/**
 * driver-application.tsx — quick task 260727-bph
 *
 * Collects licence + vehicle details for a user who has just been granted the
 * DRIVER role (via POST /users/me/become-driver) and chains the two existing,
 * unmodified transport endpoints to create their Driver profile + Vehicle:
 *   1. POST /transport/drivers            -> { id, status: 'PENDING_REVIEW', ... }
 *   2. POST /transport/drivers/:id/vehicles -> attaches the vehicle to that driver
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { Chip } from '../components/ui/Chip';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  SURFACE_MID,
  GOLD,
  INK,
  INK_FAINT,
  BORDER,
  FONT_MONO,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  RADIUS_MD,
  RADIUS_LG,
} from '../lib/tokens';

type VehicleType = 'BIKE' | 'TRICYCLE' | 'CAR' | 'MINIBUS';

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'BIKE', label: 'Bike' },
  { value: 'TRICYCLE', label: 'Tricycle' },
  { value: 'CAR', label: 'Car' },
  { value: 'MINIBUS', label: 'Minibus' },
];

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function defaultExpiry(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
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

export default function DriverApplicationScreen() {
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceExpiry, setLicenceExpiry] = useState<Date>(defaultExpiry());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [vehicleType, setVehicleType] = useState<VehicleType>('CAR');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [colour, setColour] = useState('');
  const [year, setYear] = useState('');

  const { data: me } = useQuery<{ role?: string }>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await ensureDriverRole(me?.role);
      const driverRes = await api.post('/transport/drivers', {
        licenceNumber: licenceNumber.trim(),
        licenceExpiry: licenceExpiry.toISOString().slice(0, 10),
      });
      const driverId = driverRes.data?.data?.id ?? driverRes.data?.id;
      return api.post(`/transport/drivers/${driverId}/vehicles`, {
        type: vehicleType,
        make: make.trim(),
        model: model.trim(),
        year: Number(year),
        plateNumber: plateNumber.trim(),
        colour: colour.trim(),
      });
    },
    onSuccess: () => {
      Alert.alert(
        'Application submitted',
        'Your driver application is under review. We will notify you once approved — this can take up to 48 hours.',
        [{ text: 'Done', onPress: () => router.replace('/(tabs)/profile' as never) }],
      );
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getErrorMessage(err, 'Could not submit your application. Please try again.'));
    },
  });

  function handleSubmit() {
    const currentYear = new Date().getFullYear();
    const yearNum = Number(year);
    if (!licenceNumber.trim()) {
      Alert.alert('Missing information', 'Enter your licence number.');
      return;
    }
    if (!make.trim() || !model.trim() || !plateNumber.trim() || !colour.trim()) {
      Alert.alert('Missing information', 'Fill in your vehicle make, model, plate number, and colour.');
      return;
    }
    if (!year.trim() || Number.isNaN(yearNum) || yearNum < 1980 || yearNum > currentYear + 1) {
      Alert.alert('Invalid year', `Enter a valid vehicle year between 1980 and ${currentYear + 1}.`);
      return;
    }
    mutation.mutate();
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Licence section ─────────────────────────── */}
          <Text style={styles.sectionKicker}>DRIVER LICENCE</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>LICENCE NUMBER</Text>
            <TextInput
              value={licenceNumber}
              onChangeText={setLicenceNumber}
              placeholder="e.g. OGN-1234567"
              placeholderTextColor={INK_FAINT}
              autoCapitalize="characters"
              style={styles.input}
              accessibilityLabel="Licence number"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>LICENCE EXPIRY</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Select licence expiry date"
            >
              <CalendarDays size={16} color={GOLD} strokeWidth={2} />
              <Text style={styles.dateFieldText}>{displayDate(licenceExpiry)}</Text>
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={licenceExpiry}
              mode="date"
              minimumDate={new Date()}
              onChange={(_: unknown, d?: Date) => {
                if (Platform.OS !== 'ios') setShowDatePicker(false);
                if (d) setLicenceExpiry(d);
              }}
            />
          )}

          {/* ── Vehicle section ─────────────────────────── */}
          <Text style={[styles.sectionKicker, { marginTop: SPACE_5 }]}>VEHICLE DETAILS</Text>

          <View style={styles.chipRow}>
            {VEHICLE_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                active={vehicleType === t.value}
                onPress={() => setVehicleType(t.value)}
              />
            ))}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>MAKE</Text>
            <TextInput
              value={make}
              onChangeText={setMake}
              placeholder="e.g. Toyota"
              placeholderTextColor={INK_FAINT}
              style={styles.input}
              accessibilityLabel="Vehicle make"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>MODEL</Text>
            <TextInput
              value={model}
              onChangeText={setModel}
              placeholder="e.g. Corolla"
              placeholderTextColor={INK_FAINT}
              style={styles.input}
              accessibilityLabel="Vehicle model"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>YEAR</Text>
            <TextInput
              value={year}
              onChangeText={setYear}
              placeholder="e.g. 2018"
              placeholderTextColor={INK_FAINT}
              keyboardType="number-pad"
              style={styles.input}
              accessibilityLabel="Vehicle year"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>PLATE NUMBER</Text>
            <TextInput
              value={plateNumber}
              onChangeText={setPlateNumber}
              placeholder="e.g. ABJ-234-KJ"
              placeholderTextColor={INK_FAINT}
              autoCapitalize="characters"
              style={styles.input}
              accessibilityLabel="Plate number"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>COLOUR</Text>
            <TextInput
              value={colour}
              onChangeText={setColour}
              placeholder="e.g. Silver"
              placeholderTextColor={INK_FAINT}
              style={styles.input}
              accessibilityLabel="Vehicle colour"
            />
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={mutation.isPending}
            style={({ pressed }) => [
              styles.submitBtn,
              (pressed || mutation.isPending) && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Submit application"
          >
            {mutation.isPending ? (
              <ActivityIndicator size="small" color={SURFACE_DEEP} />
            ) : (
              <Text style={styles.submitBtnText}>Submit application</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },
  scrollContent: {
    padding: SPACE_5,
    paddingBottom: 48,
  },
  sectionKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: SPACE_3,
  },
  fieldBlock: {
    marginBottom: SPACE_4,
    gap: 6,
  },
  fieldLabel: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    letterSpacing: 1.4,
    color: GOLD,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: SPACE_4,
    fontSize: 14,
    color: INK,
  },
  dateField: {
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: SPACE_4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateFieldText: {
    fontSize: 14,
    fontWeight: '600',
    color: INK,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACE_4,
  },
  submitBtn: {
    height: 52,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE_3,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: SURFACE_DEEP,
  },
});
