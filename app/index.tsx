import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Sitemap() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Sitemap</Text>
        <Text style={styles.subtitle}>Choose a screen to open</Text>

        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/station",
              params: {
                stationId: "2a18e3a7-2491-422a-af43-efff08031e9b",
                stationName: "Recheador",
              },
            })
          }
        >
          <Text style={styles.cardTitle}>Station Recheador</Text>
          <Text style={styles.cardDescription}>Station ID 2a18e3a7-2491-422a-af43-efff08031e9b</Text>
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/station",
              params: {
                stationId: "b69e20b1-db2d-493a-bc5a-6aa78b4d107c",
                stationName: "Preparador",
              },
            })
          }
        >
          <Text style={styles.cardTitle}>Station Preparador</Text>
          <Text style={styles.cardDescription}>Station ID b69e20b1-db2d-493a-bc5a-6aa78b4d107c</Text>
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/station",
              params: {
                stationId: "999ff41c-47ef-49f7-b6ea-229a085fc1cf",
                stationName: "Emabaldor",
              },
            })
          }
        >
          <Text style={styles.cardTitle}>Station Emabaldor</Text>
          <Text style={styles.cardDescription}>Station ID 999ff41c-47ef-49f7-b6ea-229a085fc1cf</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/dispatch")}>
          <Text style={styles.cardTitle}>Dispatch</Text>
          <Text style={styles.cardDescription}>Dispatch dashboard screen</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/inventory/dashboard" as never)}>
          <Text style={styles.cardTitle}>Inventory</Text>
          <Text style={styles.cardDescription}>Inventory management screens</Text>
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

        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/next-delivery",
              params: {
                driverId: "a9745fbe-dea3-41f7-8323-129f677680f0",
                driverName: "Bruno",
              },
            })
          }
        >
          <Text style={styles.cardTitle}>Bruno Delivery</Text>
          <Text style={styles.cardDescription}>Driver ID a9745fbe-dea3-41f7-8323-129f677680f0</Text>
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/next-delivery",
              params: {
                driverId: "4373865f-cf5f-45d5-80c8-0ccd5b77f1e4",
                driverName: "Mauricio",
              },
            })
          }
        >
          <Text style={styles.cardTitle}>Mauricio Delivery</Text>
          <Text style={styles.cardDescription}>Driver ID 4373865f-cf5f-45d5-80c8-0ccd5b77f1e4</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F8F6",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
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
