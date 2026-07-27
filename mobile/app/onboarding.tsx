import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DIM,
  CREAM,
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  function handlePhonePress() {
    router.push('/auth/phone' as any);
  }

  function handleEmailPress() {
    router.push('/auth/email' as any);
  }

  function handleRegisterPress() {
    router.push('/auth/register' as any);
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
        <Text style={styles.wordmarkTitle}>Iṣẹ́yáá</Text>
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
          onPress={handleEmailPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue with email"
        >
          <Text style={styles.primaryCtaText}>Continue with email</Text>
        </TouchableOpacity>

        {/* Phone sign-in entry point */}
        <TouchableOpacity
          style={styles.emailLink}
          onPress={handlePhonePress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Continue with phone number instead"
        >
          <Text style={styles.emailLinkText}>Continue with phone number instead</Text>
        </TouchableOpacity>

        {/* Registration entry point */}
        <TouchableOpacity
          style={styles.emailLink}
          onPress={handleRegisterPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Create a new account"
        >
          <Text style={styles.emailLinkText}>New to Iṣẹ́yáá? Create an account</Text>
        </TouchableOpacity>

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

  // Email sign-in entry point
  emailLink: {
    alignItems: 'center',
    marginBottom: 16,
  },
  emailLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: GOLD,
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
