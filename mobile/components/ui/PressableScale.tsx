import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

// expo-haptics — loaded dynamically so a missing package is a runtime no-op, not a crash.
// Pattern mirrors mobile/app/(tabs)/profile.tsx (lines 18-26).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Haptics: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch (_) {
  // Package not installed — haptic feedback is silently skipped.
}

export type PressableScaleProps = {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  /** 'light' | 'medium' | null. null = no haptic. Default: 'light'. */
  hapticStyle?: 'light' | 'medium' | null;
};

// UI-SPEC §Cards Standard press state — scale to 0.97 with reanimated spring.
const PRESSED_SCALE = 0.97;
const RELEASE_SCALE = 1;

export function PressableScale({
  onPress,
  onLongPress,
  style,
  children,
  disabled = false,
  hapticStyle = 'light',
}: PressableScaleProps): JSX.Element {
  const scale = useSharedValue(RELEASE_SCALE);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(PRESSED_SCALE, { stiffness: 400, damping: 25 });
    if (!Haptics || hapticStyle === null) return;
    try {
      const styleEnum =
        hapticStyle === 'medium'
          ? Haptics.ImpactFeedbackStyle?.Medium
          : Haptics.ImpactFeedbackStyle?.Light;
      Haptics.impactAsync?.(styleEnum);
    } catch (_) {
      // Swallow — haptics are non-essential UX polish.
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(RELEASE_SCALE, { stiffness: 300, damping: 20 });
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      // Enforce iOS HIG minimum touch target (44pt) at the interactive root.
      style={{ minHeight: 44 }}
    >
      <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}
