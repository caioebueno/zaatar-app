import Feather from "@expo/vector-icons/Feather";
import { router, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type TabItem = {
  label: string;
  path: string;
  matchPaths?: string[];
};

const TABS: TabItem[] = [
  { label: "Painel", path: "/inventory/dashboard" },
  { label: "Reposição", path: "/inventory/refill" },
  {
    label: "Ajustes",
    path: "/inventory/settings",
    matchPaths: ["/inventory/settings", "/inventory/places", "/inventory/products", "/inventory/stocks"],
  },
];

export default function InventoryTabs() {
  const pathname = usePathname();

  return (
    <View style={styles.wrapper}>
      <View style={styles.navRow}>
        <Pressable style={styles.backButton} onPress={() => router.replace("/" as never)}>
          <Feather name="arrow-left" size={18} color="#44566A" />
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {TABS.map((tab) => {
            const active = (tab.matchPaths ?? [tab.path]).some((path) => pathname === path);
            return (
              <Pressable
                key={tab.path}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => router.push(tab.path as never)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    borderBottomColor: "#E3E6EA",
    backgroundColor: "#FFFFFF",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingLeft: 16,
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  tabsRow: {
    paddingRight: 16,
    gap: 10,
  },
  tab: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  tabActive: {
    borderColor: "#2B57D6",
    backgroundColor: "#EEF3FF",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#546272",
  },
  tabTextActive: {
    color: "#2B57D6",
  },
});
