import {
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Package,
  ReceiptText,
  ShoppingCart,
  ClipboardList,
  Landmark,
  Receipt,
  ArrowLeftRight,
  UsersRound,
  WalletCards,
} from "lucide-react";

export const topMenuItems = ["Archivos"];
export const salesTopMenuItems = ["Facturación"];
export const purchasesTopMenuItems = ["Compras"];
export const banksTopMenuItems = ["Finanzas"];

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
  { label: "Traslados de inventario", action: "inventory-transfers", permission: "INVENTORY_EDIT" },
  { label: "Retenciones", action: "retentions", permission: "RETENTIONS_VIEW" },
  { label: "Usuarios", action: "users", permission: "USERS_MANAGE" },
  { label: "Acciones del sistema", action: "audit-log", permission: "USERS_MANAGE" },
  { label: "Ofertas y precios especiales", action: "offers", permission: "OFFERS_VIEW" },
  { label: "Referidos y utilidades", action: "referrals", permission: "REFERRALS_VIEW" },
  { label: "Biblioteca de reportes", action: "reports-library", permission: "REPORTS_VIEW" },
];

export const moduleMenuItems = [
  { label: "Ventas", action: "switch-sales", permission: "SALES_CREATE" },
  { label: "Administrativo", action: "switch-administrative" },
  {
    label: "Compras",
    action: "switch-purchases",
    permission: "PURCHASES_VIEW",
  },
  { label: "Finanzas", action: "switch-banks", permission: "BANKS_VIEW" },
];

export const salesMenuItems = [
  { label: "Facturación", action: "billing", permission: "SALES_CREATE" },
  { label: "Cotizaciones", action: "quotes", permission: "SALES_CREATE" },
  { label: "Pedidos y domicilios", action: "orders", permission: "SALES_CREATE" },
  { label: "Reportes", action: "reports", permission: "SALES_CREATE" },
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
    label: "Traslados",
    icon: ArrowLeftRight,
    tone: "orange",
    action: "inventory-transfers",
    permission: "INVENTORY_EDIT",
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
    label: "Cotizaciones",
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
    label: "Reportes",
    icon: BarChart3,
    tone: "red",
    action: "reports",
    permission: "SALES_CREATE",
  },
];

export const purchasesMenuItemsByMenu = {
  Compras: [
    { label: "Nueva compra", action: "purchases", permission: "PURCHASES_VIEW" },
    { label: "Órdenes y recepción", action: "orders", permission: "PURCHASES_VIEW" },
    { label: "Reportes", action: "reports", permission: "PURCHASES_VIEW" },
  ],
};

export const purchasesToolbarItems = [
  {
    label: "Compras",
    icon: ClipboardList,
    tone: "blue",
    action: "purchases",
    permission: "PURCHASES_VIEW",
  },
  {
    label: "Órdenes",
    icon: ShoppingCart,
    tone: "orange",
    action: "orders",
    permission: "PURCHASES_VIEW",
  },
];

export const banksMenuItemsByMenu = {
  Finanzas: [
    { label: "Cuentas bancarias", action: "accounts", permission: "BANKS_VIEW" },
    {
      label: "Movimientos bancarios",
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
    { label: "Reportes", action: "reports", permission: "BANKS_VIEW" },
  ],
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
    label: "Movimientos",
    icon: ArrowLeftRight,
    tone: "green",
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
