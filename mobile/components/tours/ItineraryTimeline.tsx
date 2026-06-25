/**
 * ItineraryTimeline — Phase 9, Plan 09-11
 *
 * Vertical timeline showing tour day-plan items sorted by hour ascending.
 * Left border line with gold hour-pill nodes.
 * All colors from tokens — no inline hex.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';

import {
  BORDER_SUBTLE,
  FONT_MONO,
  FONT_UI,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_MID,
  RADIUS_PILL,
  RADIUS_SM,
  SPACE_2,
  SPACE_3,
  SPACE_4,
} from '../../lib/tokens';

export type ItineraryItem = {
  hour: number;
  title: string;
  description: string;
  location?: string;
};

type ItineraryTimelineProps = {
  items: ItineraryItem[];
};

export function ItineraryTimeline({ items }: ItineraryTimelineProps): JSX.Element {
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.hour - b.hour),
    [items],
  );

  if (sorted.length === 0) {
    return (
      <Text style={styles.empty}>No itinerary available yet.</Text>
    );
  }

  return (
    <View style={styles.container}>
      {sorted.map((item, i) => {
        const isLast = i === sorted.length - 1;
        return (
          <View key={`${item.hour}-${i}`} style={styles.row}>
            {/* Left column: line + pill */}
            <View style={styles.lineCol}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>+{item.hour}h</Text>
              </View>
              {!isLast && <View style={styles.line} />}
            </View>

            {/* Right column: content */}
            <View style={[styles.content, isLast ? null : styles.contentSpaced]}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDesc}>{item.description}</Text>
              {item.location ? (
                <View style={styles.locationRow}>
                  <MapPin size={11} color={GOLD} strokeWidth={2} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const LINE_WIDTH = 2;
const PILL_WIDTH = 44;

const styles = StyleSheet.create({
  container: {
    paddingLeft: SPACE_2,
  },
  empty: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: INK_MID,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE_3,
  },

  // Left column
  lineCol: {
    width: PILL_WIDTH,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: SPACE_2,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    minWidth: PILL_WIDTH,
    alignItems: 'center',
  },
  pillText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: GOLD,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  line: {
    width: LINE_WIDTH,
    flex: 1,
    minHeight: 28,
    backgroundColor: BORDER_SUBTLE,
    marginTop: SPACE_2,
    marginBottom: 0,
    borderRadius: RADIUS_SM,
  },

  // Right column
  content: {
    flex: 1,
    paddingTop: 2,
  },
  contentSpaced: {
    paddingBottom: SPACE_4,
  },
  itemTitle: {
    fontFamily: FONT_UI,
    fontSize: 14,
    fontWeight: '700',
    color: INK,
    lineHeight: 19,
  },
  itemDesc: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: INK_MID,
    lineHeight: 19,
    marginTop: 3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  locationText: {
    fontFamily: FONT_UI,
    fontSize: 11,
    color: GOLD,
    flex: 1,
  },
});
