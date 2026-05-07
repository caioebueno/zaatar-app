import InventoryScreen, {
  InventoryCard,
  InventoryLabel,
} from "@/components/inventory/InventoryScreen";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

export default function InventorySettingsScreen() {
  return (
    <InventoryScreen
      title="Configurações do Estoque"
      subtitle="Gerencie os cadastros do inventário"
    >
      <InventoryCard>
        <InventoryLabel>Cadastros</InventoryLabel>

        <Pressable
          style={styles.button}
          onPress={() => router.push("/inventory/stocks" as never)}
        >
          <Text style={styles.buttonTitle}>Estoque</Text>
          <Text style={styles.buttonText}>Gerencie quantidades, mínimos e visibilidade no checklist.</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() => router.push("/inventory/places" as never)}
        >
          <Text style={styles.buttonTitle}>Locais</Text>
          <Text style={styles.buttonText}>Crie e gerencie os locais de armazenamento.</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() => router.push("/inventory/products" as never)}
        >
          <Text style={styles.buttonTitle}>Produtos</Text>
          <Text style={styles.buttonText}>Crie e gerencie os itens controlados em estoque.</Text>
        </Pressable>
      </InventoryCard>
    </InventoryScreen>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    padding: 14,
    backgroundColor: "#F8FAFC",
    gap: 6,
  },
  buttonTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5A6A7B",
  },
});
