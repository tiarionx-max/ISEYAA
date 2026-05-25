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
import { Bell, MessageCircle, Phone, X } from 'lucide-react-native';
import { router } from 'expo-router';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_ELEV,
  FOREST,
  FOREST_LIGHT,
  GOLD,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_MID,
  SUCCESS,
  SUCCESS_TEXT,
  ERROR,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Animated SVG wrapper ───────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Driver Pulse Component ─────────────────────────
function DriverPulse({ cx, cy }: { cx: number; cy: number }) {
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
        fill="rgba(46,204,113,0.20)"
        opacity={pulseAnim}
      />
      <Circle cx={cx} cy={cy} r={10} fill={SUCCESS} />
    </G>
  );
}

// ── Live Dot Component ─────────────────────────────
function LiveDot({ color }: { color: string }) {
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
    <Animated.View
      style={[
        styles.liveDot,
        { backgroundColor: color, opacity: anim },
      ]}
    />
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

        {/* Gold route line */}
        <Path
          d="M 40 660 Q 120 560, 200 500 T 340 300"
          stroke={GOLD}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />

        {/* Origin dot at (40, 660) */}
        <Circle cx={40} cy={660} r={12} fill="rgba(212,168,67,0.2)" />
        <Circle cx={40} cy={660} r={6} fill={GOLD} />

        {/* Destination dot at (340, 300) */}
        <Circle cx={340} cy={300} r={14} fill={GOLD} stroke="#050E0E" strokeWidth={2} />

        {/* Driver pulse at (200, 500) */}
        <DriverPulse cx={200} cy={500} />
      </Svg>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────
export default function TransportFlowScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Map Layer */}
      <MapLayer />

      {/* Top Status Pill */}
      <View
        style={[
          styles.statusPill,
          { top: insets.top + 16 },
        ]}
      >
        <LiveDot color={SUCCESS_TEXT} />
        <Text style={styles.statusPillText}>Driver en route</Text>
        <TouchableOpacity style={styles.bellBtn} activeOpacity={0.75}>
          <Bell size={16} color={INK_MID} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        {/* Drag handle */}
        <View style={styles.dragHandleRow}>
          <View style={styles.dragHandle} />
        </View>

        {/* ETA + Countdown Ring */}
        <View style={styles.etaRow}>
          {/* SVG ring */}
          <View style={styles.ringWrapper}>
            <Svg width={60} height={60} viewBox="0 0 60 60">
              {/* Track */}
              <Circle
                cx={30}
                cy={30}
                r={26}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={4}
              />
              {/* Progress arc — strokeDashoffset 65 of 163.36 ≈ 60% filled */}
              <Circle
                cx={30}
                cy={30}
                r={26}
                fill="none"
                stroke={GOLD}
                strokeWidth={4}
                strokeDasharray={163.36}
                strokeDashoffset={65}
                strokeLinecap="round"
                rotation={-90}
                origin="30, 30"
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={styles.ringNumber}>4</Text>
              <Text style={styles.ringUnit}>MIN</Text>
            </View>
          </View>

          {/* Driver info */}
          <View style={styles.etaInfo}>
            <Text style={styles.etaKicker}>Arriving</Text>
            <Text style={styles.etaName}>Babatunde · 4 min away</Text>
            <Text style={styles.etaVehicle}>Toyota Corolla · ABC-123 KJA · Silver</Text>
          </View>
        </View>

        {/* Driver Row */}
        <View style={styles.driverRow}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>BO</Text>
          </View>

          {/* Name + Rating */}
          <View style={styles.driverInfo}>
            <View style={styles.driverNameRow}>
              <Text style={styles.driverName}>Babatunde Okafor</Text>
              <View style={styles.ratingChip}>
                <Text style={styles.ratingChipText}>4.9 ★ · 2,140 trips</Text>
              </View>
            </View>
            <Text style={styles.driverSpoken}>Speaks Yoruba · English</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.driverActions}>
            <TouchableOpacity style={styles.msgBtn} activeOpacity={0.75}>
              <MessageCircle size={16} color={CREAM} strokeWidth={1.8} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} activeOpacity={0.75}>
              <Phone size={16} color={SURFACE_DEEP} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Trip Route */}
        <View style={styles.tripRoute}>
          {/* Origin */}
          <View style={styles.routeRow}>
            <View style={styles.routeDotGold} />
            <Text style={styles.routePlace}>Sapon, Abeokuta</Text>
            <Text style={styles.routeTime}>now</Text>
          </View>

          {/* Dashed connector */}
          <View style={styles.routeConnector} />

          {/* Destination */}
          <View style={styles.routeRow}>
            <View style={styles.routeSquareGold} />
            <Text style={styles.routePlace}>Olumo Rock Tourist Centre</Text>
            <Text style={styles.routePrice}>₦2,450</Text>
          </View>
        </View>

        {/* Cancel Button */}
        <View style={styles.cancelWrapper}>
          <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.75} onPress={() => router.back()}>
            <X size={14} color={ERROR} strokeWidth={2} style={{ marginRight: 6 }} />
            <Text style={styles.cancelText}>Cancel ride</Text>
          </TouchableOpacity>
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

  // ── Status pill ──────────────────────────
  statusPill: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13,31,31,0.88)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER_MID,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: SUCCESS_TEXT,
    letterSpacing: 0.2,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(13,31,31,0.85)',
    borderWidth: 1,
    borderColor: BORDER_MID,
    alignItems: 'center',
    justifyContent: 'center',
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

  // ── ETA row ──────────────────────────────
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  ringWrapper: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNumber: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    color: GOLD,
    lineHeight: 18,
  },
  ringUnit: {
    fontFamily: FONT_MONO,
    fontSize: 8,
    color: INK_MID,
    letterSpacing: 0.5,
  },
  etaInfo: {
    flex: 1,
    gap: 2,
  },
  etaKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    color: GOLD,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  etaName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    color: CREAM,
    lineHeight: 22,
    marginTop: 4,
  },
  etaVehicle: {
    fontSize: 11.5,
    color: INK_MID,
    marginTop: 3,
  },

  // ── Driver row ───────────────────────────
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 14,
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
  driverInfo: {
    flex: 1,
    gap: 3,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  driverName: {
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
  driverSpoken: {
    fontSize: 11,
    color: INK_MID,
  },
  driverActions: {
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
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Trip route ───────────────────────────
  tripRoute: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: SURFACE_DEEP,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    paddingHorizontal: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeDotGold: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  routeSquareGold: {
    width: 8,
    height: 8,
    borderRadius: 1,
    backgroundColor: GOLD,
  },
  routePlace: {
    flex: 1,
    fontSize: 12.5,
    color: INK,
  },
  routeTime: {
    fontSize: 10.5,
    color: INK_MID,
  },
  routePrice: {
    fontFamily: FONT_MONO,
    fontSize: 12.5,
    color: GOLD,
  },
  routeConnector: {
    height: 14,
    marginLeft: 3.5,
    borderLeftWidth: 1,
    borderLeftColor: GOLD_LINE,
    borderStyle: 'dashed',
    marginVertical: 3,
  },

  // ── Cancel button ────────────────────────
  cancelWrapper: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  cancelBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: ERROR,
  },
});
