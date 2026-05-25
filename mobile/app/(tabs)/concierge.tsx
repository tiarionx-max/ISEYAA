import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  Sparkles,
  Car,
  Package,
  Clock,
  ArrowUp,
  Mic,
  Sun,
  Ticket,
  ShoppingBag,
} from 'lucide-react-native';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  FOREST,
  FOREST_LIGHT,
  FOREST_DEEP,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  BORDER,
  BORDER_MID,
  SUCCESS,
  RADIUS_SM,
  RADIUS_MD,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../../lib/api';

// ── Live dot animation ──────────────────────────────────────────────────
function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: SUCCESS,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
      }}
    />
  );
}

// ── AI Avatar ───────────────────────────────────────────────────────────
function AiAvatar() {
  return (
    <LinearGradient
      colors={[GOLD, FOREST_LIGHT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.aiAvatar}
    >
      <Sparkles size={14} color="#050E0E" />
    </LinearGradient>
  );
}

// ── Map preview (SVG dotted route) ──────────────────────────────────────
function MapPreview() {
  return (
    <LinearGradient
      colors={[FOREST_DEEP, FOREST, '#0d2018']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.mapPreview}
    >
      <Svg width="100%" height="70" viewBox="0 0 280 70">
        {/* Dotted route path */}
        <Path
          d="M 20 55 Q 60 15 120 30 Q 180 48 230 20 L 260 12"
          stroke={GOLD}
          strokeWidth={2}
          strokeDasharray="5,5"
          fill="none"
          opacity={0.75}
        />
        {/* Origin dot */}
        <Circle cx={20} cy={55} r={5} fill={GOLD} opacity={0.9} />
        {/* Destination dot */}
        <Circle cx={260} cy={12} r={5} fill={GOLD} opacity={0.9} />
        {/* Inner dots */}
        <Circle cx={20} cy={55} r={2.5} fill="#050E0E" />
        <Circle cx={260} cy={12} r={2.5} fill="#050E0E" />
      </Svg>
    </LinearGradient>
  );
}

// ── Itinerary card ──────────────────────────────────────────────────────
function ItineraryCard() {
  const items = [
    { time: '6:30AM', icon: '🧗', title: 'Olumo Rock Summit', sub: 'Abeokuta North', tint: GOLD_DIM },
    { time: '9:00AM', icon: '🍽️', title: 'Iya Eba Kitchen', sub: 'Local breakfast', tint: 'rgba(26,107,60,0.18)' },
    { time: '11:30AM', icon: '🎨', title: 'Adire Itoku Market', sub: 'Textile crafts', tint: 'rgba(26,107,60,0.18)' },
  ];
  return (
    <View style={styles.itineraryCard}>
      {items.map((item, i) => (
        <View key={i} style={[styles.itineraryRow, i < items.length - 1 && styles.itineraryRowBorder]}>
          <View style={[styles.itineraryIconBox, { backgroundColor: item.tint }]}>
            <Text style={{ fontSize: 14 }}>{item.icon}</Text>
          </View>
          <View style={styles.itineraryTextBlock}>
            <Text style={styles.itineraryTitle}>{item.title}</Text>
            <Text style={styles.itinerarySub}>{item.sub}</Text>
          </View>
          <Text style={styles.itineraryTime}>{item.time}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Ride card ────────────────────────────────────────────────────────────
function RideCard() {
  return (
    <View style={styles.rideCard}>
      <View style={styles.rideCardTop}>
        <View style={styles.rideIconBox}>
          <Car size={18} color={GOLD} />
        </View>
        <View style={styles.rideInfo}>
          <Text style={styles.rideName}>Iseyaa Comfort</Text>
          <Text style={styles.rideMeta}>14 min · 4.2 km</Text>
        </View>
        <Text style={styles.ridePrice}>₦2,450</Text>
      </View>
      <MapPreview />
      <TouchableOpacity
        style={styles.confirmRideBtn}
        activeOpacity={0.82}
        onPress={() => router.push('/transport-flow' as any)}
      >
        <Text style={styles.confirmRideBtnText}>Confirm ride →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Time greeting ────────────────────────────────────────────────────────
function getYorubaTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'E kú aaro';
  if (h < 17) return 'E kú ọsán';
  return 'E kú irọlẹ';
}

// ── Main screen ─────────────────────────────────────────────────────────
export default function ConciergeScreen() {
  const [mode, setMode] = useState<'chat' | 'ride' | 'delivery'>('chat');

  const { data: userData } = useQuery({ queryKey: ['me'], queryFn: () => fetcher('/users/me') });
  const firstName = ((userData?.data?.name ?? userData?.name) ?? '').split(' ')[0];

  const handlePrompt = (prompt: string) => {
    router.push({ pathname: '/ai-chat', params: { prompt } });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Left: icon + title + status */}
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={[GOLD, FOREST_LIGHT]}
            start={{ x: 0, y: 0.7 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerIconBox}
          >
            <Sparkles size={20} color="#050E0E" />
          </LinearGradient>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Concierge</Text>
            <View style={styles.headerStatusRow}>
              <LiveDot />
              <Text style={styles.headerStatus}>Online · responds in 2s</Text>
            </View>
          </View>
        </View>
        {/* Right: history button */}
        <TouchableOpacity style={styles.historyBtn} activeOpacity={0.8}>
          <Clock size={16} color={INK_MID} />
        </TouchableOpacity>
      </View>

      {/* ── Chat messages ───────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Message 1 – AI greeting */}
        <View style={styles.msgRowAI}>
          <AiAvatar />
          <View style={styles.bubbleAI}>
            <Text style={styles.bubbleGreeting}>{`${getYorubaTimeGreeting()}${firstName ? `, ${firstName}` : ''}.`}</Text>
            <Text style={styles.bubbleBody}>
              {"I'm "}
              <Text style={styles.boldText}>Iseyaa</Text>
              {", your guide to Ogun State. Ask me about attractions, events, rides, food — or let me plan your whole day."}
            </Text>
          </View>
        </View>

        {/* Message 2 – User */}
        <View style={styles.msgRowUser}>
          <View style={styles.bubbleUser}>
            <Text style={styles.bubbleUserText}>
              I'm visiting this weekend — what should I do Saturday?
            </Text>
          </View>
        </View>

        {/* Message 3 – AI with itinerary */}
        <View style={styles.msgRowAI}>
          <AiAvatar />
          <View style={[styles.bubbleAI, { maxWidth: '90%' }]}>
            <Text style={styles.bubbleBody}>
              Here's a curated Saturday in Abeokuta — sunrise at the rock, local breakfast, and a craft market stroll:
            </Text>
            <ItineraryCard />
            <View style={styles.itineraryActions}>
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                activeOpacity={0.82}
                onPress={() => router.push('/ai-chat' as any)}
              >
                <Text style={styles.actionBtnPrimaryText}>Save to plans</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                activeOpacity={0.82}
                onPress={() => router.push('/ai-chat' as any)}
              >
                <Text style={styles.actionBtnSecondaryText}>Tweak</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Message 4 – User */}
        <View style={styles.msgRowUser}>
          <View style={styles.bubbleUser}>
            <Text style={styles.bubbleUserText}>
              Book me a ride for 6 AM to Olumo Rock.
            </Text>
          </View>
        </View>

        {/* Message 5 – AI with ride card */}
        <View style={styles.msgRowAI}>
          <AiAvatar />
          <View style={[styles.bubbleAI, { maxWidth: '90%' }]}>
            <Text style={styles.bubbleBody}>
              Found the best option for your 6 AM pickup — arrives in 14 minutes once you confirm:
            </Text>
            <RideCard />
          </View>
        </View>

        {/* ── Suggested prompts ──────────────────────────────────────── */}
        <View style={styles.suggestedRow}>
          <TouchableOpacity
            style={styles.promptChip}
            activeOpacity={0.8}
            onPress={() => handlePrompt('Plan my Sunday')}
          >
            <Sun size={13} color={GOLD} />
            <Text style={styles.promptChipText}>Plan my Sunday</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.promptChip}
            activeOpacity={0.8}
            onPress={() => handlePrompt("What's on tonight?")}
          >
            <Ticket size={13} color={GOLD} />
            <Text style={styles.promptChipText}>What's on tonight?</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.promptChip}
            activeOpacity={0.8}
            onPress={() => handlePrompt('Order dinner')}
          >
            <ShoppingBag size={13} color={GOLD} />
            <Text style={styles.promptChipText}>Order dinner</Text>
          </TouchableOpacity>
        </View>

        {/* Spacer to clear floating input */}
        <View style={{ height: 220 }} />
      </ScrollView>

      {/* ── Floating bottom ─────────────────────────────────────────── */}
      <View style={styles.floatingBottom} pointerEvents="box-none">
        {/* Mode switcher */}
        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'chat' && styles.modeBtnActive]}
            onPress={() => setMode('chat')}
            activeOpacity={0.8}
          >
            <Sparkles size={14} color={mode === 'chat' ? '#050E0E' : INK_MID} />
            <Text style={[styles.modeBtnText, mode === 'chat' && styles.modeBtnTextActive]}>
              Chat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'ride' && styles.modeBtnActive]}
            onPress={() => {
              setMode('ride');
              router.push('/transport-flow' as any);
            }}
            activeOpacity={0.8}
          >
            <Car size={14} color={mode === 'ride' ? '#050E0E' : INK_MID} />
            <Text style={[styles.modeBtnText, mode === 'ride' && styles.modeBtnTextActive]}>
              Ride
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'delivery' && styles.modeBtnActive]}
            onPress={() => {
              setMode('delivery');
              router.push('/delivery-flow' as any);
            }}
            activeOpacity={0.8}
          >
            <Package size={14} color={mode === 'delivery' ? '#050E0E' : INK_MID} />
            <Text style={[styles.modeBtnText, mode === 'delivery' && styles.modeBtnTextActive]}>
              Delivery
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            placeholder="Ask anything, in any language…"
            placeholderTextColor={INK_MID}
            onFocus={() => router.push('/ai-chat')}
          />
          <TouchableOpacity style={styles.micBtn} activeOpacity={0.8}>
            <Mic size={16} color={INK_MID} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sendBtn}
            activeOpacity={0.82}
            onPress={() => router.push('/ai-chat')}
          >
            <ArrowUp size={16} color="#050E0E" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },

  // ── Header ──────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(212,168,67,0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  headerTitleBlock: {
    gap: 3,
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    fontWeight: '400',
    color: INK,
    lineHeight: 26,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerStatus: {
    fontSize: 10.5,
    color: INK_MID,
    lineHeight: 14,
  },
  historyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scroll ───────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
    paddingBottom: 220,
  },

  // ── AI Avatar ────────────────────────────────────────────────────────
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: RADIUS_SM,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
    flexShrink: 0,
  },

  // ── Message rows ─────────────────────────────────────────────────────
  msgRowAI: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  msgRowUser: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },

  // ── AI bubble ────────────────────────────────────────────────────────
  bubbleAI: {
    flex: 1,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    padding: 12,
    gap: 8,
  },
  bubbleGreeting: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '400',
    color: CREAM,
    lineHeight: 24,
    marginBottom: 4,
  },
  bubbleBody: {
    fontSize: 13,
    color: INK_MID,
    lineHeight: 19,
  },
  boldText: {
    fontWeight: '700',
    color: INK,
  },

  // ── User bubble ──────────────────────────────────────────────────────
  bubbleUser: {
    maxWidth: '78%',
    backgroundColor: GOLD,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUserText: {
    fontSize: 13,
    color: '#050E0E',
    lineHeight: 19,
    fontWeight: '500',
  },

  // ── Itinerary card ────────────────────────────────────────────────────
  itineraryCard: {
    backgroundColor: SURFACE_DEEP,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
  },
  itineraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 10,
  },
  itineraryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  itineraryIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itineraryTextBlock: {
    flex: 1,
    gap: 1,
  },
  itineraryTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: INK,
    lineHeight: 17,
  },
  itinerarySub: {
    fontSize: 10.5,
    color: INK_MID,
    lineHeight: 14,
  },
  itineraryTime: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    color: GOLD,
    lineHeight: 14,
    flexShrink: 0,
  },

  // ── Itinerary action buttons ──────────────────────────────────────────
  itineraryActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtnPrimary: {
    flex: 1,
    height: 36,
    backgroundColor: GOLD,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#050E0E',
  },
  actionBtnSecondary: {
    flex: 1,
    height: 36,
    backgroundColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnSecondaryText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: GOLD,
  },

  // ── Ride card ─────────────────────────────────────────────────────────
  rideCard: {
    backgroundColor: SURFACE_DEEP,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  rideCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rideIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(212,168,67,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rideInfo: {
    flex: 1,
    gap: 2,
  },
  rideName: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    lineHeight: 18,
  },
  rideMeta: {
    fontSize: 11.5,
    color: INK_MID,
    lineHeight: 15,
  },
  ridePrice: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    color: GOLD,
    fontWeight: '700',
    lineHeight: 20,
  },

  // ── Map preview ───────────────────────────────────────────────────────
  mapPreview: {
    height: 70,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Confirm ride button ───────────────────────────────────────────────
  confirmRideBtn: {
    height: 40,
    backgroundColor: GOLD,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmRideBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#050E0E',
    letterSpacing: 0.2,
  },

  // ── Suggested prompts ─────────────────────────────────────────────────
  suggestedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(212,168,67,0.15)',
    borderWidth: 1,
    borderColor: GOLD_LINE,
    borderRadius: 99,
  },
  promptChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: GOLD,
    lineHeight: 16,
  },

  // ── Floating bottom ───────────────────────────────────────────────────
  floatingBottom: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    zIndex: 35,
    paddingHorizontal: 16,
    gap: 8,
  },

  // ── Mode switcher ─────────────────────────────────────────────────────
  modeSwitcher: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(13,31,31,0.85)',
    borderWidth: 1,
    borderColor: BORDER_MID,
    borderRadius: 14,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modeBtnActive: {
    backgroundColor: GOLD,
  },
  modeBtnText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: INK_MID,
    lineHeight: 16,
  },
  modeBtnTextActive: {
    fontWeight: '700',
    color: '#050E0E',
  },

  // ── Input bar ─────────────────────────────────────────────────────────
  inputBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_MID,
    borderRadius: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  inputField: {
    flex: 1,
    fontSize: 13,
    color: INK,
    lineHeight: 18,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
