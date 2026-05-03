import { createInventoryProduct, listInventoryProducts, updateInventoryProduct } from "@/services/inventoryApi";
import type { CreateInventoryProductInput, UpdateInventoryProductInput } from "@/types/inventory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryQueryKeys } from "./queryKeys";

export function useInventoryProducts() {
  return useQuery({
    queryKey: inventoryQueryKeys.products(),
    queryFn: listInventoryProducts,
  });
}

export function useCreateInventoryProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateInventoryProductInput) => createInventoryProduct(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.products() });
      await queryClient.invalidateQueries({ queryKey: ["inventory", "dashboard"] });
    },
  });
}

export function useUpdateInventoryProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateInventoryProductInput) => updateInventoryProduct(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.products() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
      await queryClient.invalidateQueries({ queryKey: ["inventory", "dashboard"] });
    },
  });
}
