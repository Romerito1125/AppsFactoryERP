import {
  BarChart3,
  Building2,
  Banknote,
  CreditCard,
  FileText,
  Package,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  ClipboardList,
  Landmark,
  Receipt,
  ArrowLeftRight,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react";

export const topMenuItems = ["Archivos", "Transacciones"];
export const salesTopMenuItems = ["Facturación"];
export const purchasesTopMenuItems = [
  "Compras",
  "Cotizaciones",
  "Ordenes de compra",
  "Nota de entrega",
  "Reportes",
  "Varios",
];
export const banksTopMenuItems = [
  "Archivos",
  "Transacciones",
  "Reportes",
  "Varios",
];

export const defaultAdminCredentials = {
  email: "admin@mundotienda.com",
  password: "Admin123*",
};

export const filesMenuItems = [
  { label: "Clientes", action: "clients", permission: "CLIENTS_VIEW" },
  { label: "Proveedores", action: "providers", permission: "PROVIDERS_VIEW" },
  { label: "Productos", action: "products", permission: "PRODUCTS_VIEW" },
  { label: "Tipos de producto", action: "product-types", permission: "PRODUCTS_VIEW" },
  { label: "Bodegas", action: "warehouses", permission: "PRODUCTS_VIEW" },
  { label: "Retenciones", action: "retentions", permission: "RETENTIONS_VIEW" },
  { label: "Usuarios", action: "users", permission: "USERS_MANAGE" },
];

export const transactionsMenuItems = [
  {
    label: "Cuentas por cobrar",
    action: "receivables",
    permission: "RECEIVABLES_VIEW",
  },
  {
    label: "Cuentas por pagar",
    action: "payables",
    permission: "PAYABLES_VIEW",
  },
];

export const moduleMenuItems = [
  { label: "Administrativo", action: "switch-administrative" },
  { label: "Ventas", action: "switch-sales", permission: "SALES_CREATE" },
  {
    label: "Compras",
    action: "switch-purchases",
    permission: "PURCHASES_VIEW",
  },
  { label: "Bancos", action: "switch-banks", permission: "BANKS_VIEW" },
];

export const salesMenuItems = [
  { label: "Facturación", action: "billing", permission: "SALES_CREATE" },
  { label: "Presupuesto", action: "quotes", permission: "SALES_CREATE" },
  {
    label: "Nota de entrega",
    action: "deliveries",
    permission: "SALES_CREATE",
  },
  { label: "Pedidos", action: "orders", permission: "SALES_CREATE" },
  { label: "Reportes", action: "reports", permission: "SALES_CREATE" },
  { label: "Varios", action: "various", permission: "SALES_CREATE" },
];

export const toolbarItems = [
  {
    label: "Clientes",
    icon: UsersRound,
    tone: "blue",
    action: "clients",
    permission: "CLIENTS_VIEW",
  },
  {
    label: "Proveedores",
    icon: Building2,
    tone: "violet",
    action: "providers",
    permission: "PROVIDERS_VIEW",
  },
  {
    label: "Productos",
    icon: Package,
    tone: "green",
    action: "products",
    permission: "PRODUCTS_VIEW",
  },
  {
    label: "Cobrar",
    icon: WalletCards,
    tone: "orange",
    action: "receivables",
    permission: "RECEIVABLES_VIEW",
  },
  {
    label: "Pagar",
    icon: CreditCard,
    tone: "red",
    action: "payables",
    permission: "PAYABLES_VIEW",
  },
];

export const salesToolbarItems = [
  {
    label: "Facturación",
    icon: ReceiptText,
    tone: "blue",
    action: "billing",
    permission: "SALES_CREATE",
  },
  {
    label: "Devolución",
    icon: RotateCcw,
    tone: "violet",
    action: "returns",
    permission: "SALES_CREATE",
  },
  {
    label: "Presupuesto",
    icon: FileText,
    tone: "green",
    action: "quotes",
    permission: "SALES_CREATE",
  },
  {
    label: "Pedidos",
    icon: ShoppingCart,
    tone: "orange",
    action: "orders",
    permission: "SALES_CREATE",
  },
  {
    label: "N. Entrega",
    icon: Truck,
    tone: "purple",
    action: "deliveries",
    permission: "SALES_CREATE",
  },
  {
    label: "Reportes",
    icon: BarChart3,
    tone: "red",
    action: "reports",
    permission: "SALES_CREATE",
  },
];

export const purchasesMenuItems = [
  { label: "Compras", action: "purchases", permission: "PURCHASES_VIEW" },
  { label: "Devoluciones", action: "returns", permission: "PURCHASES_VIEW" },
  {
    label: "Cotizaciones",
    action: "quotes",
    permission: "PURCHASES_VIEW",
  },
  {
    label: "Ordenes de compra",
    action: "orders",
    permission: "PURCHASES_VIEW",
  },
  {
    label: "Nota de entrega",
    action: "deliveries",
    permission: "PURCHASES_VIEW",
  },
  { label: "Reportes", action: "reports", permission: "PURCHASES_VIEW" },
  { label: "Varios", action: "various", permission: "PURCHASES_VIEW" },
];

export const purchasesToolbarItems = [
  {
    label: "Compras",
    icon: ClipboardList,
    tone: "blue",
    action: "purchases",
    permission: "PURCHASES_VIEW",
  },
  {
    label: "Devolución",
    icon: RotateCcw,
    tone: "violet",
    action: "returns",
    permission: "PURCHASES_VIEW",
  },
  {
    label: "N. Entrega",
    icon: Truck,
    tone: "green",
    action: "deliveries",
    permission: "PURCHASES_VIEW",
  },
  {
    label: "Ord. Compra",
    icon: ShoppingCart,
    tone: "orange",
    action: "orders",
    permission: "PURCHASES_VIEW",
  },
  {
    label: "Cotización",
    icon: FileText,
    tone: "purple",
    action: "quotes",
    permission: "PURCHASES_VIEW",
  },
];

export const banksMenuItemsByMenu = {
  Archivos: [
    { label: "Cuentas", action: "accounts", permission: "BANKS_VIEW" },
    {
      label: "Beneficiarios",
      action: "beneficiaries",
      permission: "BANKS_VIEW",
    },
    { label: "Bancos", action: "banks", permission: "BANKS_VIEW" },
  ],
  Transacciones: [
    {
      label: "Transacciones",
      action: "transactions",
      permission: "BANKS_VIEW",
    },
    {
      label: "Cuentas por cobrar",
      action: "receivables",
      permission: "BANKS_VIEW",
    },
    {
      label: "Cuentas por pagar",
      action: "payables",
      permission: "BANKS_VIEW",
    },
  ],
  Reportes: [
    { label: "Reportes", action: "reports", permission: "BANKS_VIEW" },
  ],
  Varios: [{ label: "Varios", action: "various", permission: "BANKS_VIEW" }],
};

export const banksToolbarItems = [
  {
    label: "Cuentas",
    icon: Landmark,
    tone: "blue",
    action: "accounts",
    permission: "BANKS_VIEW",
  },
  {
    label: "Benef.",
    icon: UsersRound,
    tone: "violet",
    action: "beneficiaries",
    permission: "BANKS_VIEW",
  },
  {
    label: "Bancos",
    icon: Banknote,
    tone: "green",
    action: "banks",
    permission: "BANKS_VIEW",
  },
  {
    label: "Transacc.",
    icon: ArrowLeftRight,
    tone: "orange",
    action: "transactions",
    permission: "BANKS_VIEW",
  },
  {
    label: "Ctas.cobrar",
    icon: Receipt,
    tone: "purple",
    action: "receivables",
    permission: "BANKS_VIEW",
  },
  {
    label: "Ctas.pagar",
    icon: CreditCard,
    tone: "red",
    action: "payables",
    permission: "BANKS_VIEW",
  },
  {
    label: "Reportes",
    icon: BarChart3,
    tone: "blue",
    action: "reports",
    permission: "BANKS_VIEW",
  },
];
