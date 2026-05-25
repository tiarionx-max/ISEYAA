import React, { useState, useRef, useEffect } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function verify(value: string) {
    if (value.length !== OTP_LENGTH || loading) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/phone-auth', { phone, otp: value });
      const payload = res.data?.data ?? res.data ?? {};
      const { accessToken, refreshToken } = payload;
      if (accessToken) {
        await SecureStore.setItemAsync('access_token', accessToken);
        if (refreshToken) await SecureStore.setItemAsync('refresh_token', refreshToken);
        router.replace('/(tabs)' as any);
      } else {
        Alert.alert('Error', 'Unexpected response from server. Please try again.');
        setCode('');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Incorrect or expired code.';
      Alert.alert('Wrong code', msg);
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      await api.post('/auth/otp/send', { phone });
      setCooldown(60);
    } catch {
      Alert.alert('Error', 'Could not resend OTP.');
    }
  }

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    if (digits.length === OTP_LENGTH) verify(digits);
  }

  const digits = code.padEnd(OTP_LENGTH, ' ').split('');
  const maskedPhone = phone
    ? `${phone.slice(0, 6)}•••${phone.slice(-3)}`
    : 'your number';

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

      <View style={styles.content}>
        <Text style={styles.kicker}>VERIFY</Text>
        <Text style={styles.title}>Enter the{'\n'}<Text style={styles.titleItalic}>6-digit code</Text></Text>
        <Text style={styles.sub}>Sent to {maskedPhone}</Text>

        {/* OTP boxes — tap to focus hidden input */}
        <TouchableOpacity
          style={styles.otpRow}
          activeOpacity={1}
          onPress={() => inputRef.current?.focus()}
          accessibilityLabel="OTP input"
        >
          {digits.map((d, i) => {
            const isFocused = code.length === i;
            const filled = d.trim() !== '';
            return (
              <View
                key={i}
                style={[
                  styles.otpBox,
                  isFocused && styles.otpBoxFocused,
                  filled && styles.otpBoxFilled,
                ]}
              >
                {loading && filled ? (
                  <ActivityIndicator size="small" color={GOLD} />
                ) : (
                  <Text style={styles.otpDigit}>{d.trim()}</Text>
                )}
              </View>
            );
          })}
        </TouchableOpacity>

        {/* Hidden input that captures keyboard */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          autoFocus
          caretHidden
        />

        {/* Resend */}
        <View style={styles.resendRow}>
          {cooldown > 0 ? (
            <Text style={styles.resendCooldown}>Resend in {cooldown}s</Text>
          ) : (
            <TouchableOpacity onPress={resend}>
              <Text style={styles.resendLink}>Resend code</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink} activeOpacity={0.7}>
          <Text style={styles.backLinkText}>← Change number</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
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
    marginBottom: 36,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  otpBox: {
    flex: 1,
    height: 60,
    borderRadius: 14,
    backgroundColor: SURFACE_MID,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFocused: {
    borderColor: GOLD,
    backgroundColor: 'rgba(212,168,67,0.07)',
  },
  otpBoxFilled: {
    borderColor: GOLD_LINE,
  },
  otpDigit: {
    fontFamily: FONT_MONO,
    fontSize: 26,
    color: CREAM,
    fontWeight: '600',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
    left: -999,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 12,
  },
  resendCooldown: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: INK_FAINT,
    letterSpacing: 0.4,
  },
  resendLink: {
    fontSize: 13,
    color: GOLD,
    fontWeight: '600',
  },
  backLink: { marginTop: 28, alignItems: 'center' },
  backLinkText: { fontSize: 13, color: INK_MID },
});
