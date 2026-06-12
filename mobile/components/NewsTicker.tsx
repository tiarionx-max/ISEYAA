import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react-native';

import { fetcher } from '../lib/api';
import {
  BORDER_SUBTLE,
  GOLD,
  INK_FAINT,
  INK_SECONDARY,
  SURFACE_DEEP,
} from '../lib/tokens';

// One-off constant for the LIVE indicator — semantic red, not part of the brand palette.
// Documented exception to the no-inline-hex rule (see 08-02 plan must_haves).
const LIVE_RED = '#EF4444';

type NewsItem = {
  id: string;
  headline: string;
  summary?: string | null;
  source?: string | null;
  link?: string | null;
  category?: string | null;
};

/* Static fallback so the strip never looks empty on cold start. Mirrors web NewsTicker. */
const FALLBACK: NewsItem[] = [
  { id: 'f1', headline: 'Ogun State unveils Iṣẹ́yáá — Africa\'s most ambitious citizen super-platform.', source: 'Ogun State Govt' },
  { id: 'f2', headline: 'Tourism revenue doubles year-on-year as new attractions go live.',                 source: 'Iṣẹ́yáá Pulse' },
  { id: 'f3', headline: 'Vendor onboarding opens across all 20 LGAs — 0% fees for first 90 days.',          source: 'Marketplace' },
  { id: 'f4', headline: 'Eco-resort partnerships expand into Ogun Waterside and Ijebu.',                    source: 'Stays Desk' },
];

export function NewsTicker(): JSX.Element {
  const { data } = useQuery<NewsItem[]>({
    queryKey: ['news-ticker'],
    queryFn: () => fetcher('/news?limit=20'),
    staleTime: 5 * 60 * 1000,
  });

  const items = (Array.isArray(data) && data.length > 0 ? data : FALLBACK).slice(0, 20);

  // Duplicate so the marquee loops seamlessly — when translateX hits -contentWidth, reset to 0.
  const looped = [...items, ...items];

  const translateX = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;
  const [contentWidth, setContentWidth] = useState(0);

  // Marquee loop. Restart whenever the content width changes (different headline count / locale).
  useEffect(() => {
    if (contentWidth <= 0) return;
    translateX.setValue(0);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: -contentWidth,
        duration: 60000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [contentWidth, translateX]);

  // LIVE dot pulse — explicit loop (no Animated.sequence shortcut, per plan).
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.timing(dotOpacity, {
        toValue: 0.4,
        duration: 600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    // Manual two-phase oscillation: fade down then fade up.
    const animate = () => {
      Animated.timing(dotOpacity, {
        toValue: 0.4,
        duration: 600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start(animate);
      });
    };
    animate();
    return () => {
      pulse.stop();
      dotOpacity.stopAnimation();
    };
  }, [dotOpacity]);

  const onContentLayout = (e: LayoutChangeEvent) => {
    // Total width measured includes both copies; the seamless loop should reset every half.
    const totalWidth = e.nativeEvent.layout.width;
    const half = totalWidth / 2;
    if (Math.abs(half - contentWidth) > 1) {
      setContentWidth(half);
    }
  };

  const handlePress = (item: NewsItem) => {
    if (!item.link) return;
    // News API field is `link` (not `url`) — verified backend/prisma/schema.prisma:848.
    Linking.openURL(item.link).catch(() => {
      // Silently swallow — non-critical UX action.
    });
  };

  return (
    <View style={styles.container}>
      {/* Left LIVE pill — sticky over marquee */}
      <View style={styles.livePill}>
        <View style={styles.dotWrap}>
          <Animated.View
            style={[styles.dot, { opacity: dotOpacity }]}
          />
        </View>
        <Text style={styles.liveLabel}>LIVE</Text>
        <View style={styles.pulseDivider} />
        <Radio size={10} color={GOLD} strokeWidth={2} style={{ marginRight: 4 }} />
        <Text style={styles.pulseLabel}>Iṣẹ́yáá Pulse</Text>
      </View>

      {/* Marquee track */}
      <View style={styles.track}>
        <Animated.View
          onLayout={onContentLayout}
          style={[styles.marquee, { transform: [{ translateX }] }]}
        >
          {looped.map((n, i) => {
            const content = (
              <View style={styles.item}>
                <Text style={styles.source}>{(n.source ?? 'NEWS').toUpperCase()}</Text>
                <Text style={styles.separator}>·</Text>
                <Text style={styles.headline} numberOfLines={1}>
                  {n.headline}
                </Text>
              </View>
            );
            if (n.link) {
              return (
                <Pressable
                  key={`${n.id}-${i}`}
                  onPress={() => handlePress(n)}
                  accessibilityRole="link"
                  accessibilityLabel={`${n.source ?? 'News'}: ${n.headline}`}
                >
                  {content}
                </Pressable>
              );
            }
            return <View key={`${n.id}-${i}`}>{content}</View>;
          })}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 36,
    backgroundColor: SURFACE_DEEP,
    borderTopColor: BORDER_SUBTLE,
    borderBottomColor: BORDER_SUBTLE,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  livePill: {
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: SURFACE_DEEP,
    borderRightColor: BORDER_SUBTLE,
    borderRightWidth: 1,
    gap: 6,
  },
  dotWrap: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LIVE_RED,
  },
  liveLabel: {
    color: LIVE_RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  pulseDivider: {
    width: 1,
    height: 12,
    backgroundColor: BORDER_SUBTLE,
    marginHorizontal: 6,
  },
  pulseLabel: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  track: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  marquee: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  source: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  separator: {
    color: INK_FAINT,
    fontSize: 13,
  },
  headline: {
    color: INK_SECONDARY,
    fontSize: 13,
  },
});
