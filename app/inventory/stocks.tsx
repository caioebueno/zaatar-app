import InventoryScreen, {
  InventoryCard,
  InventoryEmpty,
  InventoryError,
  InventoryLabel,
} from "@/components/inventory/InventoryScreen";
import { useInventoryPlaces } from "@/hooks/inventory/usePlaces";
import { useInventoryProducts } from "@/hooks/inventory/useProducts";
import {
  useDeleteInventoryStock,
  useInventoryStocks,
  useUpdateInventoryStockChecklistPrompt,
  useUpsertInventoryStock,
} from "@/hooks/inventory/useStocks";
import Feather from "@expo/vector-icons/Feather";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

type StockRow = {
  id: string;
  placeId: string;
  placeName: string;
  productId: string;
  productName: string;
  currentQuantity: number;
  minQuantity: number;
  notifyBelowThreshold: boolean;
  includeInChecklist: boolean;
  lastCheckedAt: string | null;
};

export default function InventoryStocksScreen() {
  const { width } = useWindowDimensions();
  const { data: places = [] } = useInventoryPlaces();
  const { data: products = [] } = useInventoryProducts();

  const [filterPlaceId, setFilterPlaceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, isError, error } = useInventoryStocks(filterPlaceId);
  const upsertStock = useUpsertInventoryStock();
  const updateChecklistPrompt = useUpdateInventoryStockChecklistPrompt();
  const deleteStock = useDeleteInventoryStock();

  const [placeId, setPlaceId] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearchInput, setProductSearchInput] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [notifyBelowThreshold, setNotifyBelowThreshold] = useState(false);
  const [includeInChecklist, setIncludeInChecklist] = useState(true);
  const [updatingStockKey, setUpdatingStockKey] = useState<string | null>(null);
  const [deletingStockKey, setDeletingStockKey] = useState<string | null>(null);
  const [editedMinByStockKey, setEditedMinByStockKey] = useState<Record<string, string>>({});

  const isTabletOrLarger = width >= 900;
  const activePlaces = useMemo(
    () => [...places].filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name)),
    [places],
  );
  const activeProducts = useMemo(
    () => [...products].filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const selectedProduct = activeProducts.find((item) => item.id === productId) ?? null;
  const productSearch = productSearchInput.trim().toLowerCase();
  const visibleProducts = useMemo(() => {
    const baseList = activeProducts.filter((product) =>
      productSearch.length === 0 ? true : product.name.toLowerCase().includes(productSearch),
    );

    if (selectedProduct && !baseList.some((product) => product.id === selectedProduct.id)) {
      return [selectedProduct, ...baseList].slice(0, 18);
    }

    return baseList.slice(0, 18);
  }, [activeProducts, productSearch, selectedProduct]);

  const filteredStocks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return (data ?? []).filter((stock) => {
      if (normalizedQuery.length === 0) return true;
      return (
        stock.productName.toLowerCase().includes(normalizedQuery) ||
        stock.placeName.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [data, searchQuery]);

  const groupedStocks = useMemo(() => {
    const groups = new Map<string, { placeId: string; placeName: string; rows: StockRow[] }>();

    filteredStocks.forEach((stock) => {
      const currentGroup = groups.get(stock.placeId);
      if (currentGroup) {
        currentGroup.rows.push(stock);
        return;
      }

      groups.set(stock.placeId, {
        placeId: stock.placeId,
        placeName: stock.placeName,
        rows: [stock],
      });
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((a, b) => a.productName.localeCompare(b.productName)),
      }))
      .sort((a, b) => a.placeName.localeCompare(b.placeName));
  }, [filteredStocks]);

  const handleUpsert = async () => {
    const parsedQuantity = Number.parseInt(quantity, 10);
    const parsedMinQuantity = Number.parseInt(minQuantity, 10);
    if (!placeId || !productId || !Number.isFinite(parsedQuantity) || !Number.isFinite(parsedMinQuantity)) {
      return;
    }

    await upsertStock.mutateAsync({
      placeId,
      productId,
      currentQuantity: parsedQuantity,
      minQuantity: parsedMinQuantity,
      notifyBelowThreshold,
      includeInChecklist,
      source: "MANUAL",
    });

    setProductId("");
    setProductSearchInput("");
    setQuantity("0");
    setMinQuantity("0");
    setNotifyBelowThreshold(false);
    setIncludeInChecklist(true);
  };

  const handleToggleChecklistPrompt = async (
    stockPlaceId: string,
    stockProductId: string,
    nextValue: boolean,
  ) => {
    const nextKey = `${stockPlaceId}:${stockProductId}`;
    setUpdatingStockKey(nextKey);

    try {
      await updateChecklistPrompt.mutateAsync({
        placeId: stockPlaceId,
        productId: stockProductId,
        includeInChecklist: nextValue,
        actorId: null,
      });
    } finally {
      setUpdatingStockKey(null);
    }
  };

  const handleSaveStockMinQuantity = async (stock: StockRow) => {
    const stockKey = `${stock.placeId}:${stock.productId}`;
    const rawValue = editedMinByStockKey[stockKey] ?? String(stock.minQuantity);
    const parsedMinQuantity = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedMinQuantity) || parsedMinQuantity < 0) return;

    setUpdatingStockKey(stockKey);

    try {
      await upsertStock.mutateAsync({
        placeId: stock.placeId,
        productId: stock.productId,
        currentQuantity: stock.currentQuantity,
        minQuantity: parsedMinQuantity,
        notifyBelowThreshold: stock.notifyBelowThreshold,
        includeInChecklist: stock.includeInChecklist,
        source: "MANUAL",
      });

      setEditedMinByStockKey((previous) => {
        const next = { ...previous };
        delete next[stockKey];
        return next;
      });
    } finally {
      setUpdatingStockKey(null);
    }
  };

  const handleToggleThresholdNotification = async (
    stockPlaceId: string,
    stockProductId: string,
    nextValue: boolean,
  ) => {
    const stock = filteredStocks.find(
      (item) => item.placeId === stockPlaceId && item.productId === stockProductId,
    );
    if (!stock) return;

    const nextKey = `${stockPlaceId}:${stockProductId}`;
    setUpdatingStockKey(nextKey);

    try {
      await upsertStock.mutateAsync({
        placeId: stock.placeId,
        productId: stock.productId,
        currentQuantity: stock.currentQuantity,
        minQuantity: stock.minQuantity,
        notifyBelowThreshold: nextValue,
        includeInChecklist: stock.includeInChecklist,
        source: "MANUAL",
      });
    } finally {
      setUpdatingStockKey(null);
    }
  };

  const handleDeleteStock = (stock: StockRow) => {
    Alert.alert("Excluir estoque", `Deseja excluir o estoque de ${stock.productName}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          const stockKey = `${stock.placeId}:${stock.productId}`;
          setDeletingStockKey(stockKey);
          void deleteStock
            .mutateAsync({
              placeId: stock.placeId,
              productId: stock.productId,
              actorId: null,
              source: "MANUAL",
            })
            .finally(() => {
              setDeletingStockKey(null);
            });
        },
      },
    ]);
  };

  return (
    <InventoryScreen scrollable={false}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <InventoryCard>
          <InventoryLabel>Novo estoque</InventoryLabel>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Local</Text>
            <View style={styles.chipRow}>
              {activePlaces.map((place) => {
                const active = placeId === place.id;
                return (
                  <Pressable
                    key={place.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setPlaceId(place.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{place.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Produto</Text>
            <TextInput
              style={styles.input}
              value={productSearchInput}
              onChangeText={setProductSearchInput}
              placeholder="Buscar produto"
              placeholderTextColor="#90A0B2"
            />
            <View style={styles.chipRow}>
              {visibleProducts.map((product) => {
                const active = productId === product.id;
                return (
                  <Pressable
                    key={product.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setProductId(product.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{product.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.metricsEditorRow, isTabletOrLarger && styles.metricsEditorRowTablet]}>
            <View style={styles.metricEditorCard}>
              <Text style={styles.metricEditorLabel}>Quantidade atual</Text>
              <TextInput
                style={styles.metricEditorInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#90A0B2"
              />
            </View>
            <View style={styles.metricEditorCard}>
              <Text style={styles.metricEditorLabel}>Quantidade mínima</Text>
              <TextInput
                style={styles.metricEditorInput}
                value={minQuantity}
                onChangeText={setMinQuantity}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#90A0B2"
              />
            </View>
          </View>

          <View style={styles.switchCard}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Alerta abaixo do mínimo</Text>
              <Text style={styles.switchDescription}>
                Ative para avisar quando este estoque ficar abaixo do mínimo.
              </Text>
            </View>
            <Switch value={notifyBelowThreshold} onValueChange={setNotifyBelowThreshold} />
          </View>

          <View style={styles.switchCard}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Checklist diário</Text>
              <Text style={styles.switchDescription}>Defina se este estoque aparece na contagem diária.</Text>
            </View>
            <Switch value={includeInChecklist} onValueChange={setIncludeInChecklist} />
          </View>

          <Pressable style={styles.primaryButton} onPress={() => void handleUpsert()}>
            <Text style={styles.primaryButtonText}>
              {upsertStock.isPending ? "Salvando..." : "Salvar estoque"}
            </Text>
          </Pressable>
        </InventoryCard>

        <InventoryCard>
          <InventoryLabel>Filtros</InventoryLabel>
          <TextInput
            style={styles.input}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por produto ou local"
            placeholderTextColor="#90A0B2"
          />
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !filterPlaceId && styles.chipActive]}
              onPress={() => setFilterPlaceId(null)}
            >
              <Text style={[styles.chipText, !filterPlaceId && styles.chipTextActive]}>Todos</Text>
            </Pressable>
            {activePlaces.map((place) => {
              const active = filterPlaceId === place.id;
              return (
                <Pressable
                  key={`filter-${place.id}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilterPlaceId(place.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{place.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </InventoryCard>

        {isLoading ? <ActivityIndicator size="large" color="#2B57D6" /> : null}
        {isError ? (
          <InventoryError message={error instanceof Error ? error.message : "Não foi possível carregar o estoque."} />
        ) : null}
        {!isLoading && !isError && (groupedStocks.length ?? 0) === 0 ? (
          <InventoryEmpty message="Nenhum estoque encontrado para estes filtros." />
        ) : null}

        {!isLoading && !isError
          ? groupedStocks.map((group) => (
              <InventoryCard key={group.placeId}>
                <View style={styles.groupHeader}>
                  <InventoryLabel>{group.placeName}</InventoryLabel>
                  <Text style={styles.groupCount}>{group.rows.length} itens</Text>
                </View>

                <View style={styles.stockGrid}>
                  {group.rows.map((stock) => {
                    const stockKey = `${stock.placeId}:${stock.productId}`;
                    const isUpdating = updatingStockKey === stockKey;
                    const isDeleting = deletingStockKey === stockKey;

                    return (
                      <View key={stock.id} style={[styles.stockCard, isTabletOrLarger && styles.stockCardTablet]}>
                        <View style={styles.stockCardHeader}>
                          <View style={styles.stockTitleWrap}>
                            <Text style={styles.stockTitle}>{stock.productName}</Text>
                            <Text style={styles.stockTimestamp}>Última conferência: {stock.lastCheckedAt ?? "-"}</Text>
                          </View>
                          <Pressable
                            style={[styles.iconButton, styles.iconButtonDanger, isDeleting && styles.disabledButton]}
                            disabled={isDeleting}
                            onPress={() => handleDeleteStock(stock)}
                          >
                            <Feather name="trash-2" size={16} color="#B33A3A" />
                          </Pressable>
                        </View>

                        <View style={styles.stockStatsRow}>
                          <View style={styles.stockStatCard}>
                            <Text style={styles.stockStatLabel}>Atual</Text>
                            <Text style={styles.stockStatValue}>{stock.currentQuantity}</Text>
                          </View>
                          <View style={[styles.stockStatCard, styles.stockStatCardAccent]}>
                            <Text style={styles.stockStatLabel}>Mínimo</Text>
                            <Text style={[styles.stockStatValue, styles.stockStatValueAccent]}>{stock.minQuantity}</Text>
                          </View>
                        </View>

                        <View style={styles.inlineEditorRow}>
                          <TextInput
                            style={[styles.input, styles.minEditInput]}
                            value={editedMinByStockKey[stockKey] ?? String(stock.minQuantity)}
                            onChangeText={(value) =>
                              setEditedMinByStockKey((previous) => ({
                                ...previous,
                                [stockKey]: value,
                              }))
                            }
                            keyboardType="number-pad"
                            placeholder="Qtd. mín."
                            placeholderTextColor="#90A0B2"
                          />
                          <Pressable
                            style={[styles.secondaryButton, isUpdating && styles.disabledButton]}
                            disabled={isUpdating || isDeleting}
                            onPress={() => void handleSaveStockMinQuantity(stock)}
                          >
                            <Text style={styles.secondaryButtonText}>
                              {isUpdating ? "Salvando..." : "Salvar mínimo"}
                            </Text>
                          </Pressable>
                        </View>

                        <View style={styles.switchCardCompact}>
                          <View style={styles.switchCopyCompact}>
                            <Text style={styles.switchTitle}>Alertar abaixo do mínimo</Text>
                            <Text style={styles.switchDescription}>
                              {stock.notifyBelowThreshold ? "Ativado" : "Desativado"}
                            </Text>
                          </View>
                          <Switch
                            value={stock.notifyBelowThreshold}
                            disabled={isUpdating || isDeleting}
                            onValueChange={(value) =>
                              void handleToggleThresholdNotification(stock.placeId, stock.productId, value)
                            }
                          />
                        </View>

                        <View style={styles.switchCardCompact}>
                          <View style={styles.switchCopyCompact}>
                            <Text style={styles.switchTitle}>Checklist diário</Text>
                            <Text style={styles.switchDescription}>
                              {stock.includeInChecklist ? "Incluído" : "Oculto"}
                            </Text>
                          </View>
                          <Switch
                            value={stock.includeInChecklist}
                            disabled={isUpdating || isDeleting}
                            onValueChange={(value) =>
                              void handleToggleChecklistPrompt(stock.placeId, stock.productId, value)
                            }
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </InventoryCard>
            ))
          : null}
      </ScrollView>
    </InventoryScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5A6A7B",
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: "#FFFFFF",
    color: "#1D2B3A",
  },
  chipRow: {
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
  metricsEditorRow: {
    gap: 10,
  },
  metricsEditorRowTablet: {
    flexDirection: "row",
  },
  metricEditorCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DEE6EF",
    backgroundColor: "#F8FAFC",
    padding: 12,
    gap: 6,
  },
  metricEditorLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#708194",
    textTransform: "uppercase",
  },
  metricEditorInput: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D6DCE5",
    paddingHorizontal: 12,
    fontSize: 22,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  switchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E7EF",
    backgroundColor: "#F8FAFC",
    padding: 12,
  },
  switchCardCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EDF3",
    backgroundColor: "#FAFBFD",
    padding: 12,
  },
  switchCopy: {
    flex: 1,
    gap: 2,
  },
  switchCopyCompact: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  switchDescription: {
    fontSize: 13,
    fontWeight: "600",
    color: "#708194",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#2B57D6",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupCount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#708194",
  },
  stockGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  stockCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E7EE",
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 12,
  },
  stockCardTablet: {
    width: "31.8%",
  },
  stockCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  stockTitleWrap: {
    flex: 1,
    gap: 4,
  },
  stockTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  stockTimestamp: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7A8897",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E7EE",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  iconButtonDanger: {
    borderColor: "#F0C3C3",
    backgroundColor: "#FFF4F4",
  },
  stockStatsRow: {
    flexDirection: "row",
    gap: 8,
  },
  stockStatCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E7EF",
    backgroundColor: "#F7F9FC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  stockStatCardAccent: {
    backgroundColor: "#EEF3FF",
    borderColor: "#D3DEFF",
  },
  stockStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6A7785",
    textTransform: "uppercase",
  },
  stockStatValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  stockStatValueAccent: {
    color: "#2349B6",
  },
  inlineEditorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  minEditInput: {
    flex: 1,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#45566B",
  },
  disabledButton: {
    opacity: 0.45,
  },
});
