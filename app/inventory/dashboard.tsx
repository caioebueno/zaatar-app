import InventoryScreen, {
  InventoryCard,
  InventoryEmpty,
  InventoryError,
  InventoryLabel,
} from "@/components/inventory/InventoryScreen";
import InventoryChecklistModalFlow from "@/components/inventory/InventoryChecklistModalFlow";
import { useInventoryDashboard } from "@/hooks/inventory/useDashboard";
import { useInventoryStocks } from "@/hooks/inventory/useStocks";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

function getChecklistStatusLabel(status: string) {
  switch (status) {
    case "OPEN":
      return "Em andamento";
    case "SUBMITTED":
      return "Enviado";
    case "REVIEWED":
      return "Revisado";
    default:
      return status;
  }
}

function getAlertSeverityLabel(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return "Crítico";
    case "HIGH":
      return "Alto";
    case "MEDIUM":
      return "Médio";
    case "LOW":
      return "Baixo";
    default:
      return severity;
  }
}

function getSeverityStyles(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return {
        card: styles.alertCardCritical,
        container: styles.alertSeverityCritical,
        text: styles.alertSeverityCriticalText,
      };
    case "HIGH":
      return {
        card: styles.alertCardHigh,
        container: styles.alertSeverityHigh,
        text: styles.alertSeverityHighText,
      };
    case "MEDIUM":
      return {
        card: styles.alertCardMedium,
        container: styles.alertSeverityMedium,
        text: styles.alertSeverityMediumText,
      };
    default:
      return {
        card: styles.alertCardLow,
        container: styles.alertSeverityLow,
        text: styles.alertSeverityLowText,
      };
  }
}

