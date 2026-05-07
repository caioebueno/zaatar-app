import OrderEditorModal from "@/components/dispatch/order-modal/OrderEditorModal";

type CreateOrderModalProps = {
  visible: boolean;
  apiBaseUrl: string;
  onClose: () => void;
};

export default function CreateOrderModal({
  visible,
  apiBaseUrl,
  onClose,
}: CreateOrderModalProps) {
  return (
    <OrderEditorModal
      visible={visible}
      apiBaseUrl={apiBaseUrl}
      mode="create"
      title="Criar Pedido"
      submitLabel="Criar pedido"
      onClose={onClose}
    />
  );
}
