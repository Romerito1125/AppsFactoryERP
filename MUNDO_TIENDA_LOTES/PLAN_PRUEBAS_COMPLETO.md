# Plan de pruebas completo — Lotes 01 a 10 y todas las fichas

Objetivo: probar en el navegador (1366×768) y por API **todas** las actualizaciones, con evidencia, por rol y con datos reproducibles. Lo ya probado se marca como ✔ y solo se repite como regresión.

## 0. Preparación (una vez)
1. API y web levantadas con el código actual (API reiniciada; migraciones al día).
2. Usuarios: `admin@mundotienda.com`, cajero `laura.cajero`, vendedor `valentina.ventas`, bodeguero `diego.bodega` (con bodega asignada) y un CONTADOR (crearlo si no existe).
3. Datos base: 2 bodegas con stock, 1 proveedor con retención (2,5 %), 1 proveedor sin retención, 2 clientes (con y sin crédito), 2 cuentas bancarias (una con 4x1000 automático), productos con IVA 0/5/19 %, uno bajo mínimo en una bodega y con excedente en otra.
4. Anotar saldos iniciales: stock por bodega, saldo de cada cuenta, saldo de cartera. Toda prueba de dinero se concilia contra esos valores.
5. Carpeta de evidencia `MUNDO_TIENDA_LOTES/evidence/<lote>/` (captura por caso) y registro de resultados en `RESULTADO_PRUEBAS.md` (caso, rol, esperado, obtenido, OK/FALLA, captura).
6. Limpieza: prefijo `QA-` en todo dato creado; al final se anula/desactiva.

## 1. Estrategia por capas
| Capa | Qué | Herramienta | Quién |
|---|---|---|---|
| A. Unitarias | Cálculos (IVA, retención, GMF, totales) | jest | automático |
| B. API | Reglas, permisos y errores por endpoint | `scripts/auto-test-lotes-06-10.js` (ampliar a lotes 01–05) | automático |
| C. UI guiada | Flujos completos con teclado y ratón, por rol | navegador a 1366×768 | yo (Claude) |
| D. Cruce de datos | Conciliar UI ↔ API ↔ BD (stock, bancos, cartera, reportes) | consultas API/Prisma | automático |
| E. Manual | `TEST_RAPIDO.md` de cada lote | tú | usuario |

## 2. Matriz por lote (casos mínimos)
Cada caso: **camino feliz, un error esperado, un límite, el permiso** (rol sin permiso → bloqueado) y **efecto en datos** (stock/dinero).

### Lote 01 — Precios e IVA (#33, #41, #42)
- Precio con IVA incluido ↔ sin IVA en productos, compras y caja (misma cifra en cada pantalla).
- Redondeo: 1, 3 y 10 unidades con IVA 19 %, 5 % y 0 %; sin diferencia de centavos vs total de factura.
- Margen/utilidad en el diálogo de precio; precio 0 rechazado.
- Regresión: precios de producto = precio en caja = precio en compras.

### Lote 02 — Inventario y precios (#37, #65, #68)
- Enter guarda y avanza en compras, caja, cotizaciones, traslados.
- 4 costos y 4 precios en una línea; editar precio desde compras y confirmar que se guarda en el producto.
- Total con IVA en inventario; Total renglones / Impuestos / Total.

### Lote 03 — Caja POS (#39, #40, #44)
- Código de producto «1»; cantidad con Enter; sin campo de escáner.
- Cobro efectivo, cheque, transferencia, bono; pago mixto; vuelto; pago insuficiente.
- Cliente sin crédito: venta a crédito bloqueada; con crédito: respeta límite.

