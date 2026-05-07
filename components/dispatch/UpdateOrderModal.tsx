import OrderEditorModal, {
  type TOrderEditorInitialOrder,
} from "@/components/dispatch/order-modal/OrderEditorModal";

type UpdateOrderModalProps = {
  visible: boolean;
  apiBaseUrl: string;
  order: TOrderEditorInitialOrder | null;
  onSuccess?: () => Promise<void> | void;
  onClose: () => void;
};

export default function UpdateOrderModal({
  visible,
  apiBaseUrl,
  order,
  onSuccess,
  onClose,
}: UpdateOrderModalProps) {
  return (
    <OrderEditorModal
      visible={visible}
      apiBaseUrl={apiBaseUrl}
      mode="update"
      title="Atualizar Pedido"
      submitLabel="Update Order"
      initialOrder={order}
      onSuccess={onSuccess}
      onClose={onClose}
    />
  );
}
