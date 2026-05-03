import InventoryTabs from "@/components/inventory/InventoryTabs";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  scrollable?: boolean;
};

export default function InventoryScreen({ children, scrollable = true }: Props) {
  return (
    <SafeAreaView style={styles.page}>
      <InventoryTabs />
      {scrollable ? (
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      ) : (
        <View style={styles.contentNoScroll}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function InventoryCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function InventoryLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function InventoryValue({ children }: { children: ReactNode }) {
  return <Text style={styles.value}>{children}</Text>;
}

export function InventoryError({ message }: { message: string }) {
  return <Text style={styles.error}>{message}</Text>;
}

export function InventoryEmpty({ message }: { message: string }) {
  return <Text style={styles.empty}>{message}</Text>;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  contentNoScroll: {
    flex: 1,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 10,
  },
  label: {
    fontSize: 13,
    color: "#607085",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  value: {
    fontSize: 20,
    color: "#1D2B3A",
    fontWeight: "800",
  },
  error: {
    fontSize: 15,
    color: "#B3261E",
    fontWeight: "700",
  },
  empty: {
    fontSize: 15,
    color: "#6A7785",
    fontWeight: "700",
  },
});
