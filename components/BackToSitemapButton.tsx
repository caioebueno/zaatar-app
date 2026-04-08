import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

type BackToSitemapButtonProps = {
  absolute?: boolean;
};

export default function BackToSitemapButton({
  absolute = false,
}: BackToSitemapButtonProps) {
  return (
    <Pressable
      onPress={() => router.replace("/")}
      style={[styles.button, absolute && styles.absoluteButton]}
    >
      <Feather name="arrow-left" size={16} color="#666666" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DEDEDE",
    // backgroundColor: "#EAF8F1",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  absoluteButton: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 20,
  },
  text: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0B5D3F",
  },
});
