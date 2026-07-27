/**
 * Product Edit — quick task 260727-d6v
 *
 * Pre-filled from GET /products/:id, submits via PATCH /products/:id. No isActive
 * toggle — UpdateProductDto does not support it (products cannot be paused via the
 * API today). Includes an "Add more photos" action and a confirmed delete action.
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
import { Camera, Check, Trash2 } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../../lib/api';
import * as SecureStore from 'expo-secure-store';
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
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  RADIUS_MD,
  RADIUS_LG,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../../lib/tokens';

// ── Constants ────────────────────────────────────────

const CATEGORIES = ['fashion', 'crafts', 'food', 'art', 'tech', 'agriculture'] as const;

function labelize(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
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
  return last.includes('.') ? last : 'product.jpg';
}

// Duplicated across mutation screens per this codebase's small-pure-helper convention.
async function ensureVendorRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'VENDOR') {
    const { data } = await api.patch('/users/me/role', { role: 'VENDOR' });
    if (data?.accessToken && data?.refreshToken) {
      await SecureStore.setItemAsync('access_token', data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    }
  }
}

// ── Types ────────────────────────────────────────────

interface Me {
  role?: string;
}

interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  compareAtPrice?: number | string | null;
  stock: number;
  category?: (typeof CATEGORIES)[number] | null;
}

// ── Screen ───────────────────────────────────────────

export default function ProductEditScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => fetcher('/users/me') });

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: () => fetcher(`/products/${id}`),
    enabled: !!id,
  });

  const [initialized, setInitialized] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | ''>('');
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    if (!initialized && product) {
      setName(product.name ?? '');
      setDescription(product.description ?? '');
      setPrice(String(product.price ?? ''));
      setCompareAtPrice(product.compareAtPrice ? String(product.compareAtPrice) : '');
      setStock(String(product.stock ?? ''));
      setCategory(product.category ?? '');
      setInitialized(true);
    }
  }, [initialized, product]);

  const saveMutation = useMutation({
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

      const { data } = await api.patch(`/products/${id}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
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

      await api.post(`/products/${id}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    },
    onError: (err) => {
      Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await ensureVendorRole(me?.role);
      await api.delete(`/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
      router.replace('/vendor-dashboard' as never);
    },
    onError: (err) => {
      Alert.alert('Could not delete product', getErrorMessage(err, 'Please try again.'));
    },
  });

  const handleDelete = () => {
    Alert.alert('Delete product?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  if (isLoading || !initialized) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    );
  }

  const canSave =
    name.trim().length >= 2 &&
    Number(price || 0) >= 0 &&
    Number(stock || 0) >= 0 &&
    !saveMutation.isPending;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Product name</Text>
        <TextInput style={styles.input} placeholderTextColor={INK_FAINT} value={name} onChangeText={setName} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholderTextColor={INK_FAINT}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Category</Text>
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
          placeholderTextColor={INK_FAINT}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Compare-at price (optional, ₦)</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={INK_FAINT}
          value={compareAtPrice}
          onChangeText={setCompareAtPrice}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Stock</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={INK_FAINT}
          value={stock}
          onChangeText={setStock}
          keyboardType="number-pad"
        />

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

        <Pressable
          onPress={handleDelete}
          disabled={deleteMutation.isPending}
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Delete product"
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator color={DESTRUCTIVE} />
          ) : (
            <>
              <Trash2 size={16} color={DESTRUCTIVE} />
              <Text style={styles.deleteBtnText}>Delete product</Text>
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

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: DESTRUCTIVE_DIM,
    borderWidth: 1,
    borderColor: DESTRUCTIVE,
    marginTop: SPACE_3,
  },
  deleteBtnText: { fontSize: 13.5, fontWeight: '700', color: DESTRUCTIVE },
});
