import InventoryScreen, {
  InventoryCard,
  InventoryEmpty,
  InventoryError,
  InventoryLabel,
} from "@/components/inventory/InventoryScreen";
import { useAckInventoryAlert, useInventoryAlerts, useResolveInventoryAlert } from "@/hooks/inventory/useAlerts";
import type { InventoryAlertStatus } from "@/types/inventory";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

const STATUSES: (InventoryAlertStatus | "ALL")[] = ["ALL", "OPEN", "ACKED", "RESOLVED"];

function getAlertStatusLabel(status: InventoryAlertStatus | "ALL") {
  switch (status) {
    case "ALL":
      return "Todos";
    case "OPEN":
      return "Aberto";
    case "ACKED":
      return "Ciente";
    case "RESOLVED":
      return "Resolvido";
    default:
      return status;
  }
}

export default function InventoryAlertsScreen() {
  const [statusFilter, setStatusFilter] = useState<InventoryAlertStatus | "ALL">("OPEN");
  const filters = {
    status: statusFilter === "ALL" ? null : statusFilter,
  };

  const { data, isLoading, isError, error } = useInventoryAlerts(filters);
  const ackAlert = useAckInventoryAlert();
  const resolveAlert = useResolveInventoryAlert();

  return (
    <InventoryScreen title="Alertas" subtitle="Avisos de estoque abertos e histórico">
      <InventoryCard>
        <InventoryLabel>Filtro</InventoryLabel>
        <View style={styles.rowWrap}>
          {STATUSES.map((status) => {
            const active = status === statusFilter;
            return (
              <Pressable
                key={status}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setStatusFilter(status)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {getAlertStatusLabel(status)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </InventoryCard>

      {isLoading ? <ActivityIndicator size="large" color="#2B57D6" /> : null}
      {isError ? <InventoryError message={error instanceof Error ? error.message : "Não foi possível carregar os alertas."} /> : null}
      {!isLoading && !isError && (data?.length ?? 0) === 0 ? <InventoryEmpty message="Nenhum alerta para este filtro." /> : null}

      {(data ?? []).map((alert) => (
        <InventoryCard key={alert.id}>
          <Text style={styles.alertTitle}>{alert.message}</Text>
          <Text style={styles.meta}>Tipo: {alert.type}</Text>
          <Text style={styles.meta}>Gravidade: {alert.severity}</Text>
          <Text style={styles.meta}>Status: {getAlertStatusLabel(alert.status)}</Text>
          <Text style={styles.meta}>Local: {alert.placeName}</Text>
          <Text style={styles.meta}>Produto: {alert.productName}</Text>

          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryButton, alert.status !== "OPEN" && styles.disabledButton]}
              disabled={alert.status !== "OPEN"}
              onPress={() => ackAlert.mutate({ alertId: alert.id })}
            >
              <Text style={styles.secondaryButtonText}>{ackAlert.isPending ? "Confirmando..." : "Confirmar"}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryButton,
                !(alert.status === "OPEN" || alert.status === "ACKED") && styles.disabledButton,
              ]}
              disabled={!(alert.status === "OPEN" || alert.status === "ACKED")}
              onPress={() => resolveAlert.mutate({ alertId: alert.id })}
            >
              <Text style={styles.secondaryButtonText}>
                {resolveAlert.isPending ? "Resolvendo..." : "Resolver"}
              </Text>
            </Pressable>
          </View>
        </InventoryCard>
      ))}
    </InventoryScreen>
  );
}

const styles = StyleSheet.create({
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
  alertTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  meta: {
    fontSize: 14,
    color: "#5A6A7B",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  secondaryButtonText: {
    color: "#45566B",
    fontWeight: "700",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.45,
  },
});
