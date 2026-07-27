/**
 * Event Edit — quick task 260727-d80
 *
 * Pre-filled from GET /events/:id, submits via PATCH /events/:id. Includes
 * a read-only status badge, "Add more photos" (reusing the multipart pattern),
 * a conditional (DRAFT-only) "Submit for approval" action, and a confirmed
 * "Delete event" action.
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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Camera, Check, CalendarDays, Clock, Send, Trash2 } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_MID,
  INK_DIM,
  INK_FAINT,
  BORDER,
  SUCCESS,
  SUCCESS_DIM,
  WARNING,
  WARNING_DIM,
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  FONT_MONO,
  RADIUS_MD,
  RADIUS_LG,
  RADIUS_PILL,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../../lib/tokens';

// ── Multipart image-upload helpers (verbatim pattern from property-edit/[id].tsx) ──

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

// Duplicated across mutation screens per this codebase's small-pure-helper convention.
async function ensureOrganiserRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'ORGANISER') {
    await api.patch('/users/me/role', { role: 'ORGANISER' });
  }
}

function formatDatePart(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimePart(d: Date): string {
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ── Types ────────────────────────────────────────────

type EventStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

interface Me {
  role?: string;
}

interface EventDetail {
  id: string;
  title: string;
  description?: string | null;
  venue: string;
  address?: string | null;
  lgaId: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
}

// ── Status badge (duplicated locally from organiser-dashboard.tsx per the
// codebase's per-screen small-component duplication convention) ──────────

const STATUS_STYLES: Record<EventStatus, { text: string; bg: string; label: string }> = {
  DRAFT: { text: INK_MID, bg: SURFACE_RAISED, label: 'Draft' },
  PENDING_APPROVAL: { text: WARNING, bg: WARNING_DIM, label: 'Pending approval' },
  APPROVED: { text: SUCCESS, bg: SUCCESS_DIM, label: 'Approved' },
  PUBLISHED: { text: GOLD, bg: GOLD_DIM, label: 'Published' },
  CANCELLED: { text: DESTRUCTIVE, bg: DESTRUCTIVE_DIM, label: 'Cancelled' },
  COMPLETED: { text: INK_DIM, bg: SURFACE_RAISED, label: 'Completed' },
};

function StatusBadge({ status }: { status: EventStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT;
  return (
    <View style={[badgeStyles.pill, { backgroundColor: style.bg }]}>
      <Text style={[badgeStyles.text, { color: style.text }]}>{style.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS_PILL, alignSelf: 'flex-start' },
  text: { fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
});

// ── Screen ───────────────────────────────────────────

export default function EventEditScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => fetcher('/users/me') });

  const { data: event, isLoading } = useQuery<EventDetail>({
    queryKey: ['event', id],
    queryFn: () => fetcher(`/events/${id}`),
    enabled: !!id,
  });

  const [initialized, setInitialized] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [lgaId, setLgaId] = useState('');
  const [startDateObj, setStartDateObj] = useState<Date>(new Date());
  const [endDateObj, setEndDateObj] = useState<Date>(new Date());
  const [showStartDate, setShowStartDate] = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    if (!initialized && event) {
      setTitle(event.title ?? '');
      setDescription(event.description ?? '');
      setVenue(event.venue ?? '');
      setAddress(event.address ?? '');
      setLgaId(event.lgaId ?? '');
      setStartDateObj(event.startDate ? new Date(event.startDate) : new Date());
      setEndDateObj(event.endDate ? new Date(event.endDate) : new Date());
      setInitialized(true);
    }
  }, [initialized, event]);

  const saveMutation = useMutation({
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

      const { data } = await api.patch(`/events/${id}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
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
        Alert.alert('Photo access needed', 'Please allow photo library access to add event photos.');
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

      await api.post(`/events/${id}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: ['event', id] });
    },
    onError: (err) => {
      Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'));
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await ensureOrganiserRole(me?.role);
      return api.patch(`/events/${id}/submit-for-approval`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
    onError: (err) => {
      Alert.alert('Could not submit', getErrorMessage(err, 'Please try again.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await ensureOrganiserRole(me?.role);
      return api.delete(`/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
      router.replace('/organiser-dashboard' as never);
    },
    onError: (err) => {
      Alert.alert('Could not delete event', getErrorMessage(err, 'Please try again.'));
    },
  });

  function confirmDelete() {
    Alert.alert(
      'Delete event?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ],
    );
  }

  if (isLoading || !initialized) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    );
  }

  const canSave = title.trim().length >= 3 && venue.trim().length > 0 && lgaId.trim().length > 0 && !saveMutation.isPending;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {event?.status ? <StatusBadge status={event.status} /> : null}

        <Text style={styles.label}>Event title</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={title} onChangeText={setTitle} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholderTextColor={INK_FAINT}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Venue</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={venue} onChangeText={setVenue} />

        <Text style={styles.label}>Address</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={address} onChangeText={setAddress} />

        <Text style={styles.label}>LGA ID</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={lgaId} onChangeText={setLgaId} />
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

        {/* Submit for approval — DRAFT only */}
        {event?.status === 'DRAFT' ? (
          <Pressable
            onPress={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            style={({ pressed }) => [
              styles.submitForApprovalBtn,
              (pressed || submitMutation.isPending) && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Submit for approval"
          >
            {submitMutation.isPending ? (
              <ActivityIndicator color={SURFACE_DEEP} />
            ) : (
              <>
                <Send size={16} color={SURFACE_DEEP} />
                <Text style={styles.submitForApprovalBtnText}>Submit for approval</Text>
              </>
            )}
          </Pressable>
        ) : null}

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

        <Pressable
          onPress={confirmDelete}
          disabled={deleteMutation.isPending}
          style={({ pressed }) => [
            styles.deleteBtn,
            (pressed || deleteMutation.isPending) && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Delete event"
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator color={DESTRUCTIVE} />
          ) : (
            <>
              <Trash2 size={15} color={DESTRUCTIVE} />
              <Text style={styles.deleteBtnText}>Delete event</Text>
            </>
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

  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    marginTop: SPACE_4,
  },
  photoBtnText: { fontSize: 13.5, fontWeight: '700', color: GOLD },

  submitForApprovalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    marginTop: SPACE_3,
  },
  submitForApprovalBtnText: { fontSize: 14, fontWeight: '700', color: SURFACE_DEEP },

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

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: DESTRUCTIVE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    marginTop: SPACE_3,
  },
  deleteBtnText: { fontSize: 13.5, fontWeight: '700', color: DESTRUCTIVE },
});
