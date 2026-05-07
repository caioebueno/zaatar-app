import { createInventoryPlace, listInventoryPlaces, updateInventoryPlace } from "@/services/inventoryApi";
import type { CreateInventoryPlaceInput, UpdateInventoryPlaceInput } from "@/types/inventory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryQueryKeys } from "./queryKeys";

export function useInventoryPlaces() {
  return useQuery({
    queryKey: inventoryQueryKeys.places(),
    queryFn: listInventoryPlaces,
  });
}

export function useCreateInventoryPlace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateInventoryPlaceInput) => createInventoryPlace(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.places() });
      await queryClient.invalidateQueries({ queryKey: ["inventory", "dashboard"] });
    },
  });
}

export function useUpdateInventoryPlace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateInventoryPlaceInput) => updateInventoryPlace(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.places() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
      await queryClient.invalidateQueries({ queryKey: ["inventory", "dashboard"] });
    },
  });
}