export default function InventoryDashboardScreen() {
  const { openChecklist } = useLocalSearchParams<{ openChecklist?: string }>();
  const { width } = useWindowDimensions();
  const { data, isLoading, isError, error } = useInventoryDashboard();
  const {
    data: allStocks = [],
    isLoading: stocksLoading,
    isError: stocksError,
    error: stocksErrorDetails,
  } = useInventoryStocks();
  const [isChecklistVisible, setIsChecklistVisible] = useState(false);
  const isTabletOrLarger = width >= 900;
  const checklistNeedsAttention = data
    ? !data.todayChecklist ||
      data.todayChecklist.status === "OPEN" ||
      data.todayChecklist.checkedCount < data.todayChecklist.itemCount
    : false;
  const stockAlerts = useMemo(
    () =>
      allStocks
        .filter(
          (stock) =>
            stock.notifyBelowThreshold &&
            stock.minQuantity > 0 &&
            stock.currentQuantity < stock.minQuantity,
        )
        .map((stock) => {
          const missingQuantity = Math.max(0, stock.minQuantity - stock.currentQuantity);
          const severity =
            stock.currentQuantity <= 0
              ? "CRITICAL"
              : stock.currentQuantity <= Math.floor(stock.minQuantity / 2)
                ? "HIGH"
                : missingQuantity >= 2
                  ? "MEDIUM"
                  : "LOW";

          return {
            id: stock.id,
            placeName: stock.placeName,
            productName: stock.productName,
            severity,
            currentQuantity: stock.currentQuantity,
            minQuantity: stock.minQuantity,
            missingQuantity,
          };
        })
        .sort((first, second) => {
          const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
          const severityComparison =
            severityOrder[first.severity as keyof typeof severityOrder] -
            severityOrder[second.severity as keyof typeof severityOrder];

          if (severityComparison !== 0) return severityComparison;
          return first.productName.localeCompare(second.productName);
        }),
    [allStocks],
  );

  useEffect(() => {
    if (openChecklist === "1") {
      setIsChecklistVisible(true);
      router.replace("/inventory/dashboard" as never);
    }
  }, [openChecklist]);

  return (
    <InventoryScreen
      title="Painel de Estoque"
      subtitle="Visão geral de locais, produtos, alertas e checklist de hoje"
    >
      {isLoading ? <ActivityIndicator size="large" color="#2B57D6" /> : null}
      {isError ? <InventoryError message={error instanceof Error ? error.message : "Não foi possível carregar o painel."} /> : null}
      {!isLoading && !isError && !data ? <InventoryEmpty message="Nenhum dado do painel disponível." /> : null}

      {data ? (
        <>
          <InventoryCard>
            <InventoryLabel>Checklist de hoje</InventoryLabel>
            {data.todayChecklist ? (
              <Pressable
                style={[
                  styles.bannerCard,
                  checklistNeedsAttention && styles.bannerCardAttention,
                ]}
                onPress={() => setIsChecklistVisible(true)}
              >
                <Text
                  style={[
                    styles.bannerTitle,
                    checklistNeedsAttention && styles.bannerTitleAttention,
                  ]}
                >
                  {checklistNeedsAttention
                    ? "Checklist precisa ser finalizado"
                    : "Checklist concluído"}
                </Text>
                <Text style={styles.checklistStatus}>
                  Status: {getChecklistStatusLabel(data.todayChecklist.status)}
                </Text>
                <Text style={styles.checklistMeta}>Itens: {data.todayChecklist.itemCount}</Text>
                <Text style={styles.checklistMeta}>Conferidos: {data.todayChecklist.checkedCount}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.bannerCard, styles.bannerCardAttention]}
                onPress={() => setIsChecklistVisible(true)}
              >
                <Text style={[styles.bannerTitle, styles.bannerTitleAttention]}>
                  Checklist ainda não iniciado
                </Text>
                <Text style={styles.checklistMeta}>Toque aqui para iniciar o checklist de hoje.</Text>
              </Pressable>
            )}
          </InventoryCard>

          <InventoryCard>
            <InventoryLabel>Alertas</InventoryLabel>
            {stocksLoading ? <ActivityIndicator size="small" color="#2B57D6" /> : null}
            {stocksError ? (
              <InventoryError
                message={
                  stocksErrorDetails instanceof Error
                    ? stocksErrorDetails.message
                    : "Não foi possível carregar os alertas."
                }
              />
            ) : null}
            {!stocksLoading && !stocksError && stockAlerts.length === 0 ? (
              <View style={styles.alertsEmptyCard}>
                <Text style={styles.alertsEmptyTitle}>Nenhum alerta aberto</Text>
                <Text style={styles.alertsEmptyMeta}>
                  Tudo certo por agora. Os novos alertas vão aparecer aqui.
                </Text>
              </View>
            ) : null}
            {!stocksLoading && !stocksError
              ? (
                <View style={styles.alertGrid}>
                  {stockAlerts.map((alert) => {
                    const severityStyles = getSeverityStyles(alert.severity);

                    return (
                      <Pressable
                        key={alert.id}
                        style={[
                          styles.alertListCard,
                          severityStyles.card,
                          isTabletOrLarger && styles.alertListCardTablet,
                        ]}
                      >
                        <View style={styles.alertListHeader}>
                          <View style={styles.alertTitleWrap}>
                            <Text style={styles.alertListTitle}>{alert.productName}</Text>
                            <Text style={styles.alertListSubtitle}>{alert.placeName}</Text>
                          </View>
                          <View style={[styles.alertSeverityBadge, severityStyles.container]}>
                            <Text style={[styles.alertSeverityText, severityStyles.text]}>
                              {getAlertSeverityLabel(alert.severity)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.alertNumbersRow}>
                          <View style={styles.alertNumberCard}>
                            <Text style={styles.alertNumberLabel}>Atual</Text>
                            <Text style={styles.alertNumberValue}>{alert.currentQuantity}</Text>
                          </View>
                          <View style={styles.alertNumberCard}>
                            <Text style={styles.alertNumberLabel}>Desejado</Text>
                            <Text style={styles.alertNumberValue}>{alert.minQuantity}</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )
              : null}
          </InventoryCard>
        </>
      ) : null}

      <InventoryChecklistModalFlow
        visible={isChecklistVisible}
        onClose={() => setIsChecklistVisible(false)}
      />
    </InventoryScreen>
  );
}

const styles = StyleSheet.create({
  bannerCard: {
    minHeight: 96,
    borderRadius: 14,
    backgroundColor: "#EEF3FF",
    borderWidth: 1,
    borderColor: "#D7E2FF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
    gap: 4,
  },
  bannerCardAttention: {
    backgroundColor: "#FFF4D6",
    borderColor: "#F0D285",
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2349B6",
  },
  bannerTitleAttention: {
    color: "#946200",
  },
  checklistStatus: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1D2B3A",
  },
  checklistMeta: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5A6A7B",
  },
  alertsEmptyCard: {
    minHeight: 96,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3E8EF",
    backgroundColor: "#F8FAFD",
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
    gap: 6,
  },
  alertsEmptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  alertsEmptyMeta: {
    fontSize: 14,
    fontWeight: "600",
    color: "#708194",
  },
  alertGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  alertListCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EAF1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  alertListCardTablet: {
    width: "31.8%",
  },
  alertCardCritical: {
    backgroundColor: "#FFF1F1",
    borderColor: "#F0C1C1",
  },
  alertCardHigh: {
    backgroundColor: "#FFF5E8",
    borderColor: "#F1D2A7",
  },
  alertCardMedium: {
    backgroundColor: "#FFF9E5",
    borderColor: "#EDDB8B",
  },
  alertCardLow: {
    backgroundColor: "#F5F8FF",
    borderColor: "#D9E3FF",
  },
  alertListHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  alertTitleWrap: {
    flex: 1,
    gap: 2,
  },
  alertListTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  alertListSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#708194",
  },
  alertNumbersRow: {
    flexDirection: "row",
    gap: 8,
  },
  alertNumberCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(29, 43, 58, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 2,
  },
  alertNumberLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#66788B",
    textTransform: "uppercase",
  },
  alertNumberValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1D2B3A",
  },
  alertSeverityBadge: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderWidth: 1,
  },
  alertSeverityText: {
    fontSize: 12,
    fontWeight: "800",
  },
  alertSeverityCritical: {
    backgroundColor: "#FFE4E4",
    borderColor: "#F2B5B5",
  },
  alertSeverityCriticalText: {
    color: "#A12828",
  },
  alertSeverityHigh: {
    backgroundColor: "#FFF0DE",
    borderColor: "#F0CB95",
  },
  alertSeverityHighText: {
    color: "#A15B00",
  },
  alertSeverityMedium: {
    backgroundColor: "#FFF8D9",
    borderColor: "#EFD77B",
  },
  alertSeverityMediumText: {
    color: "#8A6A00",
  },
  alertSeverityLow: {
    backgroundColor: "#EEF3FF",
    borderColor: "#CEDBFF",
  },
  alertSeverityLowText: {
    color: "#2950B8",
  },
});
