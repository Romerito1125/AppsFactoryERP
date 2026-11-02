# Mundo Tienda — Lotes de implementación

Esta carpeta contiene el trabajo ejecutable del plan de Mundo Tienda. El diagnóstico general permanece en `MUNDO_TIENDA_REVISION_MATRIZ.md`; los lotes, planes de prueba, evidencias y artefactos se documentan aquí.

## Estructura

```text
MUNDO_TIENDA_LOTES/
├── README.md
└── LOTE_01_M01_PRECIOS_IVA/
    ├── PLAN.md
    ├── TEST_PLAN.md
    ├── TEST_RAPIDO.md
    ├── EVIDENCE.md
    ├── tests/
    └── evidence/
└── LOTE_02_M01_INVENTARIO_PRECIOS/
    ├── PLAN.md
    └── TEST_RAPIDO.md
└── LOTE_03_M02_CAJA_POS/
    ├── PLAN.md
    └── TEST_RAPIDO.md
└── LOTE_04_M03_CARTERA_PAGOS/
    ├── PLAN.md
    └── TEST_RAPIDO.md
└── LOTE_05_M05_DEVOLUCIONES/
    ├── PLAN.md
    └── TEST_RAPIDO.md
└── MIGRACION_POSTGRESQL_DIRECTA/
    └── PLAN.md
```

Cada lote debe conservar:

- alcance y numerales atendidos;
- archivos previstos y archivos modificados;
- decisiones de negocio aprobadas;
- migraciones y compatibilidad de datos;
- pruebas ejecutadas y resultado;
- capturas o evidencias manuales;
- riesgos, pendientes y criterio de cierre.

La migración de infraestructura se documenta en `MIGRACION_POSTGRESQL_DIRECTA/PLAN.md` porque afecta toda la aplicación y no solo un lote funcional.

## Orden de lotes

1. **Lote 01 — M01: precios e IVA:** #33, #41 y #42.
2. **Lote 02 — M01 integrado:** #37, #65 y #68.
3. **Lote 03 — M02: caja y POS:** #39, #40 y #44.
4. **Lote 04 — M03: cartera y pagos:** #34, #38, #52 y #53.
5. **Lote 05 — M05: devoluciones:** #56, #58 y #61 (la migración es compartida con el lote 04).
6. **Lote 06 — Caja y UX:** #30, #43, #50, #54, #73.
7. **Lote 07 — Compras I:** #36, #63, #69–#71, #73.
8. **Lote 08 — Compras II / retenciones:** #74–#77 (#64 pendiente de definición).
9. **Lote 09 — Bodegas y preventas:** #31, #32, #45–#48.
10. **Lote 10 — Informes y cierre:** #35, #38, #55 (#52 pendiente de definición).

> Los lotes 06–10 (carpetas `LOTE_06_CAJA_UX` … `LOTE_10_INFORMES_CIERRE`, cada una con `PLAN.md` y `TEST_RAPIDO.md`) usan la migración `20261105100000_roadmap_lotes_06_10`.

> Los lotes 03, 04 y 05 están **implementados pero sin probar manualmente**. Las migraciones `20261102100000_add_returns_advances_credit_receipts`, `20261103100000_add_payment_receipts` y `20261103110000_add_invoice_payment_support` **ya se aplicaron** a la BD configurada en `app/api/.env` (sin respaldo previo). Reinicia la API para cargar el cliente Prisma regenerado.

No se debe cerrar un lote solo porque exista una pantalla. Debe existir evidencia de API, persistencia, permisos, cálculos, inventario/finanzas cuando aplique y prueba reproducible.

