/**
 * Property Create — quick task 260727-c0m
 *
 * Collects the extended CreatePropertyDto shape (all 11 PropertyType values, all 4
 * BookingMode values with mode-appropriate pricing) and posts to POST /properties.
 * On success, offers an optional inline "Add photos" step (skippable) before
 * returning to the host dashboard.
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../lib/api';
import { Chip } from '../components/ui/Chip';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  RADIUS_MD,
  RADIUS_LG,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../lib/tokens';

// ── Constants ────────────────────────────────────────

const PROPERTY_TYPES = [
  'HOTEL', 'GUESTHOUSE', 'APARTMENT', 'VILLA', 'RESORT',
  'LOUNGE', 'CLUB', 'BEACH', 'TOUR', 'EXPERIENCE', 'ATTRACTION',
] as const;

const BOOKING_MODES = ['NIGHTLY', 'HOURLY', 'TIMED_EVENT', 'MEMBERSHIP'] as const;

function labelize(v: string): string {
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
}

// ── Multipart image-upload helpers (verbatim pattern from profile-edit.tsx) ──

function inferMimeType(uri: string, assetMimeType?: string | null): string {
  if (assetMimeType) return assetMimeType;
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

function deriveFilename(uri: string): string {
  const last = uri.split('/').pop() ?? '';
  return last.includes('.') ? last : 'property.jpg';
}

// Shared local helper duplicated across mutation screens — reconciles the
// active session role to HOST before any property mutation (see host.tsx's
// alreadyHost check, which reads registeredRoles and can be true even when
// the active `role` has since drifted away from HOST).
async function ensureHostRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'HOST') {
    await api.patch('/users/me/role', { role: 'HOST' });
  }
}

// ── Types ────────────────────────────────────────────

interface Me {
  role?: string;
}

// ── Screen ───────────────────────────────────────────

export default function PropertyCreateScreen(): JSX.Element {
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof PROPERTY_TYPES)[number]>('GUESTHOUSE');
  const [bookingMode, setBookingMode] = useState<(typeof BOOKING_MODES)[number]>('NIGHTLY');
  const [pricePerNight, setPricePerNight] = useState('');
  const [pricePerHour, setPricePerHour] = useState('');
  const [membershipMonthlyPrice, setMembershipMonthlyPrice] = useState('');
  const [address, setAddress] = useState('');
  const [maxGuests, setMaxGuests] = useState('');
  const [amenities, setAmenities] = useState('');
  const [highlights, setHighlights] = useState('');
  const [lgaId, setLgaId] = useState('');

  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const createMutation = useMutation({
    mutationFn: async () => {
      await ensureHostRole(me?.role);

      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        bookingMode,
        address: address.trim(),
        lgaId: lgaId.trim(),
        pricePerNight: Number(pricePerNight || 0),
        maxGuests: Number(maxGuests || 1),
        amenities: amenities
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        highlights: highlights
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean),
      };
      if (bookingMode === 'HOURLY') body.pricePerHour = Number(pricePerHour || 0);
      if (bookingMode === 'MEMBERSHIP') body.membershipMonthlyPrice = Number(membershipMonthlyPrice || 0);

      const { data } = await api.post('/properties', body);
      return data as { id: string };
    },
    onSuccess: (data) => {
      setCreatedPropertyId(data.id);
      queryClient.invalidateQueries({ queryKey: ['my-properties'] });
    },
    onError: (err) => {
      Alert.alert('Could not create listing', getErrorMessage(err, 'Please check your details and try again.'));
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      if (!createdPropertyId) return;
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Please allow photo library access to add listing photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      const filename = deriveFilename(asset.uri);
      const mimeType = inferMimeType(asset.uri, asset.mimeType);
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, name: filename, type: mimeType } as any);

      await api.post(`/properties/${createdPropertyId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedCount((c) => c + 1);
    },
    onError: (err) => {
      Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'));
    },
  });

  const canSubmit =
    name.trim().length >= 3 &&
    address.trim().length > 0 &&
    lgaId.trim().length > 0 &&
    Number(pricePerNight || 0) > 0 &&
    Number(maxGuests || 0) > 0 &&
    !createMutation.isPending;

  // ── Step 2: optional photo upload after successful creation ──────────────
  if (createdPropertyId) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.doneWrap}>
          <Text style={styles.doneTitle}>Listing created</Text>
          <Text style={styles.doneSub}>
            Add a few photos now, or skip and add them later from the listing's edit screen.
          </Text>

          {uploadedCount > 0 ? (
            <View style={styles.uploadedPill}>
              <Check size={14} color={GOLD} />
              <Text style={styles.uploadedPillText}>
                {uploadedCount} photo{uploadedCount === 1 ? '' : 's'} added
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => uploadPhotoMutation.mutate()}
            disabled={uploadPhotoMutation.isPending}
            style={({ pressed }) => [
              styles.photoBtn,
              (pressed || uploadPhotoMutation.isPending) && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
          >
            {uploadPhotoMutation.isPending ? (
              <ActivityIndicator color={SURFACE_DEEP} />
            ) : (
              <>
                <Camera size={16} color={SURFACE_DEEP} />
                <Text style={styles.photoBtnText}>Add photo</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.replace('/host-dashboard' as never)}
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.skipBtnText}>
              {uploadedCount > 0 ? 'Done' : 'Skip for now'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 1: property details form ─────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Listing name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Abeokuta Garden Suite"
          placeholderTextColor={INK_FAINT}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="What makes this place special?"
          placeholderTextColor={INK_FAINT}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Type</Text>
        <View style={styles.chipRow}>
          {PROPERTY_TYPES.map((t) => (
            <Chip key={t} label={labelize(t)} active={type === t} onPress={() => setType(t)} />
          ))}
        </View>

        <Text style={styles.label}>Booking mode</Text>
        <View style={styles.chipRow}>
          {BOOKING_MODES.map((m) => (
            <Chip
              key={m}
              label={labelize(m)}
              active={bookingMode === m}
              onPress={() => setBookingMode(m)}
            />
          ))}
        </View>

        <Text style={styles.label}>Price per night (₦)</Text>
        <TextInput
          style={styles.input}
          placeholder="15000"
          placeholderTextColor={INK_FAINT}
          value={pricePerNight}
          onChangeText={setPricePerNight}
          keyboardType="numeric"
        />

        {bookingMode === 'HOURLY' ? (
          <>
            <Text style={styles.label}>Price per hour (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="2500"
              placeholderTextColor={INK_FAINT}
              value={pricePerHour}
              onChangeText={setPricePerHour}
              keyboardType="numeric"
            />
          </>
        ) : null}

        {bookingMode === 'MEMBERSHIP' ? (
          <>
            <Text style={styles.label}>Monthly membership price (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="8000"
              placeholderTextColor={INK_FAINT}
              value={membershipMonthlyPrice}
              onChangeText={setMembershipMonthlyPrice}
              keyboardType="numeric"
            />
          </>
        ) : null}

        <Text style={styles.label}>Address</Text>
        <TextInput
          style={styles.input}
          placeholder="1 Library Road, Abeokuta"
          placeholderTextColor={INK_FAINT}
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.label}>LGA ID</Text>
        <TextInput
          style={styles.input}
          placeholder="LGA UUID"
          placeholderTextColor={INK_FAINT}
          value={lgaId}
          onChangeText={setLgaId}
        />
        {/* Known simplification: no LGA picker component exists anywhere in mobile
            yet (confirmed via grep). Plain text input pending a future LGA picker. */}

        <Text style={styles.label}>Max guests</Text>
        <TextInput
          style={styles.input}
          placeholder="4"
          placeholderTextColor={INK_FAINT}
          value={maxGuests}
          onChangeText={setMaxGuests}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Amenities (comma-separated, optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="WiFi, Pool, Parking"
          placeholderTextColor={INK_FAINT}
          value={amenities}
          onChangeText={setAmenities}
        />

        <Text style={styles.label}>Highlights (comma-separated, optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Rooftop view, Private entrance"
          placeholderTextColor={INK_FAINT}
          value={highlights}
          onChangeText={setHighlights}
        />

        <Pressable
          onPress={() => createMutation.mutate()}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit && styles.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create listing"
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={SURFACE_DEEP} />
          ) : (
            <Text style={styles.submitBtnText}>Create listing</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  scroll: { paddingHorizontal: SPACE_5, paddingTop: SPACE_5, paddingBottom: 60, gap: SPACE_3 },

  label: { fontSize: 12.5, fontWeight: '600', color: INK_MID, marginTop: SPACE_3, marginBottom: -4 },
  input: {
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: SPACE_4,
    fontSize: 15,
    color: INK,
  },
  inputMultiline: { height: 90, paddingTop: 12, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  submitBtn: {
    height: 52,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE_5,
  },
  submitBtnDisabled: { backgroundColor: GOLD_DIM },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP },

  // Step 2 — photo upload
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE_5,
    gap: SPACE_3,
  },
  doneTitle: { fontSize: 20, fontWeight: '700', color: CREAM },
  doneSub: { fontSize: 14, color: INK_MID, textAlign: 'center' },
  uploadedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: GOLD_DIM,
  },
  uploadedPillText: { fontSize: 12, fontWeight: '700', color: GOLD },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: SPACE_5,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    marginTop: SPACE_4,
  },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: SURFACE_DEEP },
  skipBtn: { marginTop: SPACE_3, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontSize: 14, fontWeight: '600', color: INK_MID },
});
