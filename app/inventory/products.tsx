import InventoryScreen, {
  InventoryCard,
  InventoryEmpty,
  InventoryError,
  InventoryLabel,
} from "@/components/inventory/InventoryScreen";
import { useCreateInventoryProduct, useInventoryProducts, useUpdateInventoryProduct } from "@/hooks/inventory/useProducts";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useState } from "react";

export default function InventoryProductsScreen() {
  const { data, isLoading, isError, error } = useInventoryProducts();
  const createProduct = useCreateInventoryProduct();
  const updateProduct = useUpdateInventoryProduct();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [minQuantity, setMinQuantity] = useState("0");
  const [alertThreshold, setAlertThreshold] = useState("");

  const handleCreate = async () => {
    const parsedMin = Number.parseInt(minQuantity, 10);
    if (!name.trim() || !unit.trim() || !Number.isFinite(parsedMin) || parsedMin < 0) return;

    const parsedThreshold = Number.parseInt(alertThreshold, 10);
    await createProduct.mutateAsync({
      name: name.trim(),
      unit: unit.trim(),
      minQuantity: parsedMin,
      active: true,
      alertThreshold: Number.isFinite(parsedThreshold) ? parsedThreshold : null,
      requiresRefill: false,
    });

    setName("");
    setUnit("un");
    setMinQuantity("0");
    setAlertThreshold("");
  };

  return (
    <InventoryScreen title="Produtos" subtitle="Ingredientes e unidades controlados no estoque">
      <InventoryCard>
        <InventoryLabel>Criar produto</InventoryLabel>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nome do produto" />
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={unit} onChangeText={setUnit} placeholder="Unidade (kg, un...)" />
          <TextInput
            style={[styles.input, styles.narrow]}
            value={minQuantity}
            onChangeText={setMinQuantity}
            placeholder="Mín."
            keyboardType="number-pad"
          />
          <TextInput
            style={[styles.input, styles.narrow]}
            value={alertThreshold}
            onChangeText={setAlertThreshold}
            placeholder="Alerta"
            keyboardType="number-pad"
          />
        </View>
        <Text style={styles.helperText}>
          O mínimo informado aqui é o padrão para novos estoques. Depois disso, cada local pode ter seu próprio mínimo na tela de estoque.
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => void handleCreate()}>
          <Text style={styles.primaryButtonText}>{createProduct.isPending ? "Criando..." : "Criar produto"}</Text>
        </Pressable>
      </InventoryCard>

      {isLoading ? <ActivityIndicator size="large" color="#2B57D6" /> : null}
      {isError ? <InventoryError message={error instanceof Error ? error.message : "Não foi possível carregar os produtos."} /> : null}
      {!isLoading && !isError && (data?.length ?? 0) === 0 ? <InventoryEmpty message="Nenhum produto cadastrado ainda." /> : null}

      {(data ?? []).map((product) => (
        <InventoryCard key={product.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.itemTitle}>{product.name}</Text>
            <Text style={styles.itemMeta}>{product.unit}</Text>
          </View>
          <Text style={styles.itemMeta}>Mínimo padrão para novos estoques: {product.minQuantity}</Text>
          <Text style={styles.itemMeta}>Limite de alerta: {product.alertThreshold ?? "-"}</Text>

          <View style={styles.rowBetween}>
            <Text style={styles.itemMeta}>Ativo</Text>
            <Switch
              value={product.active}
              onValueChange={(value) =>
                updateProduct.mutate({
                  productId: product.id,
                  active: value,
                })
              }
            />
          </View>
        </InventoryCard>
      ))}
    </InventoryScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: "#FFFFFF",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  narrow: {
    width: 88,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: "#2B57D6",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  helperText: {
    fontSize: 13,
    color: "#607085",
    fontWeight: "600",
  },
  itemTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  itemMeta: {
    fontSize: 14,
    color: "#5A6A7B",
    fontWeight: "600",
  },
});
