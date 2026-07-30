export enum ReportEmailSection {
  RESUMEN = 'RESUMEN',
  FACTURAS = 'FACTURAS',
  IVA = 'IVA',
  EXOGENAS = 'EXOGENAS',
  GMF = 'GMF',
  STOCK = 'STOCK',
  STOCK_SEMANAL = 'STOCK_SEMANAL',
  TRASLADOS = 'TRASLADOS',
  PRODUCTOS = 'PRODUCTOS',
}

export interface ReportEmailMetric {
  label: string;
  value: string;
  help?: string;
}

export interface ReportEmailTableRow {
  [key: string]: string;
}
