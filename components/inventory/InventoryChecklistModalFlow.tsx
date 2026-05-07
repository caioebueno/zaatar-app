import ChecklistTransferModal from "@/components/inventory/ChecklistTransferModal";
import Feather from "@expo/vector-icons/Feather";
import {
  useOpenDailyInventoryChecklist,
  useSubmitInventoryChecklist,
  useTodayInventoryChecklist,
  useUpdateInventoryChecklistItem,
} from "@/hooks/inventory/useChecklist";
import { useInventoryStocks } from "@/hooks/inventory/useStocks";
import { InventoryChecklistItem } from "@/types/inventory";
import { getInventoryErrorMessage } from "@/utils/inventoryErrors";
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
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const RESULT_STYLES: Record<
  InventoryChecklistItem["result"],
  { backgroundColor: string; color: string }
> = {
  PENDING: { backgroundColor: "#FFF2CC", color: "#7A5A00" },
  OK: { backgroundColor: "#E6F4EA", color: "#1E6A2B" },
  BELOW_MIN: { backgroundColor: "#FFE8D9", color: "#9B4A00" },
  REFILL_NEEDED: { backgroundColor: "#FFE8D9", color: "#9B4A00" },
  OUT_OF_STOCK: { backgroundColor: "#FDE7E9", color: "#A51D2D" },
};

const RESULT_LABELS: Record<InventoryChecklistItem["result"], string> = {
  PENDING: "Pendente",
  OK: "OK",
  BELOW_MIN: "Abaixo do mínimo",
  REFILL_NEEDED: "Precisa repor",
  OUT_OF_STOCK: "Sem estoque",
};

