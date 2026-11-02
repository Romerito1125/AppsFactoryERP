# Lote 04 — M03: cartera y pagos

**Numerales:** #34, #38, #53 (+ #52 en su parte de bonus, #70 parcial)  
**Estado:** implementación aplicada siguiendo las capturas de Saint (ajuste 2); pendiente prueba manual (`TEST_RAPIDO.md`).  
**Migraciones (las cuatro ya aplicadas en la BD de `.env`):**
- `20261102100000_add_returns_advances_credit_receipts` (anticipos, devoluciones, columnas de abono)
- `20261103100000_add_payment_receipts` (recibos de cobro/pago)
- `20261103110000_add_invoice_payment_support` (soporte del pago de la venta)
- `20261104100000_add_account_notes` (aplicada: notas de débito/crédito y anticipos a proveedores; aplicar con `bun run db:deploy` o `npx prisma migrate deploy` desde `app/api`)

Todas son aditivas y traen `ROLLBACK.sql`. **No se hizo respaldo previo.** Sin la 4.ª migración, las tarjetas de notas devuelven error de base de datos.

## Diseño (idéntico a las capturas del punto 34 del PDF «Cambios Mundo tienda»)

Cuentas por **cobrar** y por **pagar** usan **las mismas pantallas** (componentes compartidos en `components/accounts` y `components/payments`):

- **Lista lateral:** pestañas *ID Fiscal | Descripción | Clave*, Buscar, columnas Código/Descripción y botones *Anterior | Próximo | Información*.
- **Cabecera:** código + nombre (azul), dirección, teléfono, **Límite de crédito** (cobrar) y, a la derecha, **Saldo anticipos** y **Saldo** (rojo), con formato `1.000.000,00`.
- **4 pestañas:** *Operaciones · Estado de cuenta · Pendiente · Vencimientos*.
- **Operaciones a realizar:** 7 tarjetas grandes como Saint, **todas con función**:
  - *Facturas* → estado de cuenta · *Giros o cuotas* → pendiente · *Pagos y abonos* → «PAGOS O ABONOS A CUENTAS» (si no hay deuda lo explica).
  - **Cobrar:** *Notas de débito* (cargo adicional al cliente: crea una nueva cuenta por cobrar) · *Notas de crédito* (descuento/ajuste que baja una cuenta sin mover dinero; también lista las devoluciones) · *Notas crédito / Anticipos* (anticipos y saldos a favor) · *Anular Notas crédito / Anticipos* (anula notas y anticipos sin usar; revierte saldos y banco).
  - **Pagar:** *Notas de débito* (baja lo que se debe de una compra: retención, descuento) · *Notas de crédito* (lo sube: flete, cargo adicional) · *Notas débito / Anticipos* (pago adelantado al proveedor: sale del banco, queda como «Saldo anticipos» y se aplica a compras) · *Anular…* (revierte notas y anticipos sin aplicar).
  - Las notas de proveedor entran al saldo de cada compra (Compras, Pagar y el pago con «Total debitado» ya las consideran) y aparecen como `N/D` y `N/C` en el estado de cuenta; las anuladas salen tachadas con su fila de reversión.
