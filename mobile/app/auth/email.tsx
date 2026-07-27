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
import * as SecureStore from 'expo-secure-store';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { Eye, EyeOff } from 'lucide-react-native';
import { api, getErrorMessage } from '../../lib/api';
import { registerForPushNotifications } from '../../lib/push-notifications';
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

export default function EmailScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isReady = /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  async function handleSignIn() {
    if (!isReady || loading) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { identifier: email, password });
      const payload = res.data?.data ?? res.data ?? {};
      const { accessToken, refreshToken } = payload;
      if (accessToken) {
        await SecureStore.setItemAsync('access_token', accessToken);
        if (refreshToken) await SecureStore.setItemAsync('refresh_token', refreshToken);
        registerForPushNotifications();
        router.replace('/(tabs)' as any);
      } else {
        Alert.alert('Error', 'Unexpected response from server. Please try again.');
      }
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Invalid email or password.');
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  }

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
        <Text style={styles.title}>Your email{'\n'}<Text style={styles.titleItalic}>address</Text></Text>
        <Text style={styles.sub}>Sign in with the email and password you registered with.</Text>

        <View style={[styles.inputWrapper, email.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="you@example.com"
            placeholderTextColor="rgba(245,237,214,0.25)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            autoFocus
          />
        </View>

        <View style={[styles.inputWrapper, password.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="••••••••••"
            placeholderTextColor="rgba(245,237,214,0.25)"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} color={INK_MID} /> : <Eye size={18} color={INK_MID} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.cta, !isReady && styles.ctaDisabled]}
          onPress={handleSignIn}
          disabled={!isReady || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#050E0E" />
            : <Text style={styles.ctaText}>Sign in →</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/auth/phone' as any)}
          style={styles.altLink}
          activeOpacity={0.7}
        >
          <Text style={styles.altLinkText}>Prefer a phone number? →</Text>
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
  textInput: {
    flex: 1,
    fontSize: 16,
    color: CREAM,
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
  altLink: { marginTop: 20, alignItems: 'center' },
  altLinkText: { fontSize: 13, color: GOLD, fontWeight: '600' },
  backLink: { marginTop: 16, alignItems: 'center' },
  backLinkText: { fontSize: 13, color: INK_MID },
});
