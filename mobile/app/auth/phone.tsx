import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { api } from '../../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_LINE,
  CREAM,
  INK_MID,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';

function AdireOrnament({ size = 160, opacity = 0.12 }: { size?: number; opacity?: number }) {
  const s = size;
  const c = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} opacity={opacity}>
      <Rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} fill="none" stroke={GOLD} strokeWidth={s * 0.018} />
      <Rect x={s * 0.2} y={s * 0.2} width={s * 0.6} height={s * 0.6} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Line x1={s * 0.1} y1={s * 0.1} x2={s * 0.9} y2={s * 0.9} stroke={GOLD} strokeWidth={s * 0.01} />
      <Line x1={s * 0.9} y1={s * 0.1} x2={s * 0.1} y2={s * 0.9} stroke={GOLD} strokeWidth={s * 0.01} />
      <Circle cx={c} cy={c} r={s * 0.12} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Circle cx={c} cy={c} r={s * 0.05} fill={GOLD} />
    </Svg>
  );
}

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const formattedPhone = phone.startsWith('0')
    ? `+234${phone.slice(1)}`
    : phone.startsWith('+')
    ? phone
    : phone.length > 0
    ? `+234${phone}`
    : '';

  async function handleContinue() {
    if (formattedPhone.length < 13) {
      Alert.alert('Invalid number', 'Please enter a valid Nigerian phone number (e.g. 0801 234 5678).');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/otp/send', { phone: formattedPhone });
      router.push({ pathname: '/auth/otp', params: { phone: formattedPhone } } as any);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Could not send OTP. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  const isReady = phone.replace(/\s/g, '').length >= 10;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#2A1A2A', '#100810']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(5,14,14,0.4)', 'rgba(5,14,14,0.0)', 'rgba(5,14,14,0.95)', SURFACE_DEEP]}
        locations={[0, 0.3, 0.78, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.adireWrapper} pointerEvents="none">
        <AdireOrnament />
      </View>

      <View style={styles.content}>
        <Text style={styles.kicker}>SIGN IN</Text>
        <Text style={styles.title}>Your phone{'\n'}<Text style={styles.titleItalic}>number</Text></Text>
        <Text style={styles.sub}>We'll send a one-time code to verify it's you.</Text>

        <View style={[styles.inputWrapper, phone.length > 0 && styles.inputWrapperActive]}>
          <View style={styles.countryPill}>
            <Text style={styles.flag}>🇳🇬</Text>
            <Text style={styles.dialCode}>+234</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="0801 234 5678"
            placeholderTextColor="rgba(245,237,214,0.25)"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={11}
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={[styles.cta, !isReady && styles.ctaDisabled]}
          onPress={handleContinue}
          disabled={!isReady || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#050E0E" />
            : <Text style={styles.ctaText}>Send code →</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink} activeOpacity={0.7}>
          <Text style={styles.backLinkText}>← Back to welcome</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  adireWrapper: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingBottom: 50,
  },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 3,
    color: GOLD,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 42,
    color: CREAM,
    lineHeight: 50,
    fontWeight: '400',
    marginBottom: 12,
  },
  titleItalic: {
    fontFamily: FONT_DISPLAY,
    fontStyle: 'italic',
    color: GOLD,
  },
  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    lineHeight: 21,
    marginBottom: 32,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE_MID,
    borderWidth: 1.5,
    borderColor: 'rgba(212,168,67,0.25)',
    borderRadius: 16,
    height: 62,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 16,
  },
  inputWrapperActive: {
    borderColor: GOLD_LINE,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: GOLD_LINE,
  },
  flag: { fontSize: 18 },
  dialCode: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: GOLD,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    fontSize: 20,
    color: CREAM,
    letterSpacing: 1.5,
    height: '100%',
  },
  cta: {
    height: 56,
    borderRadius: 16,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaDisabled: { opacity: 0.42 },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#050E0E',
    letterSpacing: 0.2,
  },
  backLink: { marginTop: 22, alignItems: 'center' },
  backLinkText: { fontSize: 13, color: INK_MID },
});
