import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Sitemap() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Sitemap</Text>
        <Text style={styles.subtitle}>Choose a screen to open</Text>

        <Pressable style={styles.card} onPress={() => router.push("/station")}>
          <Text style={styles.cardTitle}>Station</Text>
          <Text style={styles.cardDescription}>Kitchen workflow and order queue</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/dispatch")}>
          <Text style={styles.cardTitle}>Dispatch</Text>
          <Text style={styles.cardDescription}>Dispatch dashboard screen</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/next-delivery")}>
          <Text style={styles.cardTitle}>Next Delivery</Text>
          <Text style={styles.cardDescription}>Driver next delivery details screen</Text>
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/next-delivery",
              params: {
                driverId: "fcd49c13-d51e-4010-acf3-b7d08e4aced5",
                driverName: "Alysson",
              },
            })
          }
        >
          <Text style={styles.cardTitle}>Alysson Delivery</Text>
          <Text style={styles.cardDescription}>Driver ID fcd49c13-d51e-4010-acf3-b7d08e4aced5</Text>
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/next-delivery",
              params: {
                driverId: "a9fa0c74-ae00-4c4c-b506-d82a0ed0c748",
                driverName: "Paula",
              },
            })
          }
        >
          <Text style={styles.cardTitle}>Paula Delivery</Text>
          <Text style={styles.cardDescription}>Driver ID a9fa0c74-ae00-4c4c-b506-d82a0ed0c748</Text>
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
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 14,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#113A2E",
  },
  subtitle: {
    fontSize: 16,
    color: "#496A5D",
    marginBottom: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D5E5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#173F33",
  },
  cardDescription: {
    fontSize: 14,
    color: "#5C7B6F",
  },
});
