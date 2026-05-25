import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { ArrowLeft, MessageCircle, Bell } from 'lucide-react-native';
import { router } from 'expo-router';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_ELEV,
  FOREST,
  FOREST_LIGHT,
  GOLD,
  GOLD_LINE,
  CARD_GRADIENTS,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_MID,
  SUCCESS,
  SUCCESS_TEXT,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Animated SVG circle wrapper ────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Courier Pulse (gold inner dot) ────────────────
function CourierPulse({ cx, cy }: { cx: number; cy: number }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <G>
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={22}
        fill="rgba(212,168,67,0.20)"
        opacity={pulseAnim}
      />
      <Circle cx={cx} cy={cy} r={10} fill={GOLD} />
    </G>
  );
}

// ── Gold live dot ──────────────────────────────────
function LiveDotGold() {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);

  return (
    <Animated.View style={[styles.liveDot, { opacity: anim }]} />
  );
}

// ── Map Layer ──────────────────────────────────────
function MapLayer() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#0d2018', '#1a3a2a', '#0d2018']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width={SCREEN_W}
        height={SCREEN_H}
        viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}
        style={StyleSheet.absoluteFill}
      >
        {/* Street lines */}
        <Path
          d="M -20 200 Q 120 220, 200 250 T 420 280"
          stroke="rgba(245,237,214,0.10)"
          strokeWidth={1}
          fill="none"
        />
        <Path
          d="M -20 360 Q 150 380, 240 360 T 420 410"
          stroke="rgba(245,237,214,0.10)"
          strokeWidth={1}
          fill="none"
        />
        <Path
          d="M -20 540 Q 100 520, 200 560 T 420 540"
          stroke="rgba(245,237,214,0.10)"
          strokeWidth={1}
          fill="none"
        />
        <Path
          d="M 80 -20 L 100 900"
          stroke="rgba(245,237,214,0.10)"
          strokeWidth={1}
          fill="none"
        />
        <Path
          d="M 300 -20 L 280 900"
          stroke="rgba(245,237,214,0.10)"
          strokeWidth={1}
          fill="none"
        />

        {/* Dashed gold delivery route */}
        <Path
          d="M 90 580 Q 180 450, 220 340 T 320 200"
          stroke={GOLD}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray="2 6"
          fill="none"
        />

        {/* Restaurant dot at (90, 580) */}
        <Circle cx={90} cy={580} r={14} fill={FOREST_LIGHT} stroke="#050E0E" strokeWidth={2} />

        {/* Courier pulse at (220, 340) */}
        <CourierPulse cx={220} cy={340} />

        {/* Home destination at (320, 200) */}
        <Circle cx={320} cy={200} r={14} fill={GOLD} stroke="#050E0E" strokeWidth={2} />
      </Svg>
    </View>
  );
}

// ── Progress steps data ────────────────────────────
const STEPS = [
  { label: 'Ordered', done: true },
  { label: 'Prepared', done: true },
  { label: 'En route', done: false, active: true },
  { label: 'Delivered', done: false },
];

// ── Order items data ───────────────────────────────
const ORDER_ITEMS = [
  { q: '1×', name: 'Ofada rice & ayamashe', price: '₦2,400' },
  { q: '1×', name: 'Suya wrap (beef, hot)', price: '₦1,400' },
  { q: '2×', name: 'Zobo drink', price: '₦450 ea' },
];

