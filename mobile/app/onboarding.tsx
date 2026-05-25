import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  BORDER_MID,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DIM,
  CREAM,
  INK,
  INK_FAINT,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

// ── Adire ornament ────────────────────────────────────────────────────────────

function AdireOrnament({ size = 120, opacity = 0.2 }: { size?: number; opacity?: number }) {
  const s = size;
  const c = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} opacity={opacity}>
      <Rect
        x={s * 0.1}
        y={s * 0.1}
        width={s * 0.8}
        height={s * 0.8}
        fill="none"
        stroke={GOLD}
        strokeWidth={s * 0.018}
      />
      <Rect
        x={s * 0.2}
        y={s * 0.2}
        width={s * 0.6}
        height={s * 0.6}
        fill="none"
        stroke={GOLD}
        strokeWidth={s * 0.012}
      />
      <Line
        x1={s * 0.1}
        y1={s * 0.1}
        x2={s * 0.9}
        y2={s * 0.9}
        stroke={GOLD}
        strokeWidth={s * 0.01}
      />
      <Line
        x1={s * 0.9}
        y1={s * 0.1}
        x2={s * 0.1}
        y2={s * 0.9}
        stroke={GOLD}
        strokeWidth={s * 0.01}
      />
      <Circle cx={c} cy={c} r={s * 0.12} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Circle cx={c} cy={c} r={s * 0.05} fill={GOLD} />
    </Svg>
  );
}

// ── Apple icon SVG ────────────────────────────────────────────────────────────

function AppleIcon({ size = 20, color = INK }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 814 1000"
      >
        {/* Apple logo path approximated with basic SVG */}
        <Circle cx={407} cy={200} r={180} fill={color} />
        <Rect x={200} y={340} width={414} height={560} rx={60} fill={color} />
      </Svg>
    </Svg>
  );
}

// ── Google icon SVG ───────────────────────────────────────────────────────────

function GoogleColorIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill="none" stroke={GOLD} strokeWidth={1.5} />
      <Line x1={12} y1={2} x2={12} y2={22} stroke={GOLD} strokeWidth={1.5} />
      <Line x1={2} y1={12} x2={22} y2={12} stroke={GOLD} strokeWidth={1.5} />
    </Svg>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  function handlePhonePress() {
    try {
      router.push('/auth/phone' as any);
    } catch {
      Alert.alert('Coming soon', 'Phone auth screen is not yet available.');
    }
  }

  function handleApplePress() {
    Alert.alert('Apple Sign In', 'Apple sign in coming soon.');
  }

  function handleGooglePress() {
    Alert.alert('Google Sign In', 'Google sign in coming soon.');
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Hero background ──────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#2A1A2A', '#100810']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Gradient overlay scrim ───────────────────────────────────────── */}
      <LinearGradient
        colors={[
          'rgba(5,14,14,0.4)',
          'rgba(5,14,14,0.0)',
          'rgba(5,14,14,0.95)',
          SURFACE_DEEP,
        ]}
        locations={[0, 0.3, 0.78, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Adire ornament — centered at top ─────────────────────────────── */}
      <View style={styles.adireWrapper} pointerEvents="none">
        <AdireOrnament size={260} opacity={0.18} />
      </View>

      {/* ── Wordmark block ───────────────────────────────────────────────── */}
      <View style={styles.wordmarkBlock} pointerEvents="none">
        <Text style={styles.wordmarkKicker}>OGUN STATE</Text>
        <Text style={styles.wordmarkTitle}>Iseyaa</Text>
        <Text style={styles.wordmarkPronunciation}>/ee · shay · ah/</Text>
      </View>

      {/* ── Bottom content ───────────────────────────────────────────────── */}
      <View style={styles.bottomContent}>
        {/* Headline */}
        <Text style={styles.headline}>
          {'Welcome home\nto '}
          <Text style={styles.headlineItalic}>{'Ogun State.'}</Text>
        </Text>

        {/* Body text */}
        <Text style={styles.bodyText}>
          Discover, book, pay and move — all in one app, built for the people of Ogun.
        </Text>

        {/* Primary CTA */}
        <TouchableOpacity
          style={styles.primaryCta}
          onPress={handlePhonePress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue with phone number"
        >
          <Text style={styles.primaryCtaText}>Continue with phone number</Text>
        </TouchableOpacity>

        {/* Social buttons row */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={handleApplePress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Apple"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill={INK}>
              <Rect x={9} y={1} width={6} height={5} rx={2} fill={INK} />
              <Rect x={3} y={7} width={18} height={14} rx={5} fill={INK} />
            </Svg>
            <Text style={styles.socialBtnText}>Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.socialBtn}
            onPress={handleGooglePress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Rect x={2} y={2} width={9} height={9} rx={2} fill="#EA4335" />
              <Rect x={13} y={2} width={9} height={9} rx={2} fill="#4285F4" />
              <Rect x={2} y={13} width={9} height={9} rx={2} fill="#34A853" />
              <Rect x={13} y={13} width={9} height={9} rx={2} fill="#FBBC05" />
            </Svg>
            <Text style={styles.socialBtnText}>Google</Text>
          </TouchableOpacity>
        </View>

        {/* Terms */}
        <Text style={styles.termsText}>
          {'By continuing you agree to our '}
          <Text style={styles.termsLink}>Terms</Text>
          {' & '}
          <Text style={styles.termsLink}>Privacy</Text>
          {'.'}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },

  // Adire ornament centered near top
  adireWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },

  // Wordmark block
  wordmarkBlock: {
    position: 'absolute',
    top: 84,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  wordmarkKicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 4,
    color: GOLD,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  wordmarkTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 60,
    color: CREAM,
    letterSpacing: -1.5,
    lineHeight: 57, // 0.95 * 60
    fontWeight: '400',
  },
  wordmarkPronunciation: {
    fontFamily: FONT_DISPLAY,
    fontStyle: 'italic',
    fontSize: 16,
    color: GOLD_BRIGHT,
    letterSpacing: 0.5,
    marginTop: 10,
  },

  // Bottom content
  bottomContent: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 60,
    zIndex: 10,
  },
  headline: {
    fontFamily: FONT_DISPLAY,
    fontSize: 32,
    color: CREAM,
    fontWeight: '400',
    marginBottom: 12,
    lineHeight: 40,
  },
  headlineItalic: {
    fontFamily: FONT_DISPLAY,
    fontStyle: 'italic',
    color: GOLD,
  },
  bodyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.60)',
    lineHeight: 21, // 1.5 * 14
    marginBottom: 24,
    fontFamily: undefined, // system default
  },

  // Primary CTA
  primaryCta: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: SURFACE_DEEP,
    letterSpacing: 0.2,
  },

  // Social row
  socialRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  socialBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: BORDER_MID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: INK,
    letterSpacing: 0.1,
  },

  // Terms
  termsText: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 17,
  },
  termsLink: {
    color: GOLD,
    fontWeight: '600',
  },
});
