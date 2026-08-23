import OrderEditorModal from "@/components/dispatch/order-modal/OrderEditorModal";

type CreateOrderModalProps = {
  visible: boolean;
  apiBaseUrl: string;
  authToken: string;
  onClose: () => void;
};

export default function CreateOrderModal({
  visible,
  apiBaseUrl,
  authToken,
  onClose,
}: CreateOrderModalProps) {
  return (
    <OrderEditorModal
      visible={visible}
      apiBaseUrl={apiBaseUrl}
      authToken={authToken}
      mode="create"
      title="Criar Pedido"
      submitLabel="Criar pedido"
      onClose={onClose}
    />
  );
}
