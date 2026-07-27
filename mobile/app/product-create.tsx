/**
 * Product Create — quick task 260727-d6v
 *
 * Collects the exact CreateProductDto shape (name, description?, price, stock,
 * category?, compareAtPrice?) and posts to POST /products. On success, offers an
 * optional inline "Add photo" step (skippable) before returning to the vendor
 * dashboard — mirrors property-create.tsx's two-step create-then-photo pattern.
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

const CATEGORIES = ['fashion', 'crafts', 'food', 'art', 'tech', 'agriculture'] as const;

function labelize(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

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
  return last.includes('.') ? last : 'product.jpg';
}

// Shared local helper duplicated across mutation screens — reconciles the active
// session role to VENDOR before any product mutation (mirrors property-create.tsx's
// ensureHostRole; see plan verified_facts for why this is still worth including for
// VENDOR even though the drift scenario is less likely than for HOST).
async function ensureVendorRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'VENDOR') {
    await api.patch('/users/me/role', { role: 'VENDOR' });
  }
}

// ── Types ────────────────────────────────────────────

interface Me {
  role?: string;
}

// ── Screen ───────────────────────────────────────────

export default function ProductCreateScreen(): JSX.Element {
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | ''>('');

  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const createMutation = useMutation({
    mutationFn: async () => {
      await ensureVendorRole(me?.role);

      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        price: Number(price || 0),
        stock: Number(stock || 0),
        category: category || undefined,
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
      };

      const { data } = await api.post('/products', body);
      return data as { id: string };
    },
    onSuccess: (data) => {
      setCreatedProductId(data.id);
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
    },
    onError: (err) => {
      Alert.alert('Could not create product', getErrorMessage(err, 'Please check your details and try again.'));
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      if (!createdProductId) return;
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Please allow photo library access to add product photos.');
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formData.append('file', { uri: asset.uri, name: filename, type: mimeType } as any);

      await api.post(`/products/${createdProductId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedCount((c) => c + 1);
    },
    onError: (err) => {
      Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'));
    },
  });

  const canSubmit =
    name.trim().length >= 2 &&
    Number(price || 0) >= 0 &&
    Number(stock || 0) >= 0 &&
    !createMutation.isPending;

  // ── Step 2: optional photo upload after successful creation ──────────────
  if (createdProductId) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.doneWrap}>
          <Text style={styles.doneTitle}>Product created</Text>
          <Text style={styles.doneSub}>
            Add a few photos now, or skip and add them later from the product's edit
            screen.
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
            onPress={() => router.replace('/vendor-dashboard' as never)}
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.skipBtnText}>{uploadedCount > 0 ? 'Done' : 'Skip for now'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 1: product details form ──────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Product name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Adire Tote Bag"
          placeholderTextColor={INK_FAINT}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="What makes this product special?"
          placeholderTextColor={INK_FAINT}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Category (optional)</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={labelize(c)}
              active={category === c}
              onPress={() => setCategory(category === c ? '' : c)}
            />
          ))}
        </View>

        <Text style={styles.label}>Price (₦)</Text>
        <TextInput
          style={styles.input}
          placeholder="5000"
          placeholderTextColor={INK_FAINT}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Compare-at price (optional, ₦)</Text>
        <TextInput
          style={styles.input}
          placeholder="7000"
          placeholderTextColor={INK_FAINT}
          value={compareAtPrice}
          onChangeText={setCompareAtPrice}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Stock</Text>
        <TextInput
          style={styles.input}
          placeholder="20"
          placeholderTextColor={INK_FAINT}
          value={stock}
          onChangeText={setStock}
          keyboardType="number-pad"
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
          accessibilityLabel="Create product"
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={SURFACE_DEEP} />
          ) : (
            <Text style={styles.submitBtnText}>Create product</Text>
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