### Lote 04 — Cartera y pagos (#34, #38, #52, #53)
- Cobrar y Pagar con diseño Saint (capturas punto 34): selección de documentos, abonos parciales, sobrepago bloqueado.
- Anticipos recibidos y aplicados; cierre; bono/beneficio como medio de pago (#52).
- Conciliar saldo de cuenta y de crédito antes/después.

### Lote 05 — Devoluciones (#56, #58, #61)
- Parcial contado (dinero / saldo a favor), crédito (reduce deuda, excedente), no devolver más de lo vendido, historial con filtros, permiso `RETURNS_VIEW` sin formulario.
- Anular factura después de devolver: stock no duplicado.

### Lote 06 — Caja y UX (#30, #43, #50, #54, #73)
- #43: cajero (usuario) ≠ vendedor elegido; por defecto igual; visible en listado, documento y ticket. ✔ parcial → repetir con VENDEDOR distinto.
- #54: ticket 80 mm: IVA por tarifa, pagos, crédito, reimpresión; impresión real (vista de impresión).
- #50: 14+ filas visibles y contraste legible.
- #30: **recorrer todas las ventanas y diálogos a 1366×768** (lista en §4) buscando recortes o botones inalcanzables.
- #73: F8/F9 en caja y cotizaciones; retomar, eliminar, no ver borradores ajenos (CAJERO), ADMIN ve todos; borrado al facturar ✔.

### Lote 07 — Compras I (#36, #63, #69, #70, #71, #73)
- Total operación: cada campo (descuentos, flete, efectivo, cheque+cuenta, días vencimiento, copias, comentarios, guardar precios).
- Sin pago → crédito con vencimiento; pago parcial; pago mayor → error; F3/Esc/Enter.
- Proveedor sugerido por historial, marca y principal (3 productos distintos).
- Borradores de compra (en espera → recuperar → guardar → desaparece).
- «Entrega prevista del proveedor»; «Ingreso de nuevo producto» crea producto y lo agrega.

### Lote 08 — Retenciones y PDF (#64, #74–#77)
- Retención por proveedor con base mínima (bajo/sobre el mínimo); proveedor autorretenedor sin retención.
- Base editada: ADMIN/CONTADOR con motivo OK; CAJERO/BODEGA 403; sin motivo error.
- PDF de compra: multipágina (30+ renglones), IVA, retención, saldo; abre en visor.
- Reporte Retenciones: totales, base corregida, CSV/PDF.
- #64: **pendiente de definición** → registrar decisión y probar al implementar.

### Lote 09 — Bodegas y preventas (#31, #32, #45–#48)
- #31: traslados sugeridos (grupo por proveedor, editar cantidad, generar, la sugerencia desaparece) ✔ → agregar: BODEGA solo ve la suya, cantidad mayor al disponible se limita.
- #32: diego.bodega: menús visibles/ocultos, solo su bodega, sin acceso a finanzas.
- #45/#46: bodega por línea, disponibilidad, badge «OTRA BODEGA», faltante; stock descontado de la bodega elegida.
- #47: preventa VENDEDOR → CAJERO carga → corrige → factura (`quoteId`), queda CONVERTIDA, no doble conversión, cliente distinto rechazado.
- #48: aviso por bodega solo con sus líneas; Atendido → Surtido; otra bodega no puede; aviso aparece en notificaciones del BODEGA.

### Lote 10 — Informes y cierre (#35, #38, #52, #55, #70)
- #35: cuenta con 4x1000 automático: egreso, pago de compra, traslado; saldo justo falla; apagado no cobra ✔ (API) → UI de pago.
- #55: Ventas cruzadas por cada agrupación (barrio, marca, proveedor, vendedor, bodega, origen, cliente), cada filtro, devoluciones restadas, CSV/PDF.
- #38: Cierre del día con un día que tenga todos los tipos de movimiento; neto = suma/resta; fecha pasada.
- #52 y #70: definir criterio de negocio y probar.

## 3. Pruebas transversales
1. **Permisos:** tabla rol × módulo (ADMIN, CONTADOR, CAJERO, VENDEDOR, BODEGA): menú visible, endpoint 200/403, botones ocultos.
2. **Concurrencia/doble clic:** doble clic en Guardar/Emitir/Pagar no duplica documentos.
3. **Sesión vencida:** token expirado → pide login sin perder el documento.
4. **Teclado:** Enter/Tab/F-keys en cada pantalla; Esc cierra solo el diálogo superior.
5. **Auditoría:** cada creación/anulación deja registro.
6. **Integridad:** conciliación final (stock = movimientos; saldo cuenta = suma de movimientos; cartera = facturas − abonos).
7. **Rendimiento básico:** listas con 250+ filas y reportes con 1 mes de datos cargan < 5 s.
8. **Responsive:** 1366×768 y 1920×1080 (sin recortes ni scroll horizontal).
9. **Consola y red:** cero errores en consola y cero 4xx/5xx inesperados durante cada flujo.

## 4. Inventario de pantallas para #30 (1366×768)
Facturación, Cotizaciones, Pedidos, Devoluciones, Compras (+Total operación, +PDF, +Nuevo producto, +Borradores), Órdenes, Cobrar, Pagar, Cuentas, Movimientos, Inventario (+Traslados sugeridos), Productos, Clientes, Proveedores, Usuarios, Retenciones, Biblioteca de reportes (11 pestañas), POS.

## 5. Orden de ejecución y entregables
| Fase | Contenido | Entregable |
|---|---|---|
| 1 | Preparación + usuarios y datos base | datos QA listos |
| 2 | Ampliar script API a lotes 01–10 + permisos por rol | script y resultado JSON |
| 3 | UI por rol: 09 (completo), 06, 07, 08 | capturas + `RESULTADO_PRUEBAS.md` |
| 4 | UI: 10, 01–05 como regresión | idem |
| 5 | Transversales (§3) y #30 (§4) | lista de defectos |
| 6 | Corrección de defectos y re-prueba | defectos cerrados |
| 7 | Conciliación final + limpieza de datos QA | informe de cierre |

## 6. Criterio de cierre
- 100 % de casos ejecutados, 0 defectos críticos/altos abiertos, conciliación sin diferencias, consola limpia.
- Pendientes de negocio (#64, #52, #70, descuento por línea) con decisión escrita.

## 7. Decisiones que necesito de ti antes de la fase 3
1. ¿Hay un usuario CONTADOR de prueba o lo creo?
2. ¿Probar con datos reales de la BD remota (con prefijo QA) o prefieres una BD de pruebas aparte?
3. Reglas para #64, #52 y #70.

## 8. Datos QA ya creados (§0 cumplido)
Sembrados con `app/api/scripts/seed-qa-pruebas.js` (idempotente; IDs en `DATOS_QA_PRUEBAS.json`). Contraseña de todos los usuarios QA: `Qa123456*`. El login exige correo.

| Rol | Usuario |
|---|---|
| ADMIN | admin@mundotienda.com |
| CAJERO | qa.cajero@mundotienda.com, qa.cajero2@mundotienda.com |
| VENDEDOR | qa.vendedor@mundotienda.com, qa.vendedor2@mundotienda.com |
| BODEGA | qa.bodega.norte@mundotienda.com (Norte), qa.bodega.sur@mundotienda.com (Sur) |
| CONTADOR | qa.contador@mundotienda.com |

Bodegas: QA Bodega Norte / Sur. Proveedores: con retención 2,5 % (base mín. 100.000), sin retención, autorretenedor. Productos: Arroz IVA 0, Aceite IVA 5, Gaseosa IVA 19, «Solo en Norte» (sin stock en Sur), «Faltante en Sur» (3 en Sur, mínimo 10 → sugiere 40 desde Norte). Clientes: con crédito (2 M), sin crédito, mayorista (nivel 2, 8 M), con barrios distintos. Cuentas: QA Caja efectivo y QA Banco con 4x1000 automático (3 M c/u).
