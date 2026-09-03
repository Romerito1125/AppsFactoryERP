import {
  Building2,
  CreditCard,
  Package,
  UsersRound,
  WalletCards,
} from "lucide-react";

export const topMenuItems = ["Archivos", "Transacciones"];

export const defaultAdminCredentials = {
  email: "admin@mundotienda.com",
  password: "Admin123*",
};

export const filesMenuItems = [
  { label: "Clientes", action: "clients" },
  { label: "Proveedores", action: "providers" },
  { label: "Productos", action: "products" },
  { label: "Retenciones", action: "retentions" },
  { label: "Usuarios", action: "users" },
];

export const transactionsMenuItems = [
  { label: "Cuentas por pagar", action: "payables" },
];

export const toolbarItems = [
  { label: "Clientes", icon: UsersRound, tone: "blue", action: "clients" },
  {
    label: "Proveedores",
    icon: Building2,
    tone: "violet",
    action: "providers",
  },
  { label: "Productos", icon: Package, tone: "green", action: "products" },
  { label: "Cobrar", icon: WalletCards, tone: "orange" },
  { label: "Pagar", icon: CreditCard, tone: "red" },
];