// ── Main Screen ────────────────────────────────────
export default function DeliveryFlowScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Map Layer */}
      <MapLayer />

      {/* Top Status Bar */}
      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.75} onPress={() => router.back()}>
          <ArrowLeft size={18} color={INK_MID} strokeWidth={1.8} />
        </TouchableOpacity>

        {/* Status pill */}
        <View style={styles.statusPill}>
          <LiveDotGold />
          <Text style={styles.statusPillText}>On the way</Text>
          <Text style={styles.statusArrival}>ARR 12:18 PM</Text>
        </View>
      </View>

      {/* Bottom Sheet */}
      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        {/* Drag handle */}
        <View style={styles.dragHandleRow}>
          <View style={styles.dragHandle} />
        </View>

        {/* Header */}
        <View style={styles.headerRow}>
          {/* Restaurant photo box */}
          <LinearGradient
            colors={CARD_GRADIENTS.gold}
            style={styles.restaurantBox}
          >
            <View style={styles.restaurantBoxInner} />
          </LinearGradient>

          {/* Restaurant info */}
          <View style={styles.headerInfo}>
            <Text style={styles.restaurantName}>Iya Eba Kitchen</Text>
            <Text style={styles.orderMeta}>3 items · ₦4,250 · paid</Text>
          </View>
        </View>

        {/* Progress Steps */}
        <View style={styles.progressSection}>
          {/* Background track */}
          <View style={styles.progressTrack} />
          {/* Progress fill — 3 of 4 steps complete (active on step 3 = ~60%) */}
          <LinearGradient
            colors={[FOREST_LIGHT, GOLD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressFill}
          />

          {/* Step dots + labels */}
          <View style={styles.stepsRow}>
            {STEPS.map((step, i) => (
              <View key={i} style={styles.stepItem}>
                <View
                  style={[
                    styles.stepDot,
                    step.done
                      ? styles.stepDotDone
                      : step.active
                        ? styles.stepDotActive
                        : styles.stepDotPending,
                  ]}
                >
                  {step.done && (
                    <Text style={styles.stepCheckmark}>✓</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    step.done || step.active ? styles.stepLabelActive : styles.stepLabelPending,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Courier Row */}
        <View style={styles.courierRow}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>SO</Text>
          </View>

          {/* Info */}
          <View style={styles.courierInfo}>
            <View style={styles.courierNameRow}>
              <Text style={styles.courierName}>Sola Ogundimu</Text>
              <View style={styles.ratingChip}>
                <Text style={styles.ratingChipText}>4.8 ★</Text>
              </View>
            </View>
            <Text style={styles.courierVehicle}>Honda CG · ABJ-441 KJA · Courier</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.courierActions}>
            <TouchableOpacity style={styles.msgBtn} activeOpacity={0.75}>
              <MessageCircle size={16} color={CREAM} strokeWidth={1.8} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifyBtn} activeOpacity={0.75}>
              <Bell size={14} color={SURFACE_DEEP} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Order Items */}
        <View style={styles.orderItems}>
          {ORDER_ITEMS.map((item, i) => (
            <View
              key={i}
              style={[
                styles.orderItemRow,
                i < ORDER_ITEMS.length - 1 && styles.orderItemBorder,
              ]}
            >
              <Text style={styles.orderItemQty}>{item.q}</Text>
              <Text style={styles.orderItemName}>{item.name}</Text>
              <Text style={styles.orderItemPrice}>{item.price}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d2018',
  },

  // ── Top bar ──────────────────────────────
  topBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(13,31,31,0.85)',
    borderWidth: 1,
    borderColor: BORDER_MID,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13,31,31,0.85)',
    borderWidth: 1,
    borderColor: BORDER_MID,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  statusPillText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: CREAM,
  },
  statusArrival: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: GOLD,
    letterSpacing: 0.3,
  },

  // ── Bottom sheet ─────────────────────────
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: SURFACE_MID,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 24,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
  },

  // ── Header ───────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  restaurantBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantBoxInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(212,168,67,0.30)',
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  restaurantName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    color: CREAM,
    lineHeight: 24,
  },
  orderMeta: {
    fontSize: 11,
    color: INK_MID,
  },

  // ── Progress steps ───────────────────────
  progressSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
    position: 'relative',
  },
  progressTrack: {
    position: 'absolute',
    top: 32,
    left: 32,
    right: 32,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    position: 'absolute',
    top: 32,
    left: 32,
    width: '60%',
    height: 2,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stepItem: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: GOLD,
  },
  stepDotActive: {
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  stepDotPending: {
    backgroundColor: SURFACE_ELEV,
    borderWidth: 1.5,
    borderColor: INK_FAINT,
    borderStyle: 'dashed',
  },
  stepCheckmark: {
    fontSize: 11,
    color: SURFACE_DEEP,
    fontWeight: '700',
  },
  stepLabel: {
    fontFamily: FONT_MONO,
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: GOLD,
  },
  stepLabelPending: {
    color: INK_FAINT,
  },

  // ── Courier row ──────────────────────────
  courierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: SURFACE_DEEP,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    paddingHorizontal: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SURFACE_ELEV,
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    color: CREAM,
  },
  courierInfo: {
    flex: 1,
    gap: 3,
  },
  courierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  courierName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: INK,
  },
  ratingChip: {
    backgroundColor: 'rgba(42,139,82,0.22)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  ratingChipText: {
    fontSize: 10.5,
    color: '#7DD49E',
    fontWeight: '500',
  },
  courierVehicle: {
    fontSize: 11,
    color: INK_MID,
  },
  courierActions: {
    flexDirection: 'row',
    gap: 8,
  },
  msgBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: FOREST,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifyBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Order items ──────────────────────────
  orderItems: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: SURFACE_DEEP,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    paddingHorizontal: 14,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  orderItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  orderItemQty: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: GOLD,
    minWidth: 22,
  },
  orderItemName: {
    flex: 1,
    fontSize: 12.5,
    color: INK,
  },
  orderItemPrice: {
    fontFamily: FONT_MONO,
    fontSize: 11.5,
    color: INK_MID,
  },
});
