# Lote 03 — M02: caja y POS

**Numerales:** #39, #40 y #44 (+ Total operación de la captura de Facturación)  
**Estado:** implementación aplicada (ajuste 2 tras la revisión con capturas de Saint); pendiente prueba manual (`TEST_RAPIDO.md`).  
**Migraciones:** `20261103110000_add_invoice_payment_support` (tabla nueva para el soporte del pago de la venta). **Ya aplicada** en la BD de `.env`.

## Alcance

| # | Qué se hizo |
|---|---|
| #39 Escáner | La **primera fila vacía de la tabla** es la fila de captura (como Saint): escribes/escaneas el **Código** y Enter agrega el producto. Con el campo **vacío**, Enter abre la lista de productos. Acepta código de barras **o código interno/ID** del producto. Código inexistente → «El código X no existe en el catálogo». Escanear el mismo código suma cantidad (no duplica filas). |
| #40 Foco | Enter en la **cantidad** confirma y lleva el foco a la fila de captura del siguiente producto. También vuelve ahí al cerrar cualquier consulta o diálogo. |
| #44 Crédito por cliente | Sin selector Contado/Crédito. La ficha del cliente decide: el crédito solo existe si `hasCredit` y límite > 0; **no todos los clientes tienen crédito**. |
| Total operación | «Emitir factura» abre **TOTAL OPERACIÓN** (captura 17/18): Límite crédito, Saldo anterior, Crédito disponible, **Efectivo**, **Instrumentos de pago** (todas las cuentas bancarias, con número de documento y monto), **Bonus / miembro fiel** (descuenta del saldo del cliente), saldos a favor, **Crédito** (lo no pagado, solo si el cliente tiene crédito y cupo), comentarios y **soporte** (imagen/PDF). Permite pagos mixtos (mitad cuenta, mitad efectivo). |

### Sobre el «código 1»
Los productos sin código de barras muestran en la tabla su **ID interno** como código. Antes el lector solo buscaba códigos de barras, por eso «1» no aparecía; ahora también busca por código interno/ID. (Lo ideal es asignar código de barras a cada producto.)

## Regla de pagos (API)
`POST /facturas` acepta `payments[]` con **una** fuente por línea: `bankAccountId`, `advanceId` (saldo a favor) o `bonus: true`.
- Contado: la suma debe ser **igual** al total.
- Con crédito: lo pagado es abono inicial y **solo el resto** queda como deuda (el cupo se valida sobre ese resto).
- Todo (factura, movimientos bancarios, saldos a favor, bonus, soporte) en **una transacción**.

## Datos de prueba creados en la BD
`PRUEBA-CON-CREDITO` (límite $1.000.000) y `PRUEBA-SIN-CREDITO` (sin crédito) — `app/api/scripts/seed-test-clients.js` (idempotente).

## Fuera de alcance / pendiente
- **#43 Cajero/vendedor separados**, ticket D1/ARA (#54), copias/impresión de la factura desde Total operación.
- El POS «nuevo» (`pos-window.jsx`) no se tocó.
- «Vuelto» en efectivo: la suma debe ser exacta.
- Solo hay **1 cuenta bancaria activa** en la BD: para probar pagos mixtos entre cuentas crea otra.

## Archivos
Web: `components/payments/{totalize-dialog.jsx,.css}`, `modules/sales/{sales-window.jsx,sales-scanner-input.jsx,returns-panel.css}`, `lib/enter-advance.js`.  
API: `facturas.service.ts` (pagos, bonus, crédito parcial, soporte), `dto/create-invoice*.ts`, `facturas.controller.ts` (`/facturas/bonus/:clientId`, `/facturas/:id/soporte-pago`), `prisma/schema.prisma`.

## Rollback
`prisma/migrations/20261103110000_add_invoice_payment_support/ROLLBACK.sql` (manual, con respaldo) y revertir el código.
