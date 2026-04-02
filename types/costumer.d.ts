import TAddress from "./address";

type TCustomer = {
  id: string;
  name: string | null;
  addresses?: TAddress[];
};

export default TCustomer;
