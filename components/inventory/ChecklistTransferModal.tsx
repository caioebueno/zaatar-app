import { useInventoryPlaces } from "@/hooks/inventory/usePlaces";
import { useInventoryStocks, useTransferInventoryStock } from "@/hooks/inventory/useStocks";
import { getTransferErrorMessage } from "@/utils/inventoryErrors";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  checklistId: string;
  checklistItemId: string;
  destinationPlaceId: string;
  destinationPlaceName: string;
  productId: string;
  productName: string;
  workerId?: string | null;
  onClose: () => void;
  onSuccess?: (movedQuantity: number) => void;
};

export default function ChecklistTransferModal({
  visible,
  checklistId,
  checklistItemId,
  destinationPlaceId,
  destinationPlaceName,
  productId,
  productName,
  workerId,
  onClose,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const { data: places = [] } = useInventoryPlaces();
  const transferStock = useTransferInventoryStock();
  const { data: allStocks = [] } = useInventoryStocks();

  const [sourcePlaceId, setSourcePlaceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: sourceStocks = [], isLoading: sourceStocksLoading } = useInventoryStocks(
    sourcePlaceId || undefined,
  );

  const sourcePlaceOptions = useMemo(
    () =>
      places.filter((place) => {
        if (!place.active || place.id === destinationPlaceId) return false;

        return allStocks.some(
          (stock) =>
            stock.placeId === place.id &&
            stock.productId === productId &&
            stock.currentQuantity > 0,
        );
      }),
    [allStocks, destinationPlaceId, places, productId],
  );

  const sourceProductStock = useMemo(
    () => sourceStocks.find((stock) => stock.productId === productId) ?? null,
    [productId, sourceStocks],
  );

  useEffect(() => {
    if (!visible) return;
    if (sourcePlaceOptions.length === 0) {
      if (sourcePlaceId) {
        setSourcePlaceId("");
      }
      return;
    }

    const selectedPlaceStillAvailable = sourcePlaceOptions.some((place) => place.id === sourcePlaceId);
    if (!selectedPlaceStillAvailable) {
      setSourcePlaceId(sourcePlaceOptions[0].id);
    }
  }, [sourcePlaceId, sourcePlaceOptions, visible]);

  useEffect(() => {
    if (!visible) {
      setSourcePlaceId("");
      setQuantity("1");
      setErrorMessage(null);
    }
  }, [visible]);

  const handleTransfer = async () => {
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!sourcePlaceId) {
      setErrorMessage("Escolha primeiro o local de origem.");
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setErrorMessage("A quantidade precisa ser um número inteiro positivo.");
      return;
    }

    setErrorMessage(null);

    try {
      await transferStock.mutateAsync({
        fromPlaceId: sourcePlaceId,
        toPlaceId: destinationPlaceId,
        productId,
        quantity: parsedQuantity,
        actorId: workerId?.trim() ? workerId.trim() : null,
        source: "CHECKLIST",
        checklistId,
        checklistItemId,
        notes: null,
      });
      onSuccess?.(parsedQuantity);
      onClose();
    } catch (error) {
      setErrorMessage(getTransferErrorMessage(error));
    }
  };

  const adjustQuantity = (delta: number) => {
    setQuantity((previous) => {
      const currentValue = Number.parseInt(previous, 10);
      const safeCurrentValue = Number.isFinite(currentValue) ? currentValue : 1;
      return String(Math.max(safeCurrentValue + delta, 1));
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Mover estoque de outro local</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.closeText}>Fechar</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeRow}>
            {sourcePlaceOptions.map((place) => {
              const active = place.id === sourcePlaceId;
              return (
                <Pressable
                  key={place.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSourcePlaceId(place.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{place.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.stockHintWrap}>
            {sourceStocksLoading ? (
              <ActivityIndicator size="small" color="#2B57D6" />
            ) : (
              <Text style={styles.stockHint}>
                Disponível para mover: {sourceProductStock?.currentQuantity ?? 0}
              </Text>
            )}
          </View>

          <View style={styles.quantitySelector}>
            <Pressable style={styles.quantityButton} onPress={() => adjustQuantity(-1)}>
              <Text style={styles.quantityButtonText}>-</Text>
            </Pressable>
            <View style={styles.quantityValueCard}>
              <Text style={styles.quantityValueText}>{quantity}</Text>
            </View>
            <Pressable style={styles.quantityButton} onPress={() => adjustQuantity(1)}>
              <Text style={styles.quantityButtonText}>+</Text>
            </Pressable>
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <View style={styles.footerRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.submitButton, transferStock.isPending && styles.disabledButton]}
              disabled={transferStock.isPending}
              onPress={() => void handleTransfer()}
            >
              <Text style={styles.submitButtonText}>
                {transferStock.isPending ? "Transferindo..." : "Transferir"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 31, 45, 0.44)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 12,
    maxHeight: "85%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  closeText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2B57D6",
  },
  label: {
    fontSize: 14,
    color: "#5A6A7B",
    fontWeight: "700",
  },
  placeRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D5DCE5",
    backgroundColor: "#F6F8FB",
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  chipActive: {
    borderColor: "#2B57D6",
    backgroundColor: "#EEF3FF",
  },
  chipText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#546272",
  },
  chipTextActive: {
    color: "#2B57D6",
  },
  stockHintWrap: {
    minHeight: 20,
    justifyContent: "center",
  },
  stockHint: {
    fontSize: 14,
    color: "#2E5A34",
    fontWeight: "700",
  },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },
  quantitySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quantityButton: {
    width: 72,
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: "#2B57D6",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  quantityValueCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  quantityValueText: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  error: {
    fontSize: 14,
    color: "#B3261E",
    fontWeight: "700",
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F9FC",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#465566",
  },
  submitButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2B57D6",
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
