import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";

type StationTopBarProps = {
  stationName?: string;
};

function useWallClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const StationTopBar: React.FC<StationTopBarProps> = ({
  stationName = "Estação",
}) => {
  const now = useWallClock();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const day = DAY_LABELS[now.getDay()];

  return (
    <View style={styles.topbar}>
      <Pressable onPress={() => router.replace("/")} style={styles.backBtn}>
        <Feather name="arrow-left" size={18} color="rgba(250,245,238,0.7)" />
      </Pressable>

      <View style={styles.stationInfo}>
        <Text style={styles.stationKicker}>ESTAÇÃO</Text>
        <Text style={styles.stationName}>{stationName}</Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.clockBlock}>
        <Text style={styles.clockTime}>
          {hh}:{mm}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  topbar: {
    height: 72,
    flexShrink: 0,
    backgroundColor: "#181310",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(250,245,238,0.10)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 18,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  stationInfo: {
    gap: 5,
  },
  stationKicker: {
    fontFamily: "monospace",
    fontSize: 9,
    lineHeight: 9,
    letterSpacing: 2,
    color: "rgba(250,245,238,0.42)",
    fontWeight: "500",
  },
  stationName: {
    fontSize: 15,
    lineHeight: 15,
    fontWeight: "700",
    color: "#faf5ee",
    letterSpacing: -0.3,
  },
  spacer: {
    flex: 1,
  },
  clockBlock: {
    alignItems: "flex-end",
    gap: 2,
  },
  clockTime: {
    fontFamily: "monospace",
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "600",
    color: "#faf5ee",
    letterSpacing: -0.5,
  },
  clockDay: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 10,
    color: "rgba(250,245,238,0.42)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});

export default StationTopBar;
