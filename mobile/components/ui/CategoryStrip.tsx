import React, { useCallback } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import {
  BORDER_SUBTLE,
  GOLD,
  INK,
  INK_FAINT,
} from '../../lib/tokens';

export type CategoryStripItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export type CategoryStripProps = {
  items: CategoryStripItem[];
  activeId: string;
  onChange: (id: string) => void;
};

// Mid-surface with built-in opacity stands in for BlurView (avoids extra dep).
const STRIP_BG = 'rgba(13,31,31,0.92)';

/**
 * Horizontal icon-label category tabs. Drives Stays (10 cats) AND Marketplace (8 cats).
 * Stateless — activeId is owned by the parent screen.
 * Per M-2 touch-target floor (non-negotiable): every tab has minHeight 44.
 */
export function CategoryStrip({
  items,
  activeId,
  onChange,
}: CategoryStripProps): JSX.Element {
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CategoryStripItem>) => {
      const isActive = item.id === activeId;
      const color = isActive ? INK : INK_FAINT;
      const Icon = item.icon;

      return (
        <Pressable
          onPress={() => onChange(item.id)}
          style={({ pressed }) => [
            styles.tab,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={4}
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          accessibilityLabel={item.label}
        >
          <View style={styles.tabInner}>
            <Icon size={20} color={color} strokeWidth={isActive ? 2 : 1.5} />
            <Text
              style={[styles.label, { color }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {isActive ? <View style={styles.underline} /> : null}
          </View>
        </Pressable>
      );
    },
    [activeId, onChange]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled={false}
        contentContainerStyle={styles.list}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: STRIP_BG,
    borderBottomColor: BORDER_SUBTLE,
    borderBottomWidth: 1,
  },
  list: {
    paddingHorizontal: 16,
    gap: 4,
  },
  tab: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  underline: {
    position: 'absolute',
    bottom: -6,
    height: 2,
    width: '100%',
    backgroundColor: GOLD,
    borderRadius: 1,
  },
});
