import type {
  TPreparationTaskStation,
  TPreparationStepTrack,
} from "@/types/station";
import Feather from "@expo/vector-icons/Feather";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isPreparationStepTrackCompleted } from "./stationUtils";

type PreparationCategoryCardProps = {
  preparationCategory: TPreparationTaskStation;
  onUpdateSteps: (
    stationGroupId: string,
    steps: TPreparationStepTrack[],
  ) => void;
};

const CheckTarget: React.FC<{ completed: boolean; onPress: () => void }> = ({
  completed,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={[styles.checkTarget, completed && styles.checkTargetDone]}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: completed }}
  >
    <Feather
      name="check"
      size={22}
      color={completed ? "#faf5ee" : "rgba(250,245,238,0.40)"}
    />
  </Pressable>
);

const QtyBadge: React.FC<{ qty: number }> = ({ qty }) => (
  <View style={styles.qtyBadge}>
    <Text style={styles.qtyNum}>{qty}</Text>
    <Text style={styles.qtyX}>×</Text>
  </View>
);

type StepRowProps = {
  track: TPreparationStepTrack;
  onToggle: () => void;
};

const StepRow: React.FC<StepRowProps> = ({ track, onToggle }) => {
  const completed = isPreparationStepTrackCompleted(track);
  const modifiers = track.preparationStepModifiers ?? [];
  const hasModifiers = modifiers.length > 0;
  const hasComments = !!track.comments;

  return (
    <View style={[styles.stepRow, completed && styles.stepRowDone]}>
      <View style={styles.stepLeft}>
        <QtyBadge qty={track.quantity} />
      </View>

      <View style={styles.stepContent}>
        <Text
          style={[styles.stepName, completed && styles.stepNameDone]}
          numberOfLines={2}
        >
          {track.name}
        </Text>

        {hasModifiers && (
          <View style={styles.modifierBlock}>
            {modifiers.map((mod, i) => (
              <View key={mod.id ?? i} style={styles.modifierRow}>
                <View style={styles.modifierDot} />
                <Text style={styles.modifierText} numberOfLines={2}>
                  {mod.modifierGtroupItem?.description ?? mod.modifierGroupItem}
                </Text>
              </View>
            ))}
          </View>
        )}

        {hasComments && (
          <View style={styles.commentsRow}>
            <Feather name="alert-circle" size={12} color="#f2b338" />
            <Text style={styles.commentsText}>{track.comments}</Text>
          </View>
        )}
      </View>

      <View style={styles.stepRight}>
        <CheckTarget completed={completed} onPress={onToggle} />
      </View>
    </View>
  );
};

const PreparationCategoryCard: React.FC<PreparationCategoryCardProps> = ({
  preparationCategory,
  onUpdateSteps,
}) => {
  const handleToggleStep = (stepId: string) => {
    const step = preparationCategory.steps.find((s) => s.id === stepId);
    if (!step) return;
    const nowCompleted = !isPreparationStepTrackCompleted(step);
    const updatedSteps = preparationCategory.steps.map((s) => {
      if (s.id !== stepId) return s;
      return {
        ...s,
        completed: nowCompleted,
        completedComments: nowCompleted,
        preparationStepModifiers: (s.preparationStepModifiers ?? []).map(
          (m) => ({ ...m, completed: nowCompleted }),
        ),
      };
    });
    onUpdateSteps(preparationCategory.id, updatedSteps);
  };

  const pairs: TPreparationStepTrack[][] = [];
  for (let i = 0; i < preparationCategory.steps.length; i += 2) {
    pairs.push(preparationCategory.steps.slice(i, i + 2));
  }

  return (
    <View style={styles.group}>
      {pairs.map((pair, pairIndex) => (
        <View key={pairIndex} style={styles.pairRow}>
          {pair.map((step) => (
            <StepRow
              key={step.id}
              track={step}
              onToggle={() => handleToggleStep(step.id)}
            />
          ))}
          {pair.length === 1 && <View style={styles.pairSpacer} />}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  group: {
    position: "relative",
  },
  pairRow: {
    flexDirection: "row",
    gap: 7,
  },
  pairSpacer: {
    flex: 1,
  },

  // Step rows
  stepRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(250,245,238,0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(250,245,238,0.10)",
    padding: 12,
    marginBottom: 7,
  },
  stepRowDone: {
    backgroundColor: "transparent",
    borderColor: "rgba(250,245,238,0.06)",
    opacity: 0.38,
  },
  stepLeft: {
    paddingTop: 1,
  },
  stepContent: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  stepName: {
    fontSize: 17,
    lineHeight: 17,
    fontWeight: "600",
    color: "#faf5ee",
    letterSpacing: -0.3,
  },
  stepNameDone: {
    textDecorationLine: "line-through",
    textDecorationColor: "rgba(250,245,238,0.3)",
  },
  stepRight: {
    paddingTop: 1,
  },

  // Qty badge
  qtyBadge: {
    width: 52,
    height: 52,
    backgroundColor: "rgba(255,61,20,0.10)",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,61,20,0.25)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  qtyNum: {
    fontFamily: "monospace",
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "700",
    color: "#ff3d14",
    letterSpacing: -0.5,
  },
  qtyX: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 12,
    fontWeight: "600",
    color: "rgba(255,61,20,0.6)",
  },

  // Check button
  checkTarget: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(250,245,238,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkTargetDone: {
    backgroundColor: "#34d39a",
    borderColor: "#34d39a",
  },

  // Modifier block
  modifierBlock: {
    borderLeftWidth: 2.5,
    borderLeftColor: "rgba(255,61,20,0.45)",
    paddingLeft: 11,
    gap: 4,
  },
  modifierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modifierDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,61,20,0.55)",
    flexShrink: 0,
  },
  modifierText: {
    fontSize: 14,
    lineHeight: 14,
    fontWeight: "500",
    color: "rgba(250,245,238,0.88)",
    letterSpacing: -0.1,
    flex: 1,
  },

  // Comments
  commentsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "rgba(242,179,56,0.07)",
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(242,179,56,0.15)",
  },
  commentsText: {
    fontSize: 13,
    lineHeight: 13,
    fontWeight: "500",
    color: "#f2b338",
    flex: 1,
    letterSpacing: -0.1,
  },
});

export default PreparationCategoryCard;
