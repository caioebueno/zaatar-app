import {
  deleteInventoryStock,
  listInventoryStocks,
  transferInventoryStock,
  updateInventoryStockChecklistPrompt,
  upsertInventoryStock,
} from "@/services/inventoryApi";
import type {
  DeleteInventoryStockInput,
  TransferInventoryStockInput,
  UpdateInventoryStockChecklistPromptInput,
  UpsertInventoryStockInput,
} from "@/types/inventory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryQueryKeys } from "./queryKeys";

export function useInventoryStocks(placeId?: string | null) {
  return useQuery({
    queryKey: inventoryQueryKeys.stocks(placeId),
    queryFn: () => listInventoryStocks(placeId),
  });
}

export function useUpsertInventoryStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertInventoryStockInput) => upsertInventoryStock(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.dashboard() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
    },
  });
}

export function useTransferInventoryStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TransferInventoryStockInput) => transferInventoryStock(payload),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks(variables.fromPlaceId) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks(variables.toPlaceId) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistById(variables.checklistId) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistItems(variables.checklistId) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.dashboard() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stockTransfers() });
    },
  });
}

export function useUpdateInventoryStockChecklistPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateInventoryStockChecklistPromptInput) =>
      updateInventoryStockChecklistPrompt(payload),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
      await queryClient.invalidateQueries({
        queryKey: inventoryQueryKeys.stocks(variables.placeId),
      });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.dashboard() });
    },
  });
}

export function useDeleteInventoryStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteInventoryStockInput) => deleteInventoryStock(payload),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
      await queryClient.invalidateQueries({
        queryKey: inventoryQueryKeys.stocks(variables.placeId),
      });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.dashboard() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
    },
  });
}