- **Estado de cuenta:** filtros *Movimientos / Desde / Hasta* (por defecto del 1.º del mes a hoy); columnas **Número · Emisión · Débitos · Créditos · Saldo** con saldo corrido y filas `FAC …` / `PAG {documento} {detalle}`; fila seleccionada en azul; al pie **Imprime · Editar** (+ Soporte y Anular en cobros) y los datos del documento seleccionado **Monto · Emisión · Saldo · Vence**. El historial de abonos del día aparece como filas con la fecha de hoy.
- **Pendiente:** **Número · Detalle documento · Vence · Días · Saldo pendiente** y pie con Monto / Emisión / Saldo / Vencimiento.
- **Vencimientos:** «Análisis de vencimientos» con *Cuentas vencidas* por rango (de 1 a 30, 31 a 60, 61 a 90, más de 90 días, Total vencido, con %), por vencer y gráfico circular «Vencido».
- **Pagos y abonos → «PAGOS O ABONOS A CUENTAS»:** Número · Emisión · Vence · Saldo pendiente · **Monto abonado** · **Retenciones** (solo cobrar) · Saldo restante, totales, *Buscar documento*, **F3 Totalizar**, **Esc Salir**, Enter navega.
- **«TOTAL PAGOS Y ABONOS»** (campos en filas y en este orden): **Número de documento** (= ticket, obligatorio), **Detalle documento** (obligatorio), **Total acreditado** (cobrar) / **Total debitado** (pagar), Fecha posteo, Fecha documento, **Efectivo**, **Cheques** (monto + banco/número), **Instrumentos de pago** (todas las cuentas bancarias con documento, monto y soporte), Total desglose, **Comentarios del pago**, soporte, **Tipo de operación**, **Vendedor** (solo cobrar, obligatorio), **Imprimir recibo** Sí · Copias · Impresora (Default). **F3 Aceptar / Esc Salir**.
- Al aceptar, **en una sola transacción**: recibo guardado con número de documento, abonos aplicados, **movimientos en las cuentas de banco** (finanzas), soporte y comentarios guardados. Pago mixto (efectivo + cuentas + cheques) soportado.
- **Editar** (documento, detalle, fecha, comentarios, tipo de operación, vendedor, soporte; el antes/después queda en **auditoría**), **Anular** cobro (revierte cartera y banco) e **Imprimir** desde el pie del estado de cuenta.
- **Estado de cuenta de proveedores:** nuevo `GET /recibos/estado-cuenta/proveedor/:id` (facturas = créditos, pagos = débitos; saldo = lo que se debe), con el mismo libro.

### Facturación
Ver Lote 03: Total operación con efectivo, instrumentos, **bonus / miembro fiel**, saldos a favor y **crédito** (solo clientes con crédito).

## Reglas
- No todos los clientes tienen crédito: sin `hasCredit` y límite no hay opción de crédito.
- Número de documento **único por tipo** (cobro/pago).
- Desglose = total (sin sobrepago); cuentas inactivas o sin saldo (egresos) se rechazan.

## Fuera de alcance / pendiente
- Anular/corregir **pagos a proveedores** (hoy solo editar metadatos; la anulación se haría en Compras).
- **Bonus en abonos de cartera** (solo se usa como medio de pago en la venta).
- Los **cheques** se registran como un instrumento más (ingresan/salen de la caja o cuenta elegida, con su referencia); no hay control de cheques posfechados.
- La ventana de Pagar **ya no edita compras** (Nueva compra / editar / ordenar / recibir): eso queda solo en el módulo Compras.
- Las tarjetas «Notas de débito», «Notas de crédito» y «Anular Notas crédito / Anticipos» aparecen en gris (sin flujo), igual que en la captura.
- Impresora seleccionable: se usa el diálogo de impresión del navegador.
- Facturas anuladas no revierten aún sus movimientos bancarios (comportamiento previo).

## Archivos
API: `modules/recibos/*` (+ spec), `modules/anticipos/*`, `modules/creditos/*`, `modules/facturas/*`, `common/utils/bank-ledger.util.ts`, `prisma/schema.prisma`.  
Web: `components/payments/*` (totalizar, allocation-flow, impresión, soporte), `modules/receivables/{accounts-receivable-window.jsx,cobrar-panels.jsx,advances-panel.jsx,receivable-utils.js}`, `modules/payables/accounts-payable-window.jsx`.

## Criterio de cierre
Cobro de $100.000 repartido en 2 facturas con retención, pagado mitad efectivo/mitad cuenta: estado de cuenta muestra los abonos y el saldo corrido, Bancos muestra los ingresos, el recibo se imprime y se puede editar/anular. Pago a proveedor con ticket: egresos en las cuentas elegidas y saldo de la compra actualizado.

## Rollback
`ROLLBACK.sql` de cada migración (manual, con respaldo) y revertir el código.
