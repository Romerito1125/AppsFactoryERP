# Lote 05 — M05: devoluciones

**Numerales:** #56, #58 y #61 (las capturas #57, #59 y #60 son referencia visual)  
**Estado:** implementación aplicada; **requiere aplicar la migración** y prueba manual (`TEST_RAPIDO.md`).  
**Migración:** `app/api/prisma/migrations/20261102100000_add_returns_advances_credit_receipts` (la misma del lote 04; crea `SaleReturn` y `SaleReturnItem`).

> La migración **ya fue aplicada** a la BD de `app/api/.env` (sin respaldo previo; `ROLLBACK.sql` disponible).

## Alcance

| # | Qué se hizo |
|---|---|
| #56 Devolución parcial | `POST /devoluciones` devuelve por **línea y cantidad** (admite decimales). Valida que no se supere lo vendido menos lo ya devuelto, motivo obligatorio, factura activa. Repone inventario a la bodega de origen de cada línea (con conversión de unidad/paquete/caja). La última devolución de una línea toma el resto exacto (sin centavos de más). La factura **no** se anula. |
| #58 Devolución aplicada a crédito | Si la factura tiene crédito, primero se **reduce la deuda** (total y saldo) solo por el valor devuelto; nunca queda saldo negativo. El excedente (ya pagado) exige elegir: **devolver dinero desde una cuenta** (egreso con validación de saldo) o **dejar saldo a favor** (`ClientAdvance` origen DEVOLUCIÓN). Todo en una transacción. |
| #61 Historial permanente | `GET /devoluciones` con búsqueda por factura, cliente, producto, motivo, y rango de fechas; `GET /devoluciones/factura/:id` muestra lo vendido/devuelto/disponible por línea. UI: pestaña **Devoluciones** dentro de Facturación (nueva devolución + historial con impacto en deuda, dinero y saldo a favor). |
| Anulación segura | Anular una factura con devoluciones previas repone **solo lo no devuelto** (evita duplicar inventario). |

## Permisos

Nuevos: `RETURNS_VIEW` (ADMIN, CAJERO, VENDEDOR, CONTADOR) y `RETURNS_CREATE` (ADMIN, CAJERO). Configurables por usuario como el resto.

## Fuera de alcance / pendiente

- Devolución de mercancía **defectuosa** a una bodega distinta o a merma: hoy siempre repone la bodega de origen (`restocked = true`).
- Impacto en reportes (#55: «incluir devoluciones y evitar doble conteo»): los reportes **no** restan aún las devoluciones.
- Impuestos: la devolución reversa el IVA proporcional de la línea; no genera nota crédito electrónica.
- Reintegro de descuentos de referidos/ofertas de la factura: no se revierte.
- Facturas de contado pagadas con varios medios: el reintegro sale de **una** cuenta elegida por el cajero.

## Archivos

API: `prisma/schema.prisma`, migración, `modules/devoluciones/*` (+ `devoluciones.service.spec.ts`, 6 pruebas), `modules/facturas/facturas.service.ts` (anulación), `common/permissions/permission.constants.ts`, `app.module.ts`.  
Web: `modules/sales/{returns-panel.jsx,returns-panel.css,sales-window.jsx}`, `app/permissions.js`.

## Decisiones tomadas (confirmar con negocio)

1. Orden de aplicación: **deuda primero**, luego dinero/saldo a favor.
2. Reintegro: cuenta bancaria o saldo a favor (no hay «caja» separada).
3. Solo ADMIN y CAJERO crean devoluciones.

## Criterio de cierre

Devolver 1 de 3 unidades de una factura de contado (egreso exacto, stock +1, factura sigue activa); devolver en una factura a crédito (deuda baja, banco no cambia); intentar devolver de más (rechazado); consultar el historial.

## Rollback

`ROLLBACK.sql` de la migración (manual, con respaldo) y revertir el código.
