import InventoryScreen, {
  InventoryCard,
  InventoryEmpty,
  InventoryError,
  InventoryLabel,
} from "@/components/inventory/InventoryScreen";
import { useCreateInventoryPlace, useInventoryPlaces, useUpdateInventoryPlace } from "@/hooks/inventory/usePlaces";
import type { InventoryPlaceType } from "@/types/inventory";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";

const PLACE_TYPES: InventoryPlaceType[] = ["FRIDGE", "FREEZER", "SHELF", "PANTRY", "OTHER"];

function getPlaceTypeLabel(type: InventoryPlaceType) {
  switch (type) {
    case "FRIDGE":
      return "Geladeira";
    case "FREEZER":
      return "Freezer";
    case "SHELF":
      return "Prateleira";
    case "PANTRY":
      return "Despensa";
    case "OTHER":
      return "Outro";
    default:
      return type;
  }
}

export default function InventoryPlacesScreen() {
  const { data, isLoading, isError, error } = useInventoryPlaces();
  const createPlace = useCreateInventoryPlace();
  const updatePlace = useUpdateInventoryPlace();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<InventoryPlaceType>("SHELF");

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createPlace.mutateAsync({
      name: trimmed,
      type,
      notes: notes.trim() || null,
      active: true,
    });
    setName("");
    setNotes("");
  };

  return (
    <InventoryScreen title="Locais" subtitle="Locais de armazenamento usados na contagem">
      <InventoryCard>
        <InventoryLabel>Criar local</InventoryLabel>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nome do local" />
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Observações (opcional)" />
        <View style={styles.rowWrap}>
          {PLACE_TYPES.map((placeType) => {
            const active = placeType === type;
            return (
              <Pressable
                key={placeType}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setType(placeType)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {getPlaceTypeLabel(placeType)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable style={styles.primaryButton} onPress={() => void handleCreate()}>
          <Text style={styles.primaryButtonText}>
            {createPlace.isPending ? "Criando..." : "Criar local"}
          </Text>
        </Pressable>
      </InventoryCard>

      {isLoading ? <ActivityIndicator size="large" color="#2B57D6" /> : null}
      {isError ? <InventoryError message={error instanceof Error ? error.message : "Não foi possível carregar os locais."} /> : null}
      {!isLoading && !isError && (data?.length ?? 0) === 0 ? <InventoryEmpty message="Nenhum local cadastrado ainda." /> : null}

      {(data ?? []).map((place) => (
        <InventoryCard key={place.id}>
          <View style={styles.cardHeader}>
            <Text style={styles.itemTitle}>{place.name}</Text>
            <Text style={styles.typePill}>{getPlaceTypeLabel(place.type)}</Text>
          </View>
          <Text style={styles.itemMeta}>Ordem: {place.displayOrder ?? "-"}</Text>
          <Text style={styles.itemMeta}>Observações: {place.notes || "-"}</Text>
          <Pressable
            style={[styles.secondaryButton, !place.active && styles.warnButton]}
            onPress={() =>
              updatePlace.mutate({
                placeId: place.id,
                active: !place.active,
              })
            }
          >
            <Text style={styles.secondaryButtonText}>{place.active ? "Desativar" : "Ativar"}</Text>
          </Pressable>
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
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D5DCE5",
    backgroundColor: "#F6F8FB",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  chipActive: {
    borderColor: "#2B57D6",
    backgroundColor: "#EEF3FF",
  },
  chipText: {
    fontWeight: "700",
    color: "#546272",
  },
  chipTextActive: {
    color: "#2B57D6",
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  typePill: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2B57D6",
  },
  itemMeta: {
    fontSize: 14,
    color: "#5A6A7B",
    fontWeight: "600",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    backgroundColor: "#F7F9FC",
    alignItems: "center",
    justifyContent: "center",
  },
  warnButton: {
    borderColor: "#E7B97E",
    backgroundColor: "#FFF5E6",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#465566",
  },
});
