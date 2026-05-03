import InventoryScreen, {
  InventoryCard,
  InventoryEmpty,
  InventoryError,
  InventoryLabel,
} from "@/components/inventory/InventoryScreen";
import { useInventoryPlaces } from "@/hooks/inventory/usePlaces";
import { useInventoryProducts } from "@/hooks/inventory/useProducts";
import { useInventoryStocks, useUpsertInventoryStock } from "@/hooks/inventory/useStocks";
import Feather from "@expo/vector-icons/Feather";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useMemo, useState } from "react";

type RefillRow = {
  key: string;
  placeId: string;
  placeName: string;
  productId: string;
  productName: string;
  currentQuantity: number;
  minQuantity: number;
  includeInChecklist: boolean;
};

export default function InventoryRefillScreen() {
  const { width } = useWindowDimensions();
  const { data: places = [] } = useInventoryPlaces();
  const { data: products = [] } = useInventoryProducts();
  const { data: stocks = [], isLoading, isError, error } = useInventoryStocks();
  const upsertStock = useUpsertInventoryStock();

  const [addedQuantityByKey, setAddedQuantityByKey] = useState<Record<string, number>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const isTabletOrLarger = width >= 900;

  const activePlaces = useMemo(
    () =>
      [...places]
        .filter((place) => place.active)
        .sort((first, second) => first.name.localeCompare(second.name)),
    [places],
  );
  const activeProductIds = useMemo(
    () => new Set(products.filter((product) => product.active).map((product) => product.id)),
    [products],
  );

  const groupedRows = useMemo(() => {
    const placeNameById = new Map(activePlaces.map((place) => [place.id, place.name]));
    const groups = new Map<string, { placeId: string; placeName: string; rows: RefillRow[] }>();

    stocks.forEach((stock) => {
      if (!activeProductIds.has(stock.productId)) return;
      const placeName = placeNameById.get(stock.placeId);
      if (!placeName) return;

      const group = groups.get(stock.placeId) ?? {
        placeId: stock.placeId,
        placeName,
        rows: [],
      };

      group.rows.push({
        key: `${stock.placeId}:${stock.productId}`,
        placeId: stock.placeId,
        placeName,
        productId: stock.productId,
        productName: stock.productName,
        currentQuantity: stock.currentQuantity,
        minQuantity: stock.minQuantity,
        includeInChecklist: stock.includeInChecklist,
      });

      groups.set(stock.placeId, group);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((first, second) =>
          first.productName.localeCompare(second.productName),
        ),
      }))
      .sort((first, second) => first.placeName.localeCompare(second.placeName));
  }, [activePlaces, activeProductIds, stocks]);

  const allRows = useMemo(
    () => groupedRows.flatMap((group) => group.rows),
    [groupedRows],
  );

  const rowsWithChanges = useMemo(
    () =>
      allRows.filter((row) => {
        const addedQuantity = addedQuantityByKey[row.key] ?? 0;
        return addedQuantity !== 0;
      }),
    [addedQuantityByKey, allRows],
  );

  const handleAdjustAddedQuantity = (row: RefillRow, delta: number) => {
    setAddedQuantityByKey((previous) => {
      const currentValue = previous[row.key] ?? 0;
      const nextValue = currentValue + delta;
      return {
        ...previous,
        [row.key]: Math.max(nextValue, -row.currentQuantity),
      };
    });
  };

  const handleSaveAllRefill = async () => {
    if (rowsWithChanges.length === 0) return;

    setIsSavingAll(true);

    try {
      for (const row of rowsWithChanges) {
        const addedQuantity = addedQuantityByKey[row.key] ?? 0;
        await upsertStock.mutateAsync({
          placeId: row.placeId,
          productId: row.productId,
          currentQuantity: row.currentQuantity + addedQuantity,
          minQuantity: row.minQuantity,
          includeInChecklist: row.includeInChecklist,
          actorId: null,
          source: "MANUAL",
        });
      }

      setAddedQuantityByKey({});
    } finally {
      setIsSavingAll(false);
    }
  };

  const hasInventoryBaseData = groupedRows.length > 0;

  return (
    <InventoryScreen
      title="Reposição"
      subtitle="Registre entrada de estoque por local e produto"
      scrollable={false}
    >
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {isLoading ? <ActivityIndicator size="large" color="#2B57D6" /> : null}
          {isError ? (
            <InventoryError
              message={error instanceof Error ? error.message : "Não foi possível carregar a reposição."}
            />
          ) : null}
          {!isLoading && !isError && !hasInventoryBaseData ? (
            <InventoryEmpty message="Cadastre estoques nos locais para registrar reposições." />
          ) : null}

          {!isLoading && !isError
            ? groupedRows.map((group) => (
                <InventoryCard key={group.placeId}>
                  <InventoryLabel>{group.placeName}</InventoryLabel>
                <View style={styles.rowsGrid}>
                    {group.rows.map((row) => {
                      const addedQuantity = addedQuantityByKey[row.key] ?? 0;
                      const hasPendingChange = addedQuantity !== 0;

                      return (
                        <View
                          key={row.key}
                          style={[
                            styles.rowCard,
                            isTabletOrLarger && styles.rowCardTablet,
                            hasPendingChange && styles.rowCardActive,
                          ]}
                        >
                          <View style={styles.rowHeader}>
                            <View style={styles.rowTitleWrap}>
                              <Text style={styles.rowTitle}>{row.productName}</Text>
                              <View style={styles.metricsRow}>
                                <View style={styles.metricChip}>
                                  <Text style={styles.metricChipLabel}>Atual</Text>
                                  <Text style={styles.metricChipValue}>{row.currentQuantity}</Text>
                                </View>
                                <View style={[styles.metricChip, styles.metricChipNext]}>
                                  <Text style={styles.metricChipLabel}>Depois</Text>
                                  <Text style={[styles.metricChipValue, styles.metricChipValueNext]}>
                                    {row.currentQuantity + addedQuantity}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>

                          <View style={styles.selectorRow}>
                            <View style={styles.quantitySelector}>
                              <Pressable
                                style={[styles.quantityButton, styles.quantityButtonSecondary]}
                                disabled={isSavingAll}
                                onPress={() => handleAdjustAddedQuantity(row, -1)}
                              >
                                <Feather name="minus" size={24} color="#44566A" />
                              </Pressable>
                              <Pressable
                                style={styles.quantityButton}
                                disabled={isSavingAll}
                                onPress={() => handleAdjustAddedQuantity(row, 1)}
                              >
                                <Feather name="plus" size={24} color="#FFFFFF" />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </InventoryCard>
              ))
            : null}
        </ScrollView>

        {!isLoading && !isError && hasInventoryBaseData ? (
          <View style={styles.bottomBar}>
            <View style={styles.bulkSaveRow}>
              <View style={styles.bulkSaveCopy}>
                <Text style={styles.bulkSaveTitle}>Reposições pendentes</Text>
                <Text style={styles.bulkSaveMeta}>{rowsWithChanges.length} itens com alteração</Text>
              </View>
              <Pressable
                style={[
                  styles.saveButton,
                  (rowsWithChanges.length === 0 || isSavingAll) && styles.saveButtonDisabled,
                ]}
                disabled={rowsWithChanges.length === 0 || isSavingAll}
                onPress={() => void handleSaveAllRefill()}
              >
                <Text style={styles.saveButtonText}>
                  {isSavingAll ? "Salvando..." : "Salvar reposição"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </InventoryScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 120,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: "#E3E6EA",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  bulkSaveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bulkSaveCopy: {
    flex: 1,
    gap: 4,
  },
  bulkSaveTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  bulkSaveMeta: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5A6A7B",
  },
  rowsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  rowCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E7EE",
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 14,
  },
  rowCardTablet: {
    width: "31.8%",
  },
  rowCardActive: {
    borderColor: "#BFD0FF",
    backgroundColor: "#F8FBFF",
    shadowColor: "#2B57D6",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  rowTitleWrap: {
    flex: 1,
    gap: 10,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E7EF",
    backgroundColor: "#F7F9FC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  metricChipNext: {
    backgroundColor: "#EEF3FF",
    borderColor: "#D3DEFF",
  },
  metricChipLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6A7785",
    textTransform: "uppercase",
  },
  metricChipValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  metricChipValueNext: {
    color: "#2349B6",
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  quantitySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    width: "100%",
  },
  quantityButton: {
    flex: 1,
    flexBasis: 0,
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: "#2B57D6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2B57D6",
  },
  quantityButtonSecondary: {
    backgroundColor: "#EFF3F8",
    borderWidth: 1,
    borderColor: "#D6DCE5",
  },
  quantityButtonText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  quantityButtonSecondaryText: {
    color: "#44566A",
  },
  saveButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#2B57D6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