export default function InventoryChecklistModalFlow({ visible, onClose }: Props) {
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingQuantityById, setEditingQuantityById] = useState<Record<string, string>>({});
  const [rowErrorById, setRowErrorById] = useState<Record<string, string | null>>({});
  const [transferItem, setTransferItem] = useState<InventoryChecklistItem | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hasAttemptedAutoOpen, setHasAttemptedAutoOpen] = useState(false);
  const [isSubmittingChecklist, setIsSubmittingChecklist] = useState(false);

  const { data, isLoading, isError, error } = useTodayInventoryChecklist();
  const { data: allStocks = [] } = useInventoryStocks();

  const openChecklist = useOpenDailyInventoryChecklist();
  const submitChecklist = useSubmitInventoryChecklist();
  const updateItem = useUpdateInventoryChecklistItem();

  const isReadOnly = !!data && data.status === "REVIEWED";
  const canSubmitChecklist = data?.status === "OPEN";

  useEffect(() => {
    if (!visible) {
      setHasAttemptedAutoOpen(false);
      setCreateError(null);
      return;
    }

    if (data || isLoading || openChecklist.isPending || hasAttemptedAutoOpen) {
      return;
    }

    setHasAttemptedAutoOpen(true);
    setCreateError(null);

    void (async () => {
      try {
        const checklist = await openChecklist.mutateAsync({
          date: null,
          workerId: null,
        });

        const nextItems = [...checklist.items].sort((a, b) => {
          const placeComparison = a.placeName.localeCompare(b.placeName);
          if (placeComparison !== 0) return placeComparison;
          return a.productName.localeCompare(b.productName);
        });
        const firstPendingIndex = nextItems.findIndex((item) => item.countedQuantity === null);
        setCurrentStepIndex(firstPendingIndex >= 0 ? firstPendingIndex : 0);
      } catch (mutationError) {
        setCreateError(getInventoryErrorMessage(mutationError, "Não foi possível abrir o checklist diário."));
      }
    })();
  }, [data, hasAttemptedAutoOpen, isLoading, openChecklist, visible]);

  useEffect(() => {
    if (!data) return;

    setEditingQuantityById((previous) => {
      const next = { ...previous };
      data.items.forEach((item) => {
        const matchingStock = allStocks.find(
          (stock) => stock.placeId === item.placeId && stock.productId === item.productId,
        );
        next[item.id] =
          item.countedQuantity === null
            ? (next[item.id] ?? String(matchingStock?.currentQuantity ?? 0))
            : String(item.countedQuantity);
      });
      return next;
    });
  }, [allStocks, data]);

  const orderedItems = useMemo(() => {
    return [...(data?.items ?? [])].sort((a, b) => {
      const placeComparison = a.placeName.localeCompare(b.placeName);
      if (placeComparison !== 0) return placeComparison;
      return a.productName.localeCompare(b.productName);
    });
  }, [data?.items]);

  const currentItem = orderedItems[currentStepIndex] ?? null;
  const currentQuantityValue = currentItem
    ? Number.parseInt(editingQuantityById[currentItem.id] ?? "0", 10)
    : 0;
  const normalizedCurrentQuantityValue = Number.isFinite(currentQuantityValue)
    ? currentQuantityValue
    : 0;
  const isCurrentQuantityBelowMinimum = currentItem
    ? normalizedCurrentQuantityValue < currentItem.expectedMinQuantity
    : false;
  const currentItemMovableStockQuantity = currentItem
    ? allStocks
        .filter(
          (stock) =>
            stock.productId === currentItem.productId &&
            stock.placeId !== currentItem.placeId &&
            stock.currentQuantity > 0,
        )
        .reduce((total, stock) => total + stock.currentQuantity, 0)
    : 0;
  const currentItemHasTransferSourcePlace = currentItemMovableStockQuantity > 0;
  const mustMoveInventoryBeforeNext =
    !!currentItem &&
    !isReadOnly &&
    isCurrentQuantityBelowMinimum &&
    currentItemHasTransferSourcePlace;

  useEffect(() => {
    if (orderedItems.length === 0) {
      setCurrentStepIndex(0);
      return;
    }

    if (currentStepIndex > orderedItems.length - 1) {
      setCurrentStepIndex(orderedItems.length - 1);
    }
  }, [currentStepIndex, orderedItems.length]);

  const handleSaveRow = async (item: InventoryChecklistItem) => {
    if (!data || isReadOnly) return false;

    const rawQuantity = editingQuantityById[item.id] ?? "";
    const parsedQuantity = Number.parseInt(rawQuantity, 10);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      setRowErrorById((previous) => ({
        ...previous,
        [item.id]: "A quantidade deve ser um número inteiro igual ou maior que zero.",
      }));
      return false;
    }

    setRowErrorById((previous) => ({ ...previous, [item.id]: null }));

    try {
      await updateItem.mutateAsync({
        checklistId: data.id,
        itemId: item.id,
        countedQuantity: parsedQuantity,
        notes: item.notes ?? null,
        workerId: null,
      });
      return true;
    } catch (mutationError) {
      setRowErrorById((previous) => ({
        ...previous,
        [item.id]: getInventoryErrorMessage(mutationError, "Não foi possível salvar esta linha."),
      }));
      return false;
    }
  };

  const handleSubmitChecklist = async () => {
    if (!data) return;

    setSubmitError(null);
    setIsSubmittingChecklist(true);

    try {
      for (let index = 0; index < orderedItems.length; index += 1) {
        const item = orderedItems[index];
        const saved = await handleSaveRow(item);

        if (!saved) {
          setCurrentStepIndex(index);
          setSubmitError("Não foi possível salvar todos os itens antes de enviar o checklist.");
          return;
        }
      }

      await submitChecklist.mutateAsync({
        checklistId: data.id,
        workerId: null,
      });
      onClose();
    } catch (mutationError) {
      setSubmitError(getInventoryErrorMessage(mutationError, "Não foi possível enviar o checklist."));
    } finally {
      setIsSubmittingChecklist(false);
    }
  };

  const adjustQuantity = (itemId: string, delta: number) => {
    setEditingQuantityById((previous) => {
      const currentValue = Number.parseInt(previous[itemId] ?? "0", 10);
      const safeCurrentValue = Number.isFinite(currentValue) ? currentValue : 0;
      const nextValue = Math.max(safeCurrentValue + delta, 0);
      return {
        ...previous,
        [itemId]: String(nextValue),
      };
    });
  };

  const increaseQuantity = (itemId: string, delta: number) => {
    setEditingQuantityById((previous) => {
      const currentValue = Number.parseInt(previous[itemId] ?? "0", 10);
      const safeCurrentValue = Number.isFinite(currentValue) ? currentValue : 0;
      return {
        ...previous,
        [itemId]: String(Math.max(safeCurrentValue + delta, 0)),
      };
    });
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <SafeAreaView style={styles.stepperPage}>
          <View style={styles.stepperHeader}>
            <View style={styles.stepperHeaderTop}>
              <Text style={styles.stepperTitle}>Checklist</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={styles.stepperClose}>Fechar</Text>
              </Pressable>
            </View>
          </View>

          {!data ? (
            <View style={styles.centerState}>
              {openChecklist.isPending || isLoading ? (
                <>
                  <ActivityIndicator size="large" color="#2B57D6" />
                  <Text style={styles.centerStateText}>Preparando o checklist de hoje...</Text>
                </>
              ) : createError ? (
                <Text style={styles.errorText}>{createError}</Text>
              ) : (
                <Text style={styles.centerStateText}>Preparando o checklist de hoje...</Text>
              )}
            </View>
          ) : isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color="#2B57D6" />
            </View>
          ) : isError ? (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>
                  {error instanceof Error
                  ? getInventoryErrorMessage(error, "Não foi possível carregar o checklist.")
                  : "Não foi possível carregar o checklist."}
                </Text>
              </View>
          ) : currentItem ? (
            <>
              <View style={styles.stepperHeader}>
                <Text style={styles.stepperProgress}>
                  Item {currentStepIndex + 1} de {orderedItems.length}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${((currentStepIndex + 1) / Math.max(orderedItems.length, 1)) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              <ScrollView contentContainerStyle={styles.stepperScrollContent}>
                <View style={styles.stepCard}>
                  <Text style={styles.stepPlace}>{currentItem.placeName}</Text>
                  <View style={styles.rowHeader}>
                    <Text style={styles.stepProduct}>{currentItem.productName}</Text>
                    <View
                      style={[
                        styles.resultBadge,
                        { backgroundColor: RESULT_STYLES[currentItem.result].backgroundColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.resultBadgeText,
                          { color: RESULT_STYLES[currentItem.result].color },
                        ]}
                      >
                        {RESULT_LABELS[currentItem.result]}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>Quantidade contada</Text>
                  <View style={styles.quantitySelector}>
                    <Pressable
                      style={[styles.quantityButton, isReadOnly && styles.disabledButton]}
                      disabled={isReadOnly}
                      onPress={() => adjustQuantity(currentItem.id, -1)}
                    >
                      <Feather name="minus" size={24} color="#FFFFFF" />
                    </Pressable>
                    <View style={styles.quantityValueCard}>
                      <Text style={styles.quantityValueText}>
                        {editingQuantityById[currentItem.id] ?? "0"}
                      </Text>
                      <View style={styles.quantityDivider} />
                      <Text style={styles.quantityMinText}>{currentItem.expectedMinQuantity}</Text>
                    </View>
                    <Pressable
                      style={[styles.quantityButton, isReadOnly && styles.disabledButton]}
                      disabled={isReadOnly}
                      onPress={() => adjustQuantity(currentItem.id, 1)}
                    >
                      <Feather name="plus" size={24} color="#FFFFFF" />
                    </Pressable>
                  </View>

                  {isCurrentQuantityBelowMinimum && !isReadOnly ? (
                    <View style={styles.warningCard}>
                      <Text style={styles.warningTitle}>Quantidade abaixo do mínimo</Text>
                      {mustMoveInventoryBeforeNext ? (
                        <Text style={styles.warningText}>
                          {`Ainda existem ${currentItemMovableStockQuantity} unidades disponíveis em outros locais. Mova o estoque antes de seguir para o próximo item.`}
                        </Text>
                      ) : null}
                      <Pressable
                        style={[
                          styles.warningButton,
                          !currentItemHasTransferSourcePlace && styles.disabledButton,
                        ]}
                        disabled={!currentItemHasTransferSourcePlace}
                        onPress={() => setTransferItem(currentItem)}
                      >
                        <Text style={styles.warningButtonText}>
                          {currentItemHasTransferSourcePlace ? "Mover estoque" : "Sem estoque"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {rowErrorById[currentItem.id] ? (
                    <Text style={styles.errorText}>{rowErrorById[currentItem.id]}</Text>
                  ) : null}

                  {!isReadOnly && !isCurrentQuantityBelowMinimum ? (
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        !currentItemHasTransferSourcePlace && styles.disabledButton,
                      ]}
                      disabled={!currentItemHasTransferSourcePlace}
                      onPress={() => setTransferItem(currentItem)}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {currentItemHasTransferSourcePlace ? "Mover estoque se precisar" : "Sem estoque"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {submitError ? (
                  <View style={styles.submitWarningCard}>
                    <Text style={styles.errorText}>{submitError}</Text>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.stepperFooter}>
                <View style={styles.stepperNavRow}>
                  <Pressable
                    style={[styles.secondaryButton, currentStepIndex === 0 && styles.disabledButton]}
                    disabled={currentStepIndex === 0}
                    onPress={() => setCurrentStepIndex((previous) => Math.max(previous - 1, 0))}
                  >
                    <Text style={styles.secondaryButtonText}>Anterior</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.secondaryButton,
                      (currentStepIndex === orderedItems.length - 1 || mustMoveInventoryBeforeNext) &&
                        styles.disabledButton,
                    ]}
                    disabled={currentStepIndex === orderedItems.length - 1 || mustMoveInventoryBeforeNext}
                    onPress={() =>
                      setCurrentStepIndex((previous) => Math.min(previous + 1, orderedItems.length - 1))
                    }
                  >
                    <Text style={styles.secondaryButtonText}>
                      {mustMoveInventoryBeforeNext ? "Mova o estoque primeiro" : "Próximo"}
                    </Text>
                  </Pressable>
                </View>

                {canSubmitChecklist && currentStepIndex === orderedItems.length - 1 ? (
                  <Pressable
                    style={[
                      styles.submitButton,
                      (submitChecklist.isPending || isSubmittingChecklist) && styles.disabledButton,
                    ]}
                    disabled={submitChecklist.isPending || isSubmittingChecklist}
                    onPress={() => void handleSubmitChecklist()}
                  >
                    <View style={styles.submitButtonContent}>
                      {isSubmittingChecklist || submitChecklist.isPending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : null}
                      <Text style={styles.submitButtonText}>
                        {isSubmittingChecklist || submitChecklist.isPending
                          ? "Salvando e enviando..."
                          : "Enviar checklist"}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.centerState}>
              <Text style={styles.stepperProgress}>Nenhum item disponível no checklist.</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {data && transferItem ? (
        <ChecklistTransferModal
          visible
          checklistId={data.id}
          checklistItemId={transferItem.id}
          destinationPlaceId={transferItem.placeId}
          destinationPlaceName={transferItem.placeName}
          productId={transferItem.productId}
          productName={transferItem.productName}
          workerId={null}
          onClose={() => setTransferItem(null)}
          onSuccess={(movedQuantity) => {
            increaseQuantity(transferItem.id, movedQuantity);
            setRowErrorById((previous) => ({ ...previous, [transferItem.id]: null }));
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  centerStateText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#5A6A7B",
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  resultBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  resultBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  fieldLabel: {
    fontSize: 14,
    color: "#4F6175",
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: "#2B57D6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flex: 1,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#F8FAFC",
    flex: 1,
  },
  secondaryButtonText: {
    color: "#45566B",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: "#1E6A2B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  submitButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#B3261E",
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.45,
  },
  stepperPage: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  stepperHeader: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E3E6EA",
    gap: 10,
  },
  stepperHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stepperTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  stepperClose: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2B57D6",
  },
  stepperProgress: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5A6A7B",
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E7ECF3",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#2B57D6",
  },
  stepperScrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  stepCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 14,
  },
  stepPlace: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2B57D6",
    textTransform: "uppercase",
  },
  stepProduct: {
    flex: 1,
    fontSize: 24,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  submitWarningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0D0CC",
    backgroundColor: "#FFF6F5",
    padding: 14,
  },
  stepperFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#E3E6EA",
    backgroundColor: "#FFFFFF",
  },
  stepperNavRow: {
    flexDirection: "row",
    gap: 8,
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5C875",
    backgroundColor: "#FFF8DD",
    padding: 14,
    gap: 10,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#8A6400",
  },
  warningText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#7A651A",
  },
  warningButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#E5B93C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  warningButtonText: {
    color: "#3E2E00",
    fontWeight: "800",
    fontSize: 14,
  },
  quantitySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  quantityButton: {
    width: 72,
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: "#2B57D6",
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  quantityValueText: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  quantityDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#D6DCE5",
    marginLeft: 10,
    marginRight: 8,
  },
  quantityMinText: {
    minWidth: 28,
    fontSize: 15,
    fontWeight: "800",
    color: "#6C7A89",
    textAlign: "center",
  },
});
