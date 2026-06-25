/**
 * RatingModal — Phase 9, Plan 09-11
 *
 * 3-section rating modal for completed tour bookings.
 * Each section posts independently to POST /api/v1/reviews.
 *
 * Sections:
 *   1. Rate Guide   → { targetType: 'GUIDE', targetId: guideId, tourBookingId, rating, comment }
 *   2. Rate Package → { targetType: 'PACKAGE', targetId: tourPackageId, tourBookingId, rating, comment }
 *   3. Rate Venue   → { targetType: 'VENUE', targetId: <selected>, tourBookingId, rating, comment }
 *
 * Progress indicator: "N of 3 submitted"
 * All colors from tokens — no inline hex.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Star } from 'lucide-react-native';

import { PressableScale } from '../ui/PressableScale';
import { api } from '../../lib/api';
import {
  BORDER,
  BORDER_SUBTLE,
  ERROR_TEXT,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_FAINT,
  INK_MID,
  INK_SECONDARY,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  SUCCESS,
  SUCCESS_DIM,
  SUCCESS_TEXT,
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  TYPE,
} from '../../lib/tokens';

export type VenueTarget = {
  id: string;
  name: string;
  type: 'attraction' | 'property';
};

export type RatingModalProps = {
  visible: boolean;
  onClose: () => void;
  tourBookingId: string;
  guideId?: string | null;
  guideName?: string | null;
  tourPackageId: string;
  packageName?: string | null;
  venues?: VenueTarget[];
};

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          style={starStyles.starBtn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star
            size={28}
            color={GOLD}
            fill={n <= value ? GOLD : 'transparent'}
            strokeWidth={1.8}
          />
        </Pressable>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  starBtn: { padding: 4 },
});

type SectionState = {
  rating: number;
  comment: string;
  submitted: boolean;
  pending: boolean;
  error: string | null;
};

function defaultSection(): SectionState {
  return { rating: 0, comment: '', submitted: false, pending: false, error: null };
}

export function RatingModal({
  visible,
  onClose,
  tourBookingId,
  guideId,
  guideName,
  tourPackageId,
  packageName,
  venues = [],
}: RatingModalProps): JSX.Element {
  const [guide, setGuide] = useState<SectionState>(defaultSection);
  const [pkg, setPkg] = useState<SectionState>(defaultSection);
  const [venue, setVenue] = useState<SectionState>(defaultSection);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(
    venues[0]?.id ?? null,
  );

  const submittedCount = [guide, pkg, venue].filter((s) => s.submitted).length;

  async function submitSection(
    section: SectionState,
    setSection: React.Dispatch<React.SetStateAction<SectionState>>,
    targetType: string,
    targetId: string | null | undefined,
  ) {
    if (!targetId) {
      setSection((s) => ({ ...s, error: 'No target available for this section.' }));
      return;
    }
    if (section.rating === 0) {
      setSection((s) => ({ ...s, error: 'Please select a star rating.' }));
      return;
    }
    setSection((s) => ({ ...s, pending: true, error: null }));
    try {
      await api.post('/reviews', {
        targetType,
        targetId,
        tourBookingId,
        rating: section.rating,
        comment: section.comment.trim() || undefined,
      });
      setSection((s) => ({ ...s, pending: false, submitted: true }));
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Submission failed. Try again.';
      setSection((s) => ({
        ...s,
        pending: false,
        error: Array.isArray(msg) ? msg.join(' ') : String(msg),
      }));
    }
  }

  function renderSection(
    title: string,
    subtitle: string,
    section: SectionState,
    setSection: React.Dispatch<React.SetStateAction<SectionState>>,
    targetType: string,
    targetId: string | null | undefined,
    extra?: React.ReactNode,
  ) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSub}>{subtitle}</Text>

        {extra}

        {section.submitted ? (
          <View style={styles.submittedBadge}>
            <Star size={14} color={SUCCESS_TEXT} fill={SUCCESS_TEXT} />
            <Text style={styles.submittedText}>Submitted — thank you!</Text>
          </View>
        ) : (
          <>
            <StarPicker
              value={section.rating}
              onChange={(v) => setSection((s) => ({ ...s, rating: v }))}
            />
            <TextInput
              value={section.comment}
              onChangeText={(t) => setSection((s) => ({ ...s, comment: t }))}
              placeholder="Leave a comment (optional)"
              placeholderTextColor={INK_FAINT}
              multiline
              numberOfLines={3}
              style={styles.commentInput}
              accessibilityLabel={`${title} comment`}
            />
            {section.error ? (
              <Text style={styles.errorText}>{section.error}</Text>
            ) : null}
            <PressableScale
              onPress={() => submitSection(section, setSection, targetType, targetId)}
              disabled={section.pending || section.rating === 0}
              style={[styles.submitBtn, (section.pending || section.rating === 0) && styles.submitBtnDisabled]}
              hapticStyle="medium"
            >
              {section.pending ? (
                <ActivityIndicator color={SURFACE_DEEP} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Submit rating</Text>
              )}
            </PressableScale>
          </>
        )}
      </View>
    );
  }

  const venueExtra =
    venues.length > 1 ? (
      <View style={styles.venuePicker}>
        {venues.map((v) => (
          <Pressable
            key={v.id}
            onPress={() => setSelectedVenueId(v.id)}
            style={[
              styles.venueChip,
              selectedVenueId === v.id && styles.venueChipActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel={v.name}
          >
            <Text
              style={[
                styles.venueChipText,
                selectedVenueId === v.id && styles.venueChipTextActive,
              ]}
            >
              {v.name}
            </Text>
          </Pressable>
        ))}
      </View>
    ) : venues.length === 1 ? (
      <Text style={styles.singleVenueLabel}>{venues[0].name}</Text>
    ) : null;

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
            <Text style={styles.sheetTitle}>Rate your experience</Text>
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

          {/* Progress indicator */}
          <View style={styles.progressRow}>
            {[0, 1, 2].map((i) => {
              const done = i < submittedCount;
              return (
                <View
                  key={i}
                  style={[styles.progressDot, done && styles.progressDotDone]}
                />
              );
            })}
            <Text style={styles.progressLabel}>{submittedCount} of 3 submitted</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            {/* Section 1: Guide */}
            {guideId
              ? renderSection(
                  'Your tour guide',
                  guideName ?? 'Rate your guide',
                  guide,
                  setGuide,
                  'GUIDE',
                  guideId,
                )
              : null}

            {guideId ? <View style={styles.sectionDivider} /> : null}

            {/* Section 2: Package */}
            {renderSection(
              'Tour package',
              packageName ?? 'Rate the overall experience',
              pkg,
              setPkg,
              'PACKAGE',
              tourPackageId,
            )}

            {/* Section 3: Venue */}
            {venues.length > 0 ? (
              <>
                <View style={styles.sectionDivider} />
                {renderSection(
                  'Venue',
                  'Rate a venue you visited',
                  venue,
                  setVenue,
                  'VENUE',
                  selectedVenueId,
                  venueExtra,
                )}
              </>
            ) : null}

            <View style={{ height: 32 }} />
          </ScrollView>
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
    maxHeight: '90%',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE_3,
  },
  sheetTitle: {
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

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_2,
    marginBottom: SPACE_4,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BORDER_SUBTLE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  progressDotDone: {
    backgroundColor: SUCCESS,
    borderColor: SUCCESS,
  },
  progressLabel: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: INK_MID,
    letterSpacing: 0.4,
    marginLeft: SPACE_2,
  },

  scroll: { flex: 1 },

  section: {
    gap: SPACE_3,
    paddingVertical: SPACE_4,
  },
  sectionTitle: {
    fontFamily: FONT_UI,
    fontSize: 16,
    fontWeight: '700',
    color: INK,
  },
  sectionSub: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: INK_MID,
    marginTop: -SPACE_2,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: BORDER_SUBTLE,
  },

  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_2,
    backgroundColor: SUCCESS_DIM,
    borderRadius: RADIUS_MD,
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_3,
  },
  submittedText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '600',
    color: SUCCESS_TEXT,
  },

  commentInput: {
    minHeight: 80,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_3,
    fontFamily: TYPE.body.fontFamily,
    fontSize: 14,
    color: INK,
    textAlignVertical: 'top',
  },
  errorText: {
    fontFamily: FONT_UI,
    fontSize: 12,
    color: ERROR_TEXT,
    marginTop: -SPACE_2,
  },

  submitBtn: {
    height: 48,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontFamily: FONT_UI,
    fontSize: 14,
    fontWeight: '700',
    color: SURFACE_DEEP,
    letterSpacing: 0.2,
  },

  // Venue picker
  venuePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE_2,
  },
  venueChip: {
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_2,
    borderRadius: RADIUS_PILL,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    minHeight: 36,
    justifyContent: 'center',
  },
  venueChipActive: {
    backgroundColor: GOLD_DIM,
    borderColor: GOLD_LINE,
  },
  venueChipText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: INK_SECONDARY,
  },
  venueChipTextActive: {
    color: GOLD,
    fontWeight: '700',
  },
  singleVenueLabel: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: GOLD,
    fontWeight: '600',
  },
});
