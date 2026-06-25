/**
 * SplitBillShareSheet — Phase 9, Plan 09-11
 *
 * Modal shown after a split-bill tour booking is created.
 * Gives the user options to:
 *   1. Copy the join link (via React Native Share as fallback — expo-clipboard not installed)
 *   2. Share natively (Share.share from react-native)
 *   3. Share to WhatsApp (Linking.openURL)
 *
 * All colors from tokens — no inline hex.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Share,
  Linking,
} from 'react-native';
import { X, Share2, MessageCircle, Copy } from 'lucide-react-native';

import { PressableScale } from '../ui/PressableScale';
import {
  BORDER,
  BORDER_SUBTLE,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_MID,
  INK_FAINT,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
} from '../../lib/tokens';

type SplitBillShareSheetProps = {
  visible: boolean;
  onClose: () => void;
  link: string;
};

export function SplitBillShareSheet({
  visible,
  onClose,
  link,
}: SplitBillShareSheetProps): JSX.Element {
  async function handleNativeShare() {
    try {
      await Share.share({
        message: `Join my tour booking on Iṣẹ́yáá — split the bill: ${link}`,
        url: link,
      });
    } catch (_) {
      // user dismissed
    }
  }

  async function handleWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(
      `Join my tour booking on Iṣẹ́yáá — split the bill: ${link}`,
    )}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // WhatsApp not installed — fall back to native share
        await handleNativeShare();
      }
    } catch (_) {
      await handleNativeShare();
    }
  }

  async function handleCopyLink() {
    // expo-clipboard is not installed; use native share as copy-link fallback.
    try {
      await Share.share({
        message: link,
        url: link,
      });
    } catch (_) {
      // user dismissed
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Split the bill</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={INK} strokeWidth={2} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Share this link so your group can each pay their share.
          </Text>

          {/* Link preview */}
          <View style={styles.linkPreview}>
            <Text style={styles.linkText} numberOfLines={2}>
              {link}
            </Text>
          </View>

          {/* Actions */}
          <PressableScale onPress={handleCopyLink} style={styles.actionRow} hapticStyle="light">
            <View style={styles.actionIconWrap}>
              <Copy size={20} color={GOLD} strokeWidth={2} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionLabel}>Copy link</Text>
              <Text style={styles.actionSub}>Share via any app</Text>
            </View>
          </PressableScale>

          <View style={styles.divider} />

          <PressableScale onPress={handleNativeShare} style={styles.actionRow} hapticStyle="light">
            <View style={styles.actionIconWrap}>
              <Share2 size={20} color={GOLD} strokeWidth={2} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionLabel}>Share</Text>
              <Text style={styles.actionSub}>Open system share sheet</Text>
            </View>
          </PressableScale>

          <View style={styles.divider} />

          <PressableScale onPress={handleWhatsApp} style={styles.actionRow} hapticStyle="light">
            <View style={styles.actionIconWrap}>
              <MessageCircle size={20} color={GOLD} strokeWidth={2} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionLabel}>WhatsApp</Text>
              <Text style={styles.actionSub}>Send directly to your group chat</Text>
            </View>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,14,14,0.70)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: SURFACE_RAISED,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: SPACE_6,
    paddingTop: SPACE_5,
    paddingBottom: SPACE_6,
    gap: SPACE_4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    color: INK,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: INK_MID,
    lineHeight: 19,
    marginTop: -SPACE_2,
  },
  linkPreview: {
    backgroundColor: SURFACE_MID,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_3,
  },
  linkText: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: GOLD,
    letterSpacing: 0.2,
  },

  // Action rows
  divider: {
    height: 1,
    backgroundColor: BORDER_SUBTLE,
    marginVertical: -SPACE_2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_4,
    paddingVertical: SPACE_2,
    minHeight: 56,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1 },
  actionLabel: {
    fontFamily: FONT_UI,
    fontSize: 15,
    fontWeight: '700',
    color: INK,
  },
  actionSub: {
    fontFamily: FONT_UI,
    fontSize: 12,
    color: INK_FAINT,
    marginTop: 2,
  },
});
