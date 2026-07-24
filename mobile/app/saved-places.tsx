import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, Heart, MapPin } from 'lucide-react-native';
import { fetcher } from '../lib/api';
import { getBookmarks } from '../lib/storage';
import {
  SURFACE_DEEP, SURFACE_MID, BORDER,
  GOLD, CREAM, INK, INK_MID, INK_FAINT,
  FONT_DISPLAY, FONT_MONO,
} from '../lib/tokens';

type Attraction = { id: string; name: string; category?: string; lga?: { name?: string } };

function PlaceRow({ place }: { place: Attraction }) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => router.push({ pathname: '/ai-chat', params: { prompt: `Tell me about ${place.name} attraction` } } as any)}
    >
      <View style={styles.rowIconBox}>
        <Heart size={16} color={GOLD} fill={GOLD} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{place.name}</Text>
        {place.lga?.name && (
          <View style={styles.rowMeta}>
            <MapPin size={10} color={INK_MID} />
            <Text style={styles.rowMetaText}>{place.lga.name}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function SavedPlacesScreen() {
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      getBookmarks().then(setBookmarkIds);
    }, []),
  );

  const { data, isLoading } = useQuery({
    queryKey: ['attractions'],
    queryFn: () => fetcher('/attractions'),
  });
  const allAttractions: Attraction[] = data?.data ?? data ?? [];
  const saved = allAttractions.filter((a) => bookmarkIds.includes(a.id));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button">
          <ChevronLeft size={18} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>Saved Places</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={GOLD} /></View>
      ) : saved.length === 0 ? (
        <View style={styles.centered}>
          <Heart size={32} color={INK_FAINT} />
          <Text style={styles.emptyText}>No saved places yet — tap the heart on any attraction to save it</Text>
        </View>
      ) : (
        <FlatList
          data={saved}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => <PlaceRow place={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

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
  title: { fontFamily: FONT_DISPLAY, fontSize: 20, color: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyText: { color: INK_MID, fontSize: 13, textAlign: 'center' },
  list: { padding: 20, gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, padding: 12,
  },
  rowIconBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(200,150,42,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { fontSize: 14, fontWeight: '700', color: INK },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowMetaText: { fontFamily: FONT_MONO, fontSize: 10.5, color: INK_MID },
});
