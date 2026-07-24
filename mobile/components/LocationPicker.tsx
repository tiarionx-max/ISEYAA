import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, MapPin, Search, X } from 'lucide-react-native';
import { fetcher } from '../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_ELEV,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

export type PickedLocation = {
  lat: number;
  lng: number;
  address: string;
};

// Real places with real coordinates — this app has no geocoding/Places integration,
// so destinations are picked from the platform's own attractions + stays, not typed
// as freeform addresses. Deliberate choice over fabricating map/geocoding support.
async function searchPlaces(query: string): Promise<PickedLocation[]> {
  const q = encodeURIComponent(query);
  const [atts, props] = await Promise.allSettled([
    fetcher(`/attractions?search=${q}&limit=6`),
    fetcher(`/properties?search=${q}&limit=6`),
  ]);
  const fromAtts = (atts.status === 'fulfilled' ? atts.value?.data ?? atts.value : []) ?? [];
  const fromProps = (props.status === 'fulfilled' ? props.value?.data ?? props.value : []) ?? [];
  return [...fromAtts, ...fromProps]
    .filter((p: any) => p.latitude != null && p.longitude != null)
    .map((p: any) => ({
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      address: p.address ?? p.name,
    }));
}

export function LocationPicker({
  visible,
  title,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  onSelect: (loc: PickedLocation) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['location-picker-search', debounced],
    queryFn: () => searchPlaces(debounced),
    enabled: debounced.length >= 2,
  });

  async function useCurrentLocation() {
    setGpsError(null);
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Location permission denied — pick a place instead');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }).catch(() => [] as Location.LocationGeocodedAddress[]);
      const address = place
        ? [place.street, place.city ?? place.subregion, place.region].filter(Boolean).join(', ')
        : `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      onSelect({ lat: pos.coords.latitude, lng: pos.coords.longitude, address });
    } catch {
      setGpsError('Could not get your location — pick a place instead');
    } finally {
      setGpsLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
            <X size={18} color={INK} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.gpsRow}
          onPress={useCurrentLocation}
          activeOpacity={0.8}
          disabled={gpsLoading}
        >
          <View style={styles.gpsIconBox}>
            {gpsLoading ? <ActivityIndicator size="small" color={GOLD} /> : <Crosshair size={16} color={GOLD} />}
          </View>
          <Text style={styles.gpsText}>Use my current location</Text>
        </TouchableOpacity>
        {gpsError && <Text style={styles.errorText}>{gpsError}</Text>}

        <View style={styles.searchBar}>
          <Search size={15} color={INK_MID} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search attractions, stays…"
            placeholderTextColor={INK_FAINT}
            value={query}
            onChangeText={setQuery}
          />
          {isFetching && <ActivityIndicator size="small" color={GOLD} />}
        </View>

        <FlatList
          data={results ?? []}
          keyExtractor={(item, i) => `${item.address}-${i}`}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            debounced.length >= 2 && !isFetching ? (
              <Text style={styles.emptyText}>No matches for "{debounced}"</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultRow}
              activeOpacity={0.7}
              onPress={() => onSelect(item)}
            >
              <MapPin size={15} color={GOLD} />
              <Text style={styles.resultText} numberOfLines={1}>{item.address}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP, paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontFamily: FONT_DISPLAY, fontSize: 20, color: CREAM },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: SURFACE_MID,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center',
  },
  gpsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: GOLD_LINE,
    borderRadius: 14, padding: 12, marginBottom: 6,
  },
  gpsIconBox: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: GOLD_DIM,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsText: { fontSize: 14, fontWeight: '700', color: INK },
  errorText: { fontSize: 11, color: '#E05252', marginBottom: 10, marginLeft: 4 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 48, borderRadius: 14, backgroundColor: SURFACE_ELEV,
    borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14,
    marginTop: 16, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: INK },
  emptyText: { textAlign: 'center', color: INK_FAINT, fontSize: 12, fontFamily: FONT_MONO, marginTop: 30 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  resultText: { flex: 1, fontSize: 14, color: INK },
});
