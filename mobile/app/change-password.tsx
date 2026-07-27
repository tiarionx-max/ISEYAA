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
import { router } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { api, getErrorMessage } from '../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_LINE,
  CREAM,
  INK_MID,
} from '../lib/tokens';

export default function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordsMismatch =
    newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;

  const isReady =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !loading;

  async function handleUpdatePassword() {
    if (!isReady) return;
    setLoading(true);
    try {
      await api.patch('/users/me/password', { currentPassword, newPassword });
      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Could not update password. Please try again.');
      Alert.alert('Update failed', msg);
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

      <View style={styles.content}>
        <Text style={styles.sub}>
          Enter your current password and choose a new one. You'll stay signed in.
        </Text>

        <View style={[styles.inputWrapper, currentPassword.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="Current password"
            placeholderTextColor="rgba(245,237,214,0.25)"
            secureTextEntry={!showCurrentPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => setShowCurrentPassword((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showCurrentPassword ? 'Hide password' : 'Show password'}
          >
            {showCurrentPassword ? <EyeOff size={18} color={INK_MID} /> : <Eye size={18} color={INK_MID} />}
          </TouchableOpacity>
        </View>

        <View style={[styles.inputWrapper, newPassword.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="New password"
            placeholderTextColor="rgba(245,237,214,0.25)"
            secureTextEntry={!showNewPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TouchableOpacity
            onPress={() => setShowNewPassword((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
          >
            {showNewPassword ? <EyeOff size={18} color={INK_MID} /> : <Eye size={18} color={INK_MID} />}
          </TouchableOpacity>
        </View>

        <View style={[styles.inputWrapper, confirmPassword.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="Confirm new password"
            placeholderTextColor="rgba(245,237,214,0.25)"
            secureTextEntry={!showNewPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>

        {passwordsMismatch && (
          <Text style={styles.mismatchText}>Passwords do not match.</Text>
        )}

        <TouchableOpacity
          style={[styles.cta, !isReady && styles.ctaDisabled]}
          onPress={handleUpdatePassword}
          disabled={!isReady}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#050E0E" />
            : <Text style={styles.ctaText}>Update password</Text>
          }
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
    paddingTop: 24,
  },
  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    lineHeight: 21,
    marginBottom: 28,
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
  mismatchText: {
    fontSize: 12,
    color: '#E5484D',
    marginTop: -8,
    marginBottom: 16,
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
});
