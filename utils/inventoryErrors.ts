import { InventoryRequestError } from "@/services/inventoryApi";

export function getInventoryErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof InventoryRequestError) {
    if (error.code === "INVALID_PAYLOAD") {
      if (error.field) return `Revise o campo: ${error.field}.`;
      return "Alguns valores são inválidos. Revise e tente novamente.";
    }

    if (error.code === "NOT_FOUND") {
      return "O registro de estoque solicitado não foi encontrado. Atualize e tente novamente.";
    }

    if (error.code === "CONFLICT") {
      if (error.reason === "CHECKLIST_NOT_OPEN") {
        return "O checklist não está mais aberto. Atualize o status do checklist.";
      }
      return "Esta ação entrou em conflito com o estado atual do estoque. Atualize e tente novamente.";
    }

    return error.message || fallbackMessage;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export function getTransferErrorMessage(error: unknown) {
  if (error instanceof InventoryRequestError) {
    if (error.reason === "INSUFFICIENT_SOURCE_STOCK") {
      return "Não há estoque suficiente no local de origem para essa transferência.";
    }

    if (error.reason === "SOURCE_STOCK_NOT_FOUND") {
      return "O estoque de origem não foi encontrado para este produto/local. Escolha outro local de origem.";
    }

    if (error.code === "INVALID_PAYLOAD") {
      return error.field
        ? `O campo da transferência é inválido: ${error.field}.`
        : "Os dados da transferência são inválidos. Revise e tente novamente.";
    }

    if (error.code === "NOT_FOUND") {
      return "O registro de origem ou destino da transferência não foi encontrado. Atualize e tente novamente.";
    }

    if (error.code === "CONFLICT") {
      return "Foi detectado um conflito na transferência. Atualize o estoque e tente novamente.";
    }
  }

  return getInventoryErrorMessage(error, "Não foi possível transferir o estoque agora.");
}
