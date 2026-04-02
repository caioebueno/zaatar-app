type TAddress = {
  id: string;
  createdAt: string;
  description: string;
  street: string;
  number: string;
  city: string;
  state: string;
  zipCode: string;
  lat: string;
  lng: string;
  complement?: string;
  numberComplement?: string;
  customerId?: string;
};

export default TAddress;
