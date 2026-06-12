import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import {
  BORDER_SUBTLE,
  GOLD,
  GOLD_BORDER,
  GOLD_DIM,
  INK_SECONDARY,
  RADIUS_PILL,
  SURFACE_RAISED,
} from '../../lib/tokens';

import { PressableScale } from './PressableScale';

export type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
};

/**
 * UI-SPEC §4 Chips/Pills.
 * - minHeight 32 (touch-target floor satisfied via surrounding paddingVertical 8 + PressableScale's 44pt floor).
 * - Pill radius, surface-raised default, gold-dim active.
 * - Icon (when supplied) renders at 14px to the left of the label, color matches text.
 */
export function Chip({
  label,
  active = false,
  onPress,
  icon: Icon,
  style,
}: ChipProps): JSX.Element {
  const textColor = active ? GOLD : INK_SECONDARY;

  const body = (
    <View
      style={[
        styles.base,
        {
          backgroundColor: active ? GOLD_DIM : SURFACE_RAISED,
          borderColor: active ? GOLD_BORDER : BORDER_SUBTLE,
        },
        style,
      ]}
    >
      {Icon ? (
        <Icon size={14} color={textColor} strokeWidth={active ? 2 : 1.5} />
      ) : null}
      <Text
        style={[
          styles.label,
          {
            color: textColor,
            fontWeight: active ? '700' : '500',
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <PressableScale onPress={onPress} hapticStyle="light">
        {body}
      </PressableScale>
    );
  }

  return body;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
});
