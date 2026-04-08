import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Route not found</Text>
        <Text style={styles.description}>
          This screen does not exist in the app.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Go to Sitemap</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F8F6",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#173F33",
  },
  description: {
    fontSize: 15,
    color: "#4F6B60",
    textAlign: "center",
  },
  button: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFE3D0",
    backgroundColor: "#EAF8F1",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0B5D3F",
  },
});
