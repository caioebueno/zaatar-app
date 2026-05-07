import SnoozeCountdown from "@/components/SnoozeCountdown";
import { Colors } from "@/constants/theme";
import { useDoubleTap } from "@/hooks/useDoubleClick";
import type { TModifierGroupItem } from "@/types/product";
import type {
  TPreparationStepCategory,
  TPreparationStepTrack,
  TSnooze,
} from "@/types/station";
import Feather from "@expo/vector-icons/Feather";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { addSnooze, getActiveSnooze } from "./stationUtils";

type PreparationCategoryCardProps = {
  preparationCategory: TPreparationStepCategory;
  onSnooze: (preparationStepCategoryId: string, snoozes: TSnooze[]) => void;
  onUpdateSteps: (preparationStepCategoryId: string, steps: TPreparationStepTrack[]) => void;
};

type PreparationTrackItemProps = {
  track: TPreparationStepTrack;
  onTrackChange: (updates: Partial<TPreparationStepTrack>) => void;
};

type ModifierChecklistItemProps = {
  modifier?: TModifierGroupItem;
  completed: boolean;
  onPress: () => void;
};

const DELAY_MINUTE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const CompletionIndicator: React.FC<{ completed: boolean }> = ({ completed }) => {
  return (
    <View style={[styles.nonActiveIndicator, completed && styles.activeIndicator]}>
      {completed && <Feather name="check" size={20} color={Colors.light.background} />}
    </View>
  );
};

const ModifierChecklistItem: React.FC<ModifierChecklistItemProps> = ({
  modifier,
  completed,
  onPress,
}) => {
  return (
    <Pressable onPress={onPress} style={[styles.trackInnerRow, styles.trackSubItem, completed && styles.completedContainer]}>
      <Text style={styles.trackText}>{modifier?.description}</Text>
      <CompletionIndicator completed={completed} />
    </Pressable>
  );
};

