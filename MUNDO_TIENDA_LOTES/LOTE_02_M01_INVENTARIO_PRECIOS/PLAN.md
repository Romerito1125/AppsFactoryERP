# Lote 02 — M01 integrado: inventario y precios

**Numerales:** #37, #65 y #68 (capturas de apoyo C14, C23, C24 y C25 del roadmap; #66 y #67 son referencias)  
**Estado:** implementación aplicada y ajustada para replicar las capturas (ajuste 3); pendiente prueba manual (`TEST_RAPIDO.md`).

## Alcance

- **#37 Inventario (C14):** Productos → Inventario muestra por bodega Stock, Mínimo, Máximo, Costo adquisición (sin IVA), Inventario total (sin IVA) e **Inventario total (con IVA)**. Reportes de inventario muestran valor sin IVA, IVA y con IVA.
- **#65 Compras (C23):** el módulo replica la captura de Saint:
  - Panel de totales **«Compra»**: **N°** (número del documento), **Total cantidad o pieza**, **Total renglones** (base sin IVA), **Impuestos**, **Total** (y, si el proveedor aplica retención, Retención y Total a pagar).
  - Grilla **Código · Descripción · Cantidad · Und · Costo** + Precio 0–3 (editables) + Total.
  - Barra inferior **F1 Información · F2 Precio · F3 Descuento** (F1/F2 actúan sobre la línea activa también con el teclado; F3 queda deshabilitado porque el descuento por línea no existe aún en compras).
- **#66 / #67 / #68 Editor de precios (C24/C25):** diálogo **«PRECIOS DEL PRODUCTO»** al cambiar el costo (Enter en la columna Costo) o con F2: **Costo anterior · Costo nuevo**, y por cada nivel Precio 0–3: precio anterior y su % de utilidad (en gris), **precio sin impuestos**, **% Utilidad**, **Precio mas impuestos**; los tres campos editables se recalculan entre sí; botones **Aceptar / Cancelar**. Los precios se guardan en `ProductPrice` al guardar la compra y se ven igual en Productos, POS y Ventas.
- La fuente de precios sigue siendo `ProductPrice` (`priceLevel`).

## Archivos

API: `inventario.service.ts`.  
Web: `modules/purchases/purchases-window.jsx`, `components/pricing/price-update-dialog.{jsx,css}`, `modules/products/products-window.jsx`, `modules/reports/reports-window.jsx`, `lib/commercial-pricing.js`, `lib/enter-advance.js`, `index.css`.

## Notas

- El costo de compra se maneja **IVA incluido** (la utilidad se calcula sobre costo y precio sin IVA). Si el costo guardado en Productos ya viene sin IVA, hay que definirlo antes de dar por buenas las utilidades.
- «Entrega prevista» sigue en Compras: el roadmap (#63) pide moverla; es del lote de Compras.

## Criterio de cierre

Una línea de compra muestra los cuatro precios; al cambiar el costo y pulsar Enter se abre «PRECIOS DEL PRODUCTO» como en la captura; al guardar la compra los precios quedan en el catálogo y aparecen en Productos, POS y Ventas.
