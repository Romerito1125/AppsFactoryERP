# Lote 01 — Evidencias y seguimiento

## Estado inicial

- Revisión estática realizada sobre el código actual.
- No se ejecutaron pruebas ni builds; queda pendiente `TEST_RAPIDO.md`.
- El repositorio ya tenía cambios locales no confirmados en varios archivos de web.

## Referencias de código

- `app/api/src/modules/facturas/facturas.service.ts`
- `app/api/src/modules/facturas/dto/create-invoice-item.dto.ts`
- `app/api/src/shared/products/product-resolver.service.ts`
- `app/api/src/modules/product-prices/product-prices.service.ts`
- `app/api/src/modules/productos/product-profit.service.ts`
- `app/web/src/modules/pos/pos-window.jsx`
- `app/web/src/modules/sales/sales-window.jsx`
- `app/web/src/modules/products/products-window.jsx`
- `app/api/prisma/schema.prisma`

## Registro de decisiones

| Decisión | Responsable | Fecha | Estado |
|---|---|---|---|
| Precio almacenado como neto o final | Producto / API | 2026-11-01 | Aplicado: se conserva neto |
| Nombre y semántica de `unitPrice` | Producto / API | 2026-11-01 | Aplicado: sigue siendo neto; `unitPriceGross` es explícito |
| Redondeo por línea y factura | Producto / API | 2026-11-01 | Aplicado: dos decimales por línea |
| Permisos para editar precio final | Administración | 2026-11-01 | Aplicado: `SALES_PRICE_OVERRIDE` |
| Tasa de IVA por producto | Contabilidad | 2026-11-01 | Aplicado: `Product.taxRate` |

## Registro de cambios

| Archivo | Cambio | Estado |
|---|---|---|
| `app/api/src/common/utils/commercial-pricing.util.ts` | Utilidad común de redondeo, conversión y totales | Aplicado |
| `app/api/src/modules/facturas/facturas.service.ts` | Recalculo único de IVA, override bruto explícito, permiso y auditoría | Aplicado |
| `app/api/src/modules/facturas/dto/create-invoice-item.dto.ts` | Nuevo campo opcional `unitPriceGross` | Aplicado |
| `app/web/src/lib/commercial-pricing.js` | Utilidad equivalente para las dos cajas y Productos | Aplicado |
| `app/web/src/modules/pos/pos-window.jsx` | Precio final con IVA, override autorizado y totales comunes | Aplicado |
| `app/web/src/modules/sales/sales-window.jsx` | Precio final con IVA, override autorizado y totales comunes | Aplicado |
| `app/web/src/modules/products/products-window.jsx` | Conversiones comunes y evento de actualización de catálogo | Aplicado |
| `app/web/src/app/permissions.js` y `app/api/src/common/permissions/permission.constants.ts` | Permiso `SALES_PRICE_OVERRIDE` | Aplicado |

## Registro de pruebas

Consultar `TEST_RAPIDO.md` para la verificación inicial y luego `TEST_PLAN.md`. Cada resultado debe enlazar evidencia guardada en `evidence/` o en la salida de prueba correspondiente.

## Criterio para cerrar el lote

No marcar #33, #41 o #42 como verificados hasta completar las decisiones, la implementación en las dos cajas, la persistencia de Facturación y las pruebas de `TEST_PLAN.md`.

