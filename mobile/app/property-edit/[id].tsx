/**
 * Property Edit — quick task 260727-c0m
 *
 * Pre-filled from GET /properties/:id, submits via PATCH /properties/:id.
 * Includes an isActive pause/unpause toggle and an "Add more photos" action
 * reusing the same multipart upload pattern as property-create.tsx.
 */

import React, { useEffect, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../../lib/api';
import { Chip } from '../../components/ui/Chip';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  RADIUS_MD,
  RADIUS_LG,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../../lib/tokens';

// ── Constants ────────────────────────────────────────

const PROPERTY_TYPES = [
  'HOTEL', 'GUESTHOUSE', 'APARTMENT', 'VILLA', 'RESORT',
  'LOUNGE', 'CLUB', 'BEACH', 'TOUR', 'EXPERIENCE', 'ATTRACTION',
] as const;

const BOOKING_MODES = ['NIGHTLY', 'HOURLY', 'TIMED_EVENT', 'MEMBERSHIP'] as const;

function labelize(v: string): string {
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
}

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

// Duplicated across mutation screens per this codebase's small-pure-helper convention.
async function ensureHostRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'HOST') {
    await api.patch('/users/me/role', { role: 'HOST' });
  }
}

// ── Types ────────────────────────────────────────────

interface Me {
  role?: string;
}

interface Property {
  id: string;
  name: string;
  description?: string | null;
  type: (typeof PROPERTY_TYPES)[number];
  bookingMode?: (typeof BOOKING_MODES)[number];
  pricePerNight?: number | string | null;
  pricePerHour?: number | string | null;
  membershipMonthlyPrice?: number | string | null;
  address: string;
  lgaId?: string;
  maxGuests: number;
  amenities?: string[];
  highlights?: string[];
  isActive: boolean;
}

// ── Screen ───────────────────────────────────────────

export default function PropertyEditScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => fetcher('/users/me') });

  const { data: property, isLoading } = useQuery<Property>({
    queryKey: ['property', id],
    queryFn: () => fetcher(`/properties/${id}`),
    enabled: !!id,
  });

  const [initialized, setInitialized] = useState(false);
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
  const [isActive, setIsActive] = useState(true);
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    if (!initialized && property) {
      setName(property.name ?? '');
      setDescription(property.description ?? '');
      setType(property.type ?? 'GUESTHOUSE');
      setBookingMode(property.bookingMode ?? 'NIGHTLY');
      setPricePerNight(String(property.pricePerNight ?? ''));
      setPricePerHour(String(property.pricePerHour ?? ''));
      setMembershipMonthlyPrice(String(property.membershipMonthlyPrice ?? ''));
      setAddress(property.address ?? '');
      setMaxGuests(String(property.maxGuests ?? ''));
      setAmenities((property.amenities ?? []).join(', '));
      setHighlights((property.highlights ?? []).join(', '));
      setIsActive(property.isActive !== false);
      setInitialized(true);
    }
  }, [initialized, property]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await ensureHostRole(me?.role);

      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        bookingMode,
        address: address.trim(),
        pricePerNight: Number(pricePerNight || 0),
        maxGuests: Number(maxGuests || 1),
        amenities: amenities.split(',').map((a) => a.trim()).filter(Boolean),
        highlights: highlights.split(',').map((h) => h.trim()).filter(Boolean),
        isActive,
      };
      if (bookingMode === 'HOURLY') body.pricePerHour = Number(pricePerHour || 0);
      if (bookingMode === 'MEMBERSHIP') body.membershipMonthlyPrice = Number(membershipMonthlyPrice || 0);

      const { data } = await api.patch(`/properties/${id}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', id] });
      queryClient.invalidateQueries({ queryKey: ['my-properties'] });
      router.back();
    },
    onError: (err) => {
      Alert.alert('Could not save changes', getErrorMessage(err, 'Please try again.'));
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
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

      await api.post(`/properties/${id}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: ['property', id] });
    },
    onError: (err) => {
      Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'));
    },
  });

  if (isLoading || !initialized) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    );
  }

  const canSave =
    name.trim().length >= 3 &&
    address.trim().length > 0 &&
    Number(pricePerNight || 0) > 0 &&
    Number(maxGuests || 0) > 0 &&
    !saveMutation.isPending;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Active / Paused toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Listing status</Text>
          <View style={styles.togglePair}>
            <Chip label="Active" active={isActive} onPress={() => setIsActive(true)} />
            <Chip label="Paused" active={!isActive} onPress={() => setIsActive(false)} />
          </View>
        </View>

        <Text style={styles.label}>Listing name</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={name} onChangeText={setName} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
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
            <Chip key={m} label={labelize(m)} active={bookingMode === m} onPress={() => setBookingMode(m)} />
          ))}
        </View>

        <Text style={styles.label}>Price per night (₦)</Text>
        <TextInput
          style={styles.input}
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
              placeholderTextColor={INK_FAINT}
              value={membershipMonthlyPrice}
              onChangeText={setMembershipMonthlyPrice}
              keyboardType="numeric"
            />
          </>
        ) : null}

        <Text style={styles.label}>Address</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={address} onChangeText={setAddress} />

        <Text style={styles.label}>Max guests</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={INK_FAINT}
          value={maxGuests}
          onChangeText={setMaxGuests}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Amenities (comma-separated)</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={amenities} onChangeText={setAmenities} />

        <Text style={styles.label}>Highlights (comma-separated)</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={highlights} onChangeText={setHighlights} />

        {/* Add more photos */}
        <Pressable
          onPress={() => uploadPhotoMutation.mutate()}
          disabled={uploadPhotoMutation.isPending}
          style={({ pressed }) => [
            styles.photoBtn,
            (pressed || uploadPhotoMutation.isPending) && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add more photos"
        >
          {uploadPhotoMutation.isPending ? (
            <ActivityIndicator color={GOLD} />
          ) : (
            <>
              <Camera size={16} color={GOLD} />
              <Text style={styles.photoBtnText}>Add more photos</Text>
              {uploadedCount > 0 ? <Check size={14} color={GOLD} /> : null}
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => saveMutation.mutate()}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.submitBtn,
            !canSave && styles.submitBtnDisabled,
            pressed && canSave && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={SURFACE_DEEP} />
          ) : (
            <Text style={styles.submitBtnText}>Save changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: SPACE_5, paddingTop: SPACE_5, paddingBottom: 60, gap: SPACE_3 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: INK },
  togglePair: { flexDirection: 'row', gap: 8 },

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

  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD,
    marginTop: SPACE_4,
  },
  photoBtnText: { fontSize: 13.5, fontWeight: '700', color: GOLD },

  submitBtn: {
    height: 52,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE_4,
  },
  submitBtnDisabled: { backgroundColor: GOLD_DIM },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP },
});
