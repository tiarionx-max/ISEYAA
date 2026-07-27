/**
 * Event Create — quick task 260727-d80
 *
 * Collects the CreateEventDto shape (title/description/lgaId/venue/address/
 * startDate/endDate) and posts to POST /events, which always lands as DRAFT —
 * submit-for-approval is a separate, explicit user action elsewhere. On
 * success, offers an optional inline "Add a cover photo" step (skippable)
 * before returning to the organiser dashboard.
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Camera, Check, CalendarDays, Clock } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../lib/api';
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

// ── Multipart image-upload helpers (verbatim pattern from property-create.tsx) ──

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
  return last.includes('.') ? last : 'event.jpg';
}

// Duplicated across mutation screens per this codebase's small-pure-helper
// convention — reconciles the active session role to ORGANISER before any
// event mutation (mirrors property-create.tsx's ensureHostRole).
async function ensureOrganiserRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'ORGANISER') {
    await api.patch('/users/me/role', { role: 'ORGANISER' });
  }
}

// ── Types ────────────────────────────────────────────

interface Me {
  role?: string;
}

// ── Default near-future dates ────────────────────────

function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function defaultEnd(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(21, 0, 0, 0);
  return d;
}

function formatDatePart(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimePart(d: Date): string {
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ── Screen ───────────────────────────────────────────

export default function EventCreateScreen(): JSX.Element {
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [lgaId, setLgaId] = useState('');

  const [startDateObj, setStartDateObj] = useState<Date>(defaultStart());
  const [endDateObj, setEndDateObj] = useState<Date>(defaultEnd());
  const [showStartDate, setShowStartDate] = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);

  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const createMutation = useMutation({
    mutationFn: async () => {
      await ensureOrganiserRole(me?.role);

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        lgaId: lgaId.trim(),
        venue: venue.trim(),
        address: address.trim() || undefined,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
      };

      const { data } = await api.post('/events', body);
      return data as { id: string };
    },
    onSuccess: (data) => {
      setCreatedEventId(data.id);
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
    onError: (err) => {
      Alert.alert('Could not create event', getErrorMessage(err, 'Please check your details and try again.'));
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      if (!createdEventId) return;
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Please allow photo library access to add a cover photo.');
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

      await api.post(`/events/${createdEventId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedCount((c) => c + 1);
    },
    onError: (err) => {
      Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'));
    },
  });

  const canSubmit =
    title.trim().length >= 3 &&
    venue.trim().length > 0 &&
    lgaId.trim().length > 0 &&
    !createMutation.isPending;

  function finishAndReturn() {
    queryClient.invalidateQueries({ queryKey: ['my-events'] });
    router.replace('/organiser-dashboard' as never);
  }

  // ── Step 2: optional cover-photo upload after successful creation ────────
  if (createdEventId) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.doneWrap}>
          <Text style={styles.doneTitle}>Event created</Text>
          <Text style={styles.doneSub}>
            Add a cover photo now, or skip and add one later from the event's edit screen.
            Your event stays a draft until you submit it for approval.
          </Text>

          {uploadedCount > 0 ? (
            <View style={styles.uploadedPill}>
              <Check size={14} color={GOLD} />
              <Text style={styles.uploadedPillText}>Cover photo added</Text>
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
            accessibilityLabel="Add cover photo"
          >
            {uploadPhotoMutation.isPending ? (
              <ActivityIndicator color={SURFACE_DEEP} />
            ) : (
              <>
                <Camera size={16} color={SURFACE_DEEP} />
                <Text style={styles.photoBtnText}>Add cover photo</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={finishAndReturn}
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

  // ── Step 1: event details form ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Event title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Abeokuta Cultural Festival"
          placeholderTextColor={INK_FAINT}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="What's the event about?"
          placeholderTextColor={INK_FAINT}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Venue</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Centenary Hall"
          placeholderTextColor={INK_FAINT}
          value={venue}
          onChangeText={setVenue}
        />

        <Text style={styles.label}>Address (optional)</Text>
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

        <Text style={styles.label}>Start date</Text>
        <View style={styles.dateTimeRow}>
          <Pressable
            style={({ pressed }) => [styles.dateTimeField, pressed && { opacity: 0.8 }]}
            onPress={() => setShowStartDate(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick start date"
          >
            <CalendarDays size={14} color={GOLD} />
            <Text style={styles.dateTimeText}>{formatDatePart(startDateObj)}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.dateTimeField, pressed && { opacity: 0.8 }]}
            onPress={() => setShowStartTime(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick start time"
          >
            <Clock size={14} color={GOLD} />
            <Text style={styles.dateTimeText}>{formatTimePart(startDateObj)}</Text>
          </Pressable>
        </View>
        {showStartDate && (
          <DateTimePicker
            value={startDateObj}
            mode="date"
            onChange={(_: unknown, d?: Date) => {
              if (Platform.OS !== 'ios') setShowStartDate(false);
              if (d) {
                const next = new Date(startDateObj);
                next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                setStartDateObj(next);
              }
            }}
          />
        )}
        {showStartTime && (
          <DateTimePicker
            value={startDateObj}
            mode="time"
            onChange={(_: unknown, d?: Date) => {
              if (Platform.OS !== 'ios') setShowStartTime(false);
              if (d) {
                const next = new Date(startDateObj);
                next.setHours(d.getHours(), d.getMinutes());
                setStartDateObj(next);
              }
            }}
          />
        )}

        <Text style={styles.label}>End date</Text>
        <View style={styles.dateTimeRow}>
          <Pressable
            style={({ pressed }) => [styles.dateTimeField, pressed && { opacity: 0.8 }]}
            onPress={() => setShowEndDate(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick end date"
          >
            <CalendarDays size={14} color={GOLD} />
            <Text style={styles.dateTimeText}>{formatDatePart(endDateObj)}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.dateTimeField, pressed && { opacity: 0.8 }]}
            onPress={() => setShowEndTime(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick end time"
          >
            <Clock size={14} color={GOLD} />
            <Text style={styles.dateTimeText}>{formatTimePart(endDateObj)}</Text>
          </Pressable>
        </View>
        {showEndDate && (
          <DateTimePicker
            value={endDateObj}
            mode="date"
            onChange={(_: unknown, d?: Date) => {
              if (Platform.OS !== 'ios') setShowEndDate(false);
              if (d) {
                const next = new Date(endDateObj);
                next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                setEndDateObj(next);
              }
            }}
          />
        )}
        {showEndTime && (
          <DateTimePicker
            value={endDateObj}
            mode="time"
            onChange={(_: unknown, d?: Date) => {
              if (Platform.OS !== 'ios') setShowEndTime(false);
              if (d) {
                const next = new Date(endDateObj);
                next.setHours(d.getHours(), d.getMinutes());
                setEndDateObj(next);
              }
            }}
          />
        )}

        <Pressable
          onPress={() => createMutation.mutate()}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit && styles.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create event"
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={SURFACE_DEEP} />
          ) : (
            <Text style={styles.submitBtnText}>Create event</Text>
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

  dateTimeRow: { flexDirection: 'row', gap: 8 },
  dateTimeField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: SPACE_4,
  },
  dateTimeText: { fontSize: 13.5, color: INK },

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

  // Step 2 — cover photo upload
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
