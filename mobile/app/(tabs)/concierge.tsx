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
  FOREST_LIGHT,
  GOLD,
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
              <Text style={styles.headerStatus}>Ready to help</Text>
            </View>
          </View>
        </View>
        {/* Right: history button — opens the real chat, which has its own persisted history */}
        <TouchableOpacity
          style={styles.historyBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/ai-chat' as any)}
          accessibilityRole="button"
          accessibilityLabel="Chat history"
        >
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
              <Text style={styles.boldText}>Iṣẹ́yáá</Text>
              {", your guide to Ogun State. Ask me about attractions, events, rides, food — or let me plan your whole day."}
            </Text>
          </View>
        </View>

        {/* AI – real quick actions, not a scripted conversation */}
        <View style={styles.msgRowAI}>
          <AiAvatar />
          <View style={[styles.bubbleAI, { maxWidth: '90%' }]}>
            <Text style={styles.bubbleBody}>
              Tell me what you're after, or tap a quick action below to jump straight in.
            </Text>
          </View>
        </View>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionCard}
            activeOpacity={0.85}
            onPress={() => handlePrompt('Plan my day in Ogun State')}
          >
            <View style={styles.quickActionIconBox}>
              <Sparkles size={16} color={GOLD} />
            </View>
            <Text style={styles.quickActionTitle}>Plan my day</Text>
            <Text style={styles.quickActionSub}>AI itinerary from real attractions & events</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionCard}
            activeOpacity={0.85}
            onPress={() => router.push('/transport-flow' as any)}
          >
            <View style={styles.quickActionIconBox}>
              <Car size={16} color={GOLD} />
            </View>
            <Text style={styles.quickActionTitle}>Book a ride</Text>
            <Text style={styles.quickActionSub}>Real fare estimate & driver matching</Text>
          </TouchableOpacity>
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

  // ── Quick action cards ─────────────────────────────────────────────────
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  quickActionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(212,168,67,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
  },
  quickActionSub: {
    fontSize: 10.5,
    color: INK_MID,
    lineHeight: 14,
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