const PreparationTrackItem: React.FC<PreparationTrackItemProps> = ({ track, onTrackChange }) => {
  const commentsCompleted = !!track.completedComments;
  const modifiers = track.preparationStepModifiers || [];
  const modifiersStatus = modifiers.reduce((acc, modifierTrack) => {
    acc[modifierTrack.id] = !!modifierTrack.completed;
    return acc;
  }, {} as Record<string, boolean>);

  return (
    <View style={[styles.trackContainer, track.completed && styles.completedContainer]}>
      <Pressable
        onPress={() => {
          if (track.completed) {
            onTrackChange({ completed: false });
            return;
          }

          onTrackChange({ completed: true });
        }}
        style={[styles.trackInnerRow, styles.trackPressable]}
      >
        <Text style={styles.trackText}>
          {track.quantity}x{"   "}
          {track.name}
        </Text>
        <CompletionIndicator completed={track.completed} />
      </Pressable>

      {(track.comments !== undefined || (track.preparationStepModifiers && track.preparationStepModifiers.length > 0)) && (
        <View style={styles.trackDetailsContainer}>
          {track.preparationStepModifiers && track.preparationStepModifiers.length > 0 && (
            <View style={styles.detailsSection}>
              <Text style={styles.detailsTitle}>Adicionais</Text>
              {track.preparationStepModifiers.map((modifier) => (
                <ModifierChecklistItem
                  key={modifier.id}
                  modifier={modifier.modifierGtroupItem}
                  completed={modifiersStatus[modifier.id]}
                  onPress={() => {
                    const updatedModifiers = modifiers.map((currentModifier) =>
                      currentModifier.id === modifier.id
                        ? { ...currentModifier, completed: !currentModifier.completed }
                        : currentModifier
                    );

                    onTrackChange({
                      preparationStepModifiers: updatedModifiers,
                    });
                  }}
                />
              ))}
            </View>
          )}

          {track.comments !== undefined && (
            <View style={styles.detailsSection}>
              <Text style={styles.detailsTitle}>Instruções extras</Text>
              <Pressable
                onPress={() => {
                  const nextCommentsCompleted = !commentsCompleted;

                  onTrackChange({
                    completedComments: nextCommentsCompleted,
                  });
                }}
                style={[
                  styles.trackInnerRow,
                  styles.trackSubItem,
                  track.completedComments && styles.completedContainer,
                ]}
              >
                <Text style={styles.trackText}>{track.comments}</Text>
                <CompletionIndicator completed={!!track.completedComments} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const PreparationCategoryCard: React.FC<PreparationCategoryCardProps> = ({
  preparationCategory,
  onSnooze,
  onUpdateSteps,
}) => {
  const [isDelaySelectorOpen, setIsDelaySelectorOpen] = useState(false);
  const activeSnooze = getActiveSnooze(preparationCategory);
  const shouldShowSnoozeModal = !!activeSnooze.snooze;

  const handleCancelSnooze = useDoubleTap(() => {
    if (!activeSnooze.snooze) return;

    const newSnoozes = preparationCategory.snoozes.map((snooze) => {
      const isCurrentSnooze =
        !snooze.canceled &&
        snooze.startedAt === activeSnooze.snooze?.startedAt &&
        snooze.duration === activeSnooze.snooze?.duration;

      if (!isCurrentSnooze) return snooze;

      return {
        ...snooze,
        canceled: true,
      };
    });

    onSnooze(preparationCategory.id, newSnoozes);
  });

  return (
    <View style={styles.categoryContainer}>
      {shouldShowSnoozeModal && (
        <Pressable onPress={handleCancelSnooze} style={styles.snoozedModal}>
          <SnoozeCountdown snooze={activeSnooze.snooze} />
        </Pressable>
      )}

      {isDelaySelectorOpen && (
        <View style={styles.delaySelectorOverlay}>
          <Pressable style={styles.delaySelectorBackdrop} onPress={() => setIsDelaySelectorOpen(false)} />
          <View style={styles.delaySelectorCard}>
            <Text style={styles.delaySelectorTitle}>Adiar por quanto tempo?</Text>
            <View style={styles.delaySelectorOptions}>
              {DELAY_MINUTE_OPTIONS.map((minutes) => (
                <Pressable
                  key={`delay-${preparationCategory.id}-${minutes}`}
                  onPress={() => {
                    const newSnoozes = addSnooze(preparationCategory.snoozes, minutes * 60);
                    onSnooze(preparationCategory.id, newSnoozes);
                    setIsDelaySelectorOpen(false);
                  }}
                  style={styles.delayOptionButton}
                >
                  <Text style={styles.delayOptionButtonText}>{minutes} min</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.delaySelectorCancelButton}
              onPress={() => setIsDelaySelectorOpen(false)}
            >
              <Text style={styles.delaySelectorCancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.categoryNameContainer, shouldShowSnoozeModal && styles.reducedOpacity]}>
        <Text style={styles.categoryName}>{preparationCategory.category?.title}</Text>
      </View>

      <View style={[styles.tracksContainer, shouldShowSnoozeModal && styles.reducedOpacity]}>
        {preparationCategory.steps.map((item) => (
          <PreparationTrackItem
            key={item.id}
            track={item}
            onTrackChange={(updates) => {
              const updatedSteps = preparationCategory.steps.map((step) =>
                step.id === item.id ? { ...step, ...updates } : step
              );
              onUpdateSteps(preparationCategory.id, updatedSteps);
            }}
          />
        ))}
      </View>

      <View style={[styles.categoryButtonContainer, shouldShowSnoozeModal && styles.reducedOpacity]}>
        <Pressable
          onPress={() => setIsDelaySelectorOpen(true)}
          style={[styles.button, styles.snoozeButton]}
        >
          <Feather name="clock" size={22} color={Colors.light.text} />
          <Text style={styles.buttonText}>Adiar</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  categoryContainer: {
    borderColor: Colors.light.border,
    borderWidth: 1,
    borderRadius: 12,
    width: 600,
    backgroundColor: Colors.light.foreground,
    overflow: "hidden",
  },
  reducedOpacity: {
    opacity: 0.5,
  },
  snoozedModal: {
    position: "absolute",
    backgroundColor: "#F7CA3770",
    borderWidth: 2,
    borderColor: "#96632C80",
    borderRadius: 11,
    width: "100%",
    height: "100%",
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryNameContainer: {
    borderBottomWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
  },
  categoryName: {
    fontWeight: "600",
    fontSize: 20,
  },
  tracksContainer: {
    padding: 16,
    gap: 12
  },
  categoryButtonContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: Colors.light.border,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderColor: Colors.light.border,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: "600",
  },
  primaryButtonText: {
    color: Colors.light.foreground,
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  snoozeButton: {
    width: "100%",
  },
  completeButton: {
    flex: 1,
  },
  disabledCompleteButton: {
    opacity: 0.5,
  },
  completedPrimaryButton: {
    backgroundColor: "#107550",
  },
  trackContainer: {
    overflow: "hidden",
    borderColor: Colors.light.border,
    borderWidth: 1,
    borderRadius: 12,
  },
  trackInnerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trackPressable: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  trackText: {
    fontSize: 20,
    fontWeight: "600",
  },
  nonActiveIndicator: {
    height: 28,
    width: 28,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  activeIndicator: {
    borderColor: "#107550",
    backgroundColor: "#107550",
  },
  completedContainer: {
    backgroundColor: "#E6F8ED",
    borderColor: "#D2E9E0",
  },
  trackDetailsContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.background,
    borderTopWidth: 1,
    borderColor: Colors.light.border,
    gap: 10,
  },
  detailsSection: {
    gap: 10,
  },
  detailsTitle: {
    fontWeight: "600",
    color: "#555555",
    fontSize: 16,
  },
  trackSubItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.foreground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  delaySelectorOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  delaySelectorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000044",
  },
  delaySelectorCard: {
    width: "84%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.foreground,
    padding: 16,
    gap: 12,
  },
  delaySelectorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.light.text,
  },
  delaySelectorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  delayOptionButton: {
    minWidth: 76,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  delayOptionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.light.text,
  },
  delaySelectorCancelButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  delaySelectorCancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#555555",
  },
});

export default PreparationCategoryCard;
