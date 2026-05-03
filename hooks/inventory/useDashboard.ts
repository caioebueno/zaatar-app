import { getInventoryDashboard } from "@/services/inventoryApi";
import { useQuery } from "@tanstack/react-query";
import { inventoryQueryKeys } from "./queryKeys";

export function useInventoryDashboard(date?: string | null) {
  return useQuery({
    queryKey: inventoryQueryKeys.dashboard(date),
    queryFn: () => getInventoryDashboard(date),
  });
}
