import { ackInventoryAlert, listInventoryAlerts, resolveInventoryAlert } from "@/services/inventoryApi";
import type {
  AckInventoryAlertInput,
  ListInventoryAlertsInput,
  ResolveInventoryAlertInput,
} from "@/types/inventory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryQueryKeys } from "./queryKeys";

export function useInventoryAlerts(filters: ListInventoryAlertsInput = {}) {
  return useQuery({
    queryKey: inventoryQueryKeys.alerts(filters),
    queryFn: () => listInventoryAlerts(filters),
  });
}

export function useAckInventoryAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AckInventoryAlertInput) => ackInventoryAlert(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory", "alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory", "dashboard"] });
    },
  });
}

export function useResolveInventoryAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ResolveInventoryAlertInput) => resolveInventoryAlert(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory", "alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory", "stocks"] });
    },
  });
}
