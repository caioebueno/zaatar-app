import { TabletTopBar } from "@/components/TabletTopBar";
import { useAuth } from "@/contexts/auth";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MapScreen() {
  const { owner, signOut } = useAuth();
  const router = useRouter();
  const userInitial = (owner?.name ?? "?").charAt(0).toUpperCase();

  return (
    <SafeAreaView style={s.safe}>
      <TabletTopBar
        mode="inner"
        pageTitle="Mapa ao Vivo"
        onBack={() => router.replace("/(app)")}
        backLabel="Início"
        userInitial={userInitial}
        onAvatarPress={() => void signOut()}
      />
      <View style={s.body}>
        <Text style={s.text}>Mapa disponível apenas no aplicativo.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0e0b09" },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: "GeistMono_400Regular", fontSize: 13, color: "rgba(250,245,238,0.40)", letterSpacing: 0.4 },
});
