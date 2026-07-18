import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ChevronLeft,
  MessageSquare,
  MessageCircle,
  Mail,
  CheckCircle2,
  type LucideProps,
} from 'lucide-react-native';
import { api, fetcher } from '../lib/api';
import {
  SURFACE_MID,
  SURFACE_RAISED,
  SURFACE_HIGH,
  GOLD,
  GOLD_DIM,
  INK,
  INK_SECONDARY,
  INK_FAINT,
  BORDER_SUBTLE,
  ERROR_TEXT,
} from '../lib/tokens';

// expo-haptics — loaded dynamically so missing package is a runtime no-op, not a TS error
// (mirrors mobile/app/(tabs)/profile.tsx's optional-require pattern)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Haptics: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch (_) {
  // Package not installed — haptic feedback is silently skipped
}

// ── Types ──────────────────────────────────────────────────────────────────
type OtpChannel = 'SMS' | 'WHATSAPP' | 'EMAIL';

interface Me {
  otpChannel?: OtpChannel;
}

interface ChannelOption {
  key: OtpChannel;
  Icon: React.ComponentType<LucideProps>;
  label: string;
  sub: string;
}

const CHANNEL_OPTIONS: ChannelOption[] = [
  { key: 'SMS', Icon: MessageSquare, label: 'SMS', sub: 'Delivered via text message' },
  { key: 'WHATSAPP', Icon: MessageCircle, label: 'WhatsApp', sub: 'Delivered via WhatsApp' },
  { key: 'EMAIL', Icon: Mail, label: 'Email', sub: 'Delivered via email' },
];

// ── Screen ───────────────────────────────────────────────────────────────
export default function OtpChannelSettingsScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const [channel, setChannel] = useState<OtpChannel | undefined>(user?.otpChannel);
  const [saving, setSaving] = useState<OtpChannel | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (user?.otpChannel) {
      setChannel(user.otpChannel);
    }
  }, [user?.otpChannel]);

  async function handleSelect(newChannel: OtpChannel) {
    if (newChannel === channel || saving) return;

    const previousChannel = channel;
    setChannel(newChannel);
    setSaving(newChannel);
    setError(false);

    try {
      await api.patch('/users/me/otp-channel', { channel: newChannel });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      if (Haptics) {
        try {
          await Haptics.selectionAsync();
        } catch (_) {
          // silently skip
        }
      }
    } catch (_) {
      setChannel(previousChannel);
      setError(true);
    } finally {
      setSaving(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={INK} />
        </Pressable>
        <Text style={styles.title}>Verification Channel</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.subheading}>
          Choose how you&apos;d like to receive your verification codes.
        </Text>

        <View
          style={styles.optionGroup}
          accessibilityRole="radiogroup"
          accessibilityLabel="Verification channel"
        >
          {CHANNEL_OPTIONS.map((option, index) => {
            const selected = channel === option.key;
            const isSaving = saving === option.key;
            const { Icon } = option;

            return (
              <Pressable
                key={option.key}
                style={[
                  styles.optionRow,
                  index < CHANNEL_OPTIONS.length - 1 && styles.optionRowBorder,
                ]}
                onPress={() => handleSelect(option.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected, busy: isSaving }}
                accessibilityLabel={`${option.label} verification channel`}
              >
                <View
                  style={[
                    styles.iconBox,
                    selected ? styles.iconBoxSelected : styles.iconBoxUnselected,
                  ]}
                >
                  <Icon size={16} color={selected ? GOLD : INK_SECONDARY} />
                </View>
                <View style={styles.textBlock}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionSub}>{option.sub}</Text>
                </View>
                <View style={styles.trailing}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color={GOLD} accessibilityState={{ busy: true }} />
                  ) : selected ? (
                    <CheckCircle2 size={20} color={GOLD} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {error && (
          <Text style={styles.errorText}>
            Could not update your verification channel. Please try again.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_MID,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: INK,
    marginLeft: 4,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '400',
    color: INK_SECONDARY,
    lineHeight: 21,
    marginBottom: 24,
  },
  optionGroup: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  optionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSelected: {
    backgroundColor: GOLD_DIM,
  },
  iconBoxUnselected: {
    backgroundColor: SURFACE_HIGH,
  },
  textBlock: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: INK,
  },
  optionSub: {
    fontSize: 12,
    fontWeight: '400',
    color: INK_FAINT,
  },
  trailing: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '400',
    color: ERROR_TEXT,
    marginTop: 8,
  },
});
