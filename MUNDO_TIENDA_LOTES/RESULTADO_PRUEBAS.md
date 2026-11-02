# Resultado de la ejecución del plan de pruebas completo

Fecha: 2 nov 2026 · Entorno: BD remota de desarrollo, API en 7599, web en 5179, pantalla 1366×768.
Automáticas: `app/api/scripts/auto-test-plan-completo.js` → **126/126 OK** (`RESULTADO_PLAN_COMPLETO.json`, `MATRIZ_PERMISOS.json`). También: `tsc` sin errores, jest 37/37, `vite build` OK.

## Defectos encontrados y corregidos
| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | **Alta (seguridad)** | `GET/POST/PATCH/DELETE /cotizaciones` y `convertir-factura` eran **públicos** (sin sesión): exponían clientes y permitían borrar/convertir. | `JwtAuthGuard` a nivel de controlador y roles (ADMIN/CAJERO/VENDEDOR/CONTADOR) en modificar/borrar/estado/convertir. Probado: 401 sin token, 403 a BODEGA. |
| 2 | Alta | Un cajero **no podía facturar** líneas de otra bodega (preventas con líneas en varias bodegas ni «OTRA BODEGA» de caja): el backend lo rechazaba aunque la UI lo ofrecía. | Se quitó la validación por línea; el encabezado sigue atado a la bodega del usuario y el stock se valida/descuenta en la bodega de cada línea. BODEGA sigue restringido a la suya. |
| 3 | Alta | Un bodeguero **no podía generar** traslados hacia su bodega (traslados sugeridos): 404 «Bodega no encontrada». | `transferBatch` permite si la bodega del usuario es origen **o** destino; entre dos bodegas ajenas sigue bloqueado. |
| 4 | Media | #48: el bodeguero veía **todas las líneas** de la preventa (de otras bodegas) y **no tenía botones** Atendido/Surtido en su panel. | El API filtra las líneas y el total por bodega para BODEGA; el panel de bodega muestra estado y botones. Probado en UI. |
| 5 | Media | Cierre del día basaba «ventas de contado» en facturas (sumaba ventas sin cobro) y usaba día UTC; `GMF` capturaba cualquier texto «gmf». | Ahora se basa en movimientos reales del día (recaudo, cobros, anticipos, devoluciones, pagos, GMF, anulaciones, otros); día local. Cuadra con la API. |
| 6 | Media | Venta a crédito: el diálogo autocompletaba todo como pago, así que un cliente con crédito nunca quedaba a crédito sin abrir «Instrumentos». | Botón «Todo a crédito» (y devuelve el foco para que F3/Esc sigan). |
| 7 | Baja | F8 «En espera» no funcionaba (usaba `prompt` del navegador). | Nombre automático. |
| 8 | Baja | Borrador de venta no se borraba al facturar. | Se borra. |
| 9 | Baja | Reporte de Retenciones: filas partidas, NIT vacío; PDF mostraba «2.500%». | Grilla por columnas, `taxId`, tasa «2,5%». |
| 10 | Baja | Preventa mostraba el botón «Facturar» antiguo (no descuenta stock) y badge mal estilizado. | Oculto para preventas; estilo corregido. |

## Hallazgos que NO corregí (requieren decisión)
- **`GET /productos` es público** y devuelve datos de proveedores (NIT, retenciones, contacto). Si es para la tienda en línea, conviene una vista pública reducida.
- El selector de cliente muestra **Saldo $0** para clientes con deuda (el Total operación sí muestra el saldo real).
- Cajero/vendedor: el campo **Vendedor** aparece vacío cuando el usuario no es vendedor (el backend usa al cajero).
- En el diálogo de crédito, las etiquetas «Instrumentos de pago» y «Saldo operación» son confusas.
- Select de bodega por línea corta el texto («Bodega del encabezad…»).
- Cotizaciones: el botón Guardar queda debajo de las filas vacías en 1366×768 (hay scroll).
- #64, #52, #70 siguen sin definición de negocio.

## Cobertura por lote
| Lote | API | Navegador |
|---|---|---|
| 01 | IVA 0/5/19 × cantidades 1/3/10 (totales) | caja y compras con IVA |
| 02 | utilidades, precio 0 rechazado, edición persiste | compras con 4 precios |
| 03 | contado mixto, pago insuficiente, sin crédito, tope, stock | emisión con efectivo y a crédito, límite visible |
| 04 | cobro, sobrepago, doc duplicado, anticipo, anulación | — (regresión visual pendiente de Cobrar/Pagar) |
| 05 | devolución dinero/saldo/crédito, exceso, permisos | devolución completa desde la UI + historial |
| 06 | cajero≠vendedor, borradores por usuario | vendedor, cajero, F8/F9, ticket, ventanas 1366×768 |
| 07 | términos, retención por proveedor, orden→recibir→pagar | Total operación completo, sugerido, pago |
| 08 | base editada (403/400/OK) | motivo obligatorio, PDF, reporte |
| 09 | preventa, aviso, surtido por bodega, traslados, bodeguero | vendedor→bodeguero→cajero de punta a punta |
| 10 | 4x1000 (compra, transferencia, apagado), datos de reportes | pago con 4x1000 (790 = 0,4 %), Retenciones, Ventas cruzadas, Cierre |

## No ejecutado
Cobrar/Pagar con diseño Saint (punto 34) y Bonus/miembro fiel en pantalla; permisos por rol en UI más allá de los menús de vendedor, cajero y bodega; rendimiento con volúmenes grandes; 1920×1080.

## Datos de prueba
Usuarios y datos QA en `DATOS_QA_PRUEBAS.json` (contraseña `Qa123456*`). Quedan además registros `QA-AUTO-…` y las compras/facturas/devoluciones creadas por las pruebas.
