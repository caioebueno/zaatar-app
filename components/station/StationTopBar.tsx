import ElapsedTimer from "@/components/ElapsedTimer";
import { Colors } from "@/constants/theme";
import Feather from "@expo/vector-icons/Feather";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type StationTopBarProps = {
  customerName?: string;
  createdAt: string;
  isCompleted: boolean;
  canGoNext: boolean;
  onGoNext: () => void;
};

const ReadyBadge: React.FC = () => {
  return <Text style={styles.readyBadge}>Pronto</Text>;
};

const NextOrderButton: React.FC<{ disabled: boolean; onPress: () => void }> = ({
  disabled,
  onPress,
}) => {
  return (
    <Pressable
      style={[styles.button, styles.primaryButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.buttonText, styles.primaryButtonText]}>Proximo</Text>
      <Feather name="arrow-right" size={22} color={Colors.light.foreground} />
    </Pressable>
  );
};

const StationTopBar: React.FC<StationTopBarProps> = ({
  customerName,
  createdAt,
  isCompleted,
  canGoNext,
  onGoNext,
}) => {
  return (
    <View style={styles.topbar}>
      <View style={styles.hiddenTopbarButton}>
        <NextOrderButton disabled={!canGoNext} onPress={onGoNext} />
      </View>
      <View style={styles.nameRow}>
        <Text style={styles.name}>{customerName}</Text>
        {isCompleted ? <ReadyBadge /> : <ElapsedTimer date={createdAt} />}
      </View>
      <View>
        <NextOrderButton disabled={!canGoNext} onPress={onGoNext} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenTopbarButton: {
    opacity: 0,
  },
  readyBadge: {
    backgroundColor: "#E6F8ED",
    borderColor: "#D2E9E0",
    color: "#107550",
    fontSize: 18,
    fontWeight: "600",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderColor: Colors.light.border,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  primaryButtonText: {
    color: Colors.light.foreground,
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  disabledButton: {
    opacity: 0.7,
  },
  topbar: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: Colors.light.foreground,
    borderBottomColor: Colors.light.border,
    borderBottomWidth: 1,
    justifyContent: "space-between",
    alignItems: "center",
    flexDirection: "row",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: "600",
  },
});

export default StationTopBar;
