import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { fetcher, api, getErrorMessage } from '../lib/api';
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
  FONT_MONO,
} from '../lib/tokens';

// ── Types ──────────────────────────────────────────

interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: string;
  avatarUrl?: string | null;
}

// ── Helpers ────────────────────────────────────────
// Duplicated from profile.tsx's getInitials — small pure function, this
// codebase's convention already duplicates such per-screen helpers.

function getInitials(name?: string, phone?: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (phone) return phone.slice(-2);
  return 'DA';
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
  return last.includes('.') ? last : 'avatar.jpg';
}

// ── Main Screen ─────────────────────────────────────

export default function ProfileEditScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const [initialized, setInitialized] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(null);

  useEffect(() => {
    if (!initialized && user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setAvatarUrl(user.avatarUrl ?? null);
      setInitialized(true);
    }
  }, [initialized, user]);

  const uploadAvatarMutation = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      const filename = deriveFilename(asset.uri);
      const mimeType = inferMimeType(asset.uri, asset.mimeType);
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: filename,
        type: mimeType,
      } as any);
      const { data } = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as { avatarUrl: string };
    },
    onSuccess: (data) => {
      setAvatarUrl(data.avatarUrl);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => {
      Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch('/users/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.back();
    },
    onError: (err) => {
      Alert.alert('Save failed', getErrorMessage(err, 'Could not update profile. Please try again.'));
    },
  });

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Please allow photo library access to change your profile picture.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    uploadAvatarMutation.mutate(asset);
  }

  const initials = getInitials([firstName, lastName].filter(Boolean).join(' '), user?.phone);

  const unchanged =
    firstName.trim() === (user?.firstName ?? '').trim() &&
    lastName.trim() === (user?.lastName ?? '').trim();
  const saveDisabled =
    unchanged || firstName.trim().length === 0 || lastName.trim().length === 0 || saveMutation.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Avatar ─────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              {avatarUrl ? (
                <ExpoImage
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
              {uploadAvatarMutation.isPending && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={CREAM} />
                </View>
              )}
            </View>
            <Pressable
              style={({ pressed }) => [styles.cameraBtn, pressed && { opacity: 0.8 }]}
              onPress={handlePickAvatar}
              disabled={uploadAvatarMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              <Camera size={16} color={SURFACE_DEEP} />
            </Pressable>
          </View>
          <Text style={styles.avatarHint}>Tap the camera to change your photo</Text>
        </View>

        {/* ── Name Form ──────────────────────────────── */}
        <View style={styles.formSection}>
          <Text style={styles.label}>First name</Text>
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={INK_FAINT}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            editable={!saveMutation.isPending}
          />

          <Text style={styles.label}>Last name</Text>
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={INK_FAINT}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            editable={!saveMutation.isPending}
          />

          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              saveDisabled && styles.saveBtnDisabled,
              pressed && !saveDisabled && { opacity: 0.85 },
            ]}
            onPress={() => saveMutation.mutate()}
            disabled={saveDisabled}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color={SURFACE_DEEP} />
            ) : (
              <Text style={styles.saveBtnText}>Save changes</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },
  scroll: {
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_5,
    paddingBottom: 40,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: SPACE_5,
    gap: SPACE_3,
  },
  avatarWrap: {
    width: 100,
    height: 100,
    position: 'relative',
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#3a2820',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarInitials: {
    fontFamily: FONT_MONO,
    fontSize: 28,
    fontWeight: '600',
    color: CREAM,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,14,14,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GOLD,
    borderWidth: 3,
    borderColor: SURFACE_DEEP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    fontSize: 12,
    color: INK_MID,
  },

  // Form
  formSection: {
    gap: SPACE_3,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: INK_MID,
    marginBottom: -6,
  },
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
  saveBtn: {
    height: 50,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE_3,
  },
  saveBtnDisabled: {
    backgroundColor: GOLD_DIM,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: SURFACE_DEEP,
  },
});
