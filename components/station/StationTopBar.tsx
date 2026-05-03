import { Colors } from "@/constants/theme";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import BackToSitemapButton from "../BackToSitemapButton";

type TOrderFilter = "TODO" | "COMPLETED";

type StationTopBarProps = {
  orderFilter: TOrderFilter;
  onChangeOrderFilter: (filter: TOrderFilter) => void;
};

const OrderFilterSelector: React.FC<{
  value: TOrderFilter;
  onChange: (filter: TOrderFilter) => void;
}> = ({ value, onChange }) => {
  return (
    <View style={styles.orderFilterContainer}>
      <Pressable
        style={[
          styles.orderFilterButton,
          value === "TODO" && styles.orderFilterButtonActive,
        ]}
        onPress={() => onChange("TODO")}
      >
        <Text
          style={[
            styles.orderFilterButtonText,
            value === "TODO" && styles.orderFilterButtonTextActive,
          ]}
        >
          To do
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.orderFilterButton,
          value === "COMPLETED" && styles.orderFilterButtonActive,
        ]}
        onPress={() => onChange("COMPLETED")}
      >
        <Text
          style={[
            styles.orderFilterButtonText,
            value === "COMPLETED" && styles.orderFilterButtonTextActive,
          ]}
        >
          Completed
        </Text>
      </Pressable>
    </View>
  );
};

const StationTopBar: React.FC<StationTopBarProps> = ({ orderFilter, onChangeOrderFilter }) => {
  return (
    <View style={styles.topbar}>
      <BackToSitemapButton />
      <View>
        <OrderFilterSelector value={orderFilter} onChange={onChangeOrderFilter} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  orderFilterContainer: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  orderFilterButton: {
    minWidth: 120,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  orderFilterButtonActive: {
    backgroundColor: Colors.light.foreground,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  orderFilterButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666666",
  },
  orderFilterButtonTextActive: {
    color: Colors.light.text,
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
});

export default StationTopBar;
