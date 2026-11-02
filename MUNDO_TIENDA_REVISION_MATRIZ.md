# MUNDO TIENDA — Revisión técnica del plan y matriz de cumplimiento

**Fecha de revisión:** 2026-11-01  
**Repositorio revisado:** `D:\Apps Factory\Proyectos\AppsFactoryERP`  
**Modo:** revisión de solo lectura. No se modificaron archivos existentes, no se ejecutaron pruebas ni builds.

## 1. Fuentes revisadas

- Plan técnico: `D:\MUNDO_TIENDA_PLAN_CODEX.md`
- Roadmap y referencias visuales: `D:\Mundo_Tienda_Roadmap_Actualizaciones_14_Oct_2026.pdf`
- Código del repositorio, incluidos API, web, Prisma, roles, permisos y módulos de Productos, Ventas, POS, Compras, Cartera, Bancos, Inventario, Bodegas y Reportes.

El plan define 48 numerales del #30 al #77. Ocho numerales son referencias visuales (`#49, #51, #57, #59, #60, #66, #67, #72`) y `#62` también es una referencia de pantalla, no un desarrollo independiente.

## 2. Alcance y diferencia entre instrucciones y requisitos

### Solicitud del usuario

La solicitud fue:

- comparar el plan con el código existente;
- revisar las imágenes del PDF;
- no cambiar nada;
- explicar cómo cumplir cada punto;
- indicar qué tendría que hacerse para tener una entrega lista hoy.

### Instrucciones operativas del plan

El documento también contiene reglas para una futura implementación:

1. Revisar el repositorio antes de programar.
2. Trabajar por fases y comenzar por P0.
3. No hacer migraciones destructivas ni cambiar datos productivos sin respaldo y rollback.
4. No inventar reglas sobre IVA, GMF, retenciones, crédito, bonos, devoluciones o permisos.
5. No marcar tareas como terminadas sin evidencia.
6. Centralizar cálculos de precios, IVA, pagos e inventario.
7. Usar las capturas como referencia funcional y visual, no como especificación completa.
8. Después de cada lote documentar cambios, migraciones, pruebas, riesgos y decisiones pendientes.

Estas reglas son instrucciones de ejecución del backlog. No son funcionalidades que puedan marcarse como implementadas.

## 3. Conclusión ejecutiva

El proyecto tiene una base sólida en catálogo, precios 0–3, facturación, créditos, compras, inventario por bodega, movimientos bancarios, permisos y notificaciones. Sin embargo, el plan todavía no está cumplido.

Los bloqueadores principales son:

- semántica única de precios netos, precios con IVA y redondeos;
- sincronización entre Productos, Compras, POS y Facturación;
- pagos mixtos y atomicidad entre factura y banco;
- anticipos y saldos a favor;
- devoluciones parciales y su impacto en crédito e inventario;
- borradores de ventas;
- retenciones detalladas y editables;
- disponibilidad por bodega y traslados sugeridos;
- reportes con filtros combinados.

No es técnicamente seguro declarar todas las actualizaciones listas el mismo día. Para una salida hoy habría que reducir alcance a un lote P0/P1, aprobar las decisiones de negocio pendientes y completar pruebas manuales antes de publicar.

## 4. Evidencia principal del código

- `app/api/prisma/schema.prisma`: existen `Product`, `ProductPrice`, `ProductCost`, `Invoice`, `InvoiceItem`, `InvoiceCredit`, `CreditPayment`, `PurchaseOrder`, `BankAccountMovement`, `Quote` y `Notification`; no existe un modelo de devolución ni una entidad de pagos mixtos o anticipos independientes.
- `app/api/src/modules/facturas/facturas.service.ts`: la factura y la disminución de inventario se manejan en una transacción; el precio seleccionado y el IVA se calculan en backend.
- `app/web/src/modules/sales/sales-window.jsx`: el flujo crea la factura y después registra un único ingreso bancario; hay vendedor, cuenta bancaria y selector contado/crédito, pero no cajero separado ni varios instrumentos.
- `app/web/src/modules/pos/pos-window.jsx`: existe una entrada específica de código de barras y lógica de recuperación de foco, aunque debe integrarse con el flujo de facturación que se considere oficial.
- `app/web/src/modules/products/products-window.jsx`: muestra y edita cuatro niveles de precio, precio con IVA, precio antes de IVA, ganancia y margen.
- `app/api/src/modules/compras/compras.service.ts` y `app/web/src/modules/purchases/purchases-window.jsx`: existen borradores de compras, recepción con movimientos de inventario, adjuntos, pagos y alta rápida de producto.
- `app/api/src/modules/inventario/inventario.service.ts`: existe inventario por bodega y traslado múltiple, pero la operación crea el movimiento directamente y el ticket inicia aprobado.
- `app/api/src/modules/creditos/creditos.service.ts`: existen abonos y movimientos bancarios asociados, pero no soportes persistentes, anticipos independientes, devolución de saldo o corrección auditada de pagos.
- `app/api/src/modules/movimientos-bancarios/movimientos-bancarios.service.ts`: existe GMF configurable para egresos y transferencias salientes.
- `app/web/src/modules/reports/reports-window.jsx`: existen reportes por bloques y periodo, pero no filtros combinados de barrio, marca, empresa y frecuencia.

## 5. Matriz completa del plan

### Estados

- **Parcial:** hay código relacionado, pero falta una parte del criterio de aceptación o no hay evidencia de verificación.
- **Falta:** no existe el flujo, modelo o endpoint necesario.
- **Referencia:** es una captura del PDF y no genera una tarea funcional independiente.
- **No cerrable:** el plan necesita una decisión de negocio antes de definir la implementación.

### M01 — Catálogo, precios e IVA

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #33 Desincronización entre productos y facturación | Parcial | Existe `ProductResolver`, niveles de precio y lectura de precios desde Facturación. | Definir una fuente única para precio, impuesto y stock; invalidar cachés; probar que un cambio autorizado en Productos se refleja en POS, Compras y Facturación. |
| #37 Inventario valorizado con IVA | Falta | Inventario calcula principalmente `cantidad × costo`; la UI muestra valor de adquisición sin desglose tributario. | Mostrar por bodega y total general valor sin IVA, IVA y valor con IVA, con la tasa y criterio visibles. |
| #41 Impedir IVA duplicado | Parcial, riesgo P0 | Facturación calcula base + IVA; Productos convierte precio bruto/neto; Compras etiqueta costos como IVA incluido aunque el servicio maneja costos netos. | Centralizar la fórmula y el redondeo. Definir si cada campo es base neta o precio final. Probar base + impuesto = total una sola vez. |
| #42 Precio de venta IVA incluido y editable | Parcial | Productos permite editar precio con IVA; Facturación recibe precio de catálogo y no expone claramente edición autorizada del precio unitario final. | Permitir edición por permiso, recalcular base/IVA/total y persistir el valor aplicado sin volver a gravarlo. |
| #65 Mostrar precios de venta en Compras | Falta | Compras muestra producto, cantidad y costo, pero no los precios de venta 0–3. | Añadir los cuatro precios en cada línea, con vínculo al catálogo y permisos de edición. |
| #66 Captura de editor de precios en compra | Referencia | C24 del PDF. | Usarla para diseñar #65 y #68; no crear una tarea separada. |
| #67 Captura de precios lineales | Referencia | C25 del PDF. | Usarla para la vista lineal de costos y cuatro precios. |
| #68 Cuatro precios consistentes | Parcial avanzada | API y Productos validan niveles 0–3 y registran historial. | Reutilizar el mismo servicio en Compras y Facturación; verificar edición y lectura coherentes en todas las pantallas. |

### M02 — Facturación y punto de venta

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #39 Escáner de código de barras | Parcial | `pos-window.jsx` tiene input con Enter; `sales-window.jsx` tiene búsqueda de códigos, pero no el mismo flujo de scanner en facturación. | Integrar el lector en el flujo oficial, aceptar dispositivos que escriben como teclado, evitar duplicados y mostrar error controlado para códigos inexistentes. |
| #40 Regreso de foco después de cantidad | Parcial | El POS nuevo recupera foco; la edición de cantidad del módulo Ventas no demuestra el retorno automático al lector. | Usar una referencia al campo de código y devolver foco después de Enter, manteniendo cantidad y atajos. |
| #43 Cajero y vendedor | Parcial | La factura guarda creador y el formulario permite seleccionar vendedor. | Persistir cajero y vendedor por separado; mostrarlos en consulta y comprobante; aplicar permisos. |
| #44 Crédito definido por cliente | Parcial | `Client.hasCredit` y `Client.maxCredit` se validan en backend; la UI todavía muestra selector contado/crédito. | Hacer que la ficha del cliente determine la elegibilidad sin selector redundante y corregir todos los flujos de creación de crédito. |
| #47 Preventa vendedor → caja | Parcial | Cotizaciones se pueden guardar, convertir y enviar a una bodega. | Crear flujo explícito de preventa, revisión en caja, edición antes de convertir, responsables separados, bodega por línea y conversión única. |
| #49 Captura de referencia de preventa | Referencia | C16 del PDF. | Usarla como guía visual de #47. |
| #54 Ticket D1/ARA | Parcial | La impresión actual abre una vista A4. | Crear ticket compacto, con artículos, documento, IVA, pagos, impresión y reimpresión idénticas. |
| #62 Referencia visual del módulo Ventas | Referencia | C22 del PDF. | Usarla como referencia de navegación para ventas, preventas y devoluciones. |
| #73 Borradores en compras y facturación | Parcial | Compras tiene estado `BORRADOR`; Ventas no persiste un borrador de factura. | Crear estado/modelo compartido; cerrar y reabrir sin perder líneas; no mover inventario, bancos ni cartera hasta confirmar. |

### M03 — Cartera, pagos, bancos y caja

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #34 Estados de cuenta, abonos y comprobantes | Parcial | Créditos, abonos y movimientos bancarios existen. | Añadir soportes persistentes, comprobantes, número de documento, auditoría de correcciones y relación robusta con pagos de proveedores. |
| #35 Movimiento bancario del 4×1000 | Parcial | `BankAccount.gmfRate`, `appliesGmf`, base, tarifa, importe y total existen para egresos/transferencias. | Parametrizar aplicabilidad, exenciones y auditoría; separar el cargo del valor pagado y conciliar saldo. |
| #38 Anticipos y saldos a favor | Falta | No existe entidad independiente para anticipo/saldo a favor; el filtro visual no crea ese saldo. | Registrar anticipo, aplicarlo posteriormente sin duplicar ingresos y separarlo del cierre diario. |
| #52 Crédito, bonos y fidelización | Parcial | Hay crédito, descuentos, ofertas y referidos. | Definir y parametrizar “bonus/miembro fiel”; asegurar que cada descuento o medio se aplique una sola vez. |
| #53 Pago con varios instrumentos | Falta | POS exige una sola cuenta bancaria y crea un solo movimiento posterior a la factura. | Crear asignaciones por efectivo, cuentas y otros medios; validar suma, vuelto, atomicidad e idempotencia. |
| #70 Devolución o compensación de saldo a favor | Falta | No existe endpoint ni modelo para reintegro o compensación. | Decidir caja/banco/compensación, autorizar la operación, registrar salida una sola vez y evitar saldos negativos. |

### M06 — Compras y proveedores

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #63 Entrega prevista en el contexto correcto | Parcial | `PurchaseOrder.expectedAt` existe y `Delivery` maneja pedidos de clientes. | Separar visual y funcionalmente fecha esperada de proveedor frente a promesa de entrega al cliente. |
| #64 Funciones del administrador | No cerrable | Hay roles y permisos, pero el documento no define qué acciones concretas deben cambiar. Algunas mutaciones de Compras no reciben actor ni restringen bodega. | Aprobar matriz de acciones y permisos; aplicarla en creación, edición, orden, cancelación, recepción y pagos. |
| #69 Compra precargada y condición de pago | Parcial | Hay borradores, conservación de datos y pago de compras recibidas. | Añadir condición de pago formal, obligación a proveedor y relación directa del pago; evitar inferir pagos por texto de descripción bancaria. |
| #71 Crear producto desde compra | Parcial avanzada | Existe alta rápida de producto y regreso al editor de compra. | Verificar permisos, duplicados, conservación completa del borrador y selección inmediata del producto creado. |
| #72 Captura de selector de producto | Referencia | C28 del PDF. | Usarla como guía de #71. |
| #74 Generación de PDF en compras | Parcial | Existe vista previa/impresión del navegador y archivo adjunto. | Generar PDF desde datos persistidos de la compra confirmada, guardarlo o vincularlo y permitir reimpresión. |
| #75 Registrar retenciones | Parcial | Se calcula una retención agregada desde datos del proveedor y subtotal. | Parametrizar tipo, base, tarifa, umbral y desglose por concepto; reflejarlo en documento y contabilidad. |
| #76 Base imponible editable | Falta | No existe base editable con motivo y permisos. | Permitir ajuste controlado de base, recalcular retención, conservar IVA/total original y auditar quién cambió. |
| #77 Retenciones visibles para contador | Falta | No hay reporte contable detallado de retenciones por periodo. | Mostrar/exportar proveedor, documento, base, tarifa, importe y saldo neto. |

### M04 — Inventario, traslados y bodegas

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #31 Traslados sugeridos según faltantes | Falta | Productos tienen mínimos/máximos; traslados se ejecutan directamente. | Calcular faltantes y reservas, sugerir cantidades sin superar origen, permitir revisión y confirmar antes de crear movimientos. |
| #32 Operaciones para bodeguero | Parcial | Existe rol BODEGA, bodega asignada y validación de acceso en varias operaciones. | Completar alcance por endpoint y UI, documentos, envío, recepción, estados y trazabilidad del responsable. |
| #36 Proveedor sugerido por marca e historial | Falta | Producto conoce proveedores, pero Compras no propone proveedor por historial o marca. | Consultar compras anteriores y proponer proveedor editable sin alterar catálogo. |
| #45 Artículos de otras bodegas | Falta | La grilla de ventas no muestra claramente el origen de cada línea. | Añadir etiqueta de bodega de origen visible y accesible, no dependiente solo del color. |
| #46 Disponibilidad por bodega | Parcial | `ProductWarehouse` e Inventario tienen cantidades por ubicación. | Mostrar disponibilidad por bodega en la venta, distinguir físico/reservado/disponible y evitar prometer unidades no disponibles. |
| #48 Aviso a bodegas por línea | Parcial | Cotizaciones pueden enviar una notificación a un usuario BODEGA. | Asociar bodega a cada línea, dirigir avisos solo a las bodegas involucradas y registrar pendiente/atendido/surtido. |

### M05 — Devoluciones

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #56 Devoluciones parciales con historial | Falta | No existe modelo ni servicio de devoluciones; “Anular y devolver” anula la factura completa. | Crear devolución por líneas/unidades, motivo, documento original, inventario y efecto financiero sin anular lo no devuelto. |
| #57 Captura de menú de devoluciones | Referencia | C19 del PDF. | Usarla para diseñar la navegación de #56. |
| #58 Devolución aplicada a crédito | Falta | No hay vínculo devolución → `InvoiceCredit`. | Reducir deuda solo por el valor devuelto, calcular saldo a favor si aplica y evitar doble abono. |
| #59 Captura de devolución ligada a crédito | Referencia | C20 del PDF. | Usarla en los casos de #58. |
| #60 Captura de formulario de devolución | Referencia | C21 del PDF. | Usarla para confirmación y captura de motivo/cantidad. |
| #61 Listado permanente de devoluciones | Falta | No existe tabla o endpoint de historial de devoluciones. | Crear consulta por factura, producto, usuario, fecha, motivo, cantidad e impacto financiero/inventario. |

### M07 — Analítica y reportes

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #55 Reportes con filtros combinados | Parcial | Hay pestañas de facturación, inventario, IVA, compras, clientes, productos y traslados, con filtro por periodo. | Añadir filtros combinados de barrio, marca, empresa y frecuencia; incluir devoluciones y evitar doble conteo. |

### M08 — Interfaz y UX transversal

| Punto | Estado | Evidencia actual | Qué falta para cumplirlo |
|---|---|---|---|
| #30 Ventanas completas sin recortes | Parcial | Hay cambios locales de estilos relacionados con ventanas y grillas; no se hizo QA visual. | Verificar 1366×768 y 1920×1080, scroll, maximización, botones, diálogos y navegación por teclado. |
| #50 Grilla con más renglones y colores claros | Parcial | Hay ajustes locales de colores y densidad. | Confirmar cantidad de filas, contraste, estados y acciones en ventas, compras, reportes e inventario. |
| #51 Captura de referencia de totalización | Referencia | C17 del PDF. | Usarla como guía visual para #52 y #53. |

## 6. Relación con las imágenes del PDF

- **C01:** muestra el problema de ventanas recortadas; corresponde a #30.
- **C14, C24 y C25:** muestran proveedor sugerido, editor de precios y cuatro precios; corresponden a #36, #65 y #68.
- **C15, C16, C17, C18 y C22:** muestran vendedor, preventa, totalización, varios medios de pago y navegación de ventas; corresponden a #43, #47, #52, #53 y #62.
- **C19, C20 y C21:** muestran menú, devolución ligada a crédito y confirmación/historial; corresponden a #56, #58 y #61.
- **C23, C26, C27, C28 y C29:** muestran compra, condición de pago, alta de producto y retenciones; corresponden a #65, #69, #71, #74, #75, #76 y #77.

Las capturas deben orientar la UX, pero cada pantalla debe conectarse a datos persistidos, permisos, inventario, banco, cartera y auditoría.

## 7. Decisiones pendientes antes de implementar

El propio plan deja decisiones abiertas que bloquean una implementación segura:

- significado exacto de precios 0–3 y quién puede editarlos;
- tratamiento fiscal, precio neto/bruto y redondeos;
- cuándo aplica GMF y qué operaciones son exentas;
- tipo, base, tasa y umbral de cada retención;
- significado operativo de “bonus/miembro fiel”;
- reglas de crédito y fecha de vencimiento;
- tratamiento de anticipos y saldos a favor;
- devolución por banco, caja o compensación;
- permisos exactos de administrador y bodeguero;
- reserva y aprobación de stock en preventas;
- definición de “máximo” para traslados;
- tamaño y campos del ticket D1/ARA;
- si se permite corregir pagos ya registrados y cómo se audita;
- alcance concreto del punto #64.

## 8. Ruta realista para una entrega hoy

### Bloque 1 — Decisiones y congelamiento del alcance

Confirmar las decisiones anteriores, revisar los cambios locales ya existentes y definir qué commit o rama representa el candidato de salida.

### Bloque 2 — P0 de precios e impuestos

Resolver #33, #41 y #42 con un servicio único de precio/IVA, contratos claros y pruebas de base, impuesto, total, redondeo y persistencia.

### Bloque 3 — Caja y facturación

Integrar #39 y #40 en el flujo real de caja, corregir #44, separar cajero/vendedor para #43 y asegurar que la factura y el movimiento financiero sean atómicos.

### Bloque 4 — P1 financiero

Completar comprobantes y auditoría de #34. Implementar #53 solo si los pagos mixtos son indispensables para la salida.

### Bloque 5 — Validación y decisión de release

Revisar manualmente:

- venta contado;
- venta a crédito;
- cambio de precio 0–3;
- precio con IVA;
- escáner y foco;
- compra recibida;
- abono de cartera;
- inventario por bodega;
- permisos de usuario;
- impresión de comprobantes;
- resoluciones 1366×768 y 1920×1080.

Los puntos P2 y P3 que no estén implementados deben quedar explícitamente fuera del release, con una fecha y lote posterior. No se debe declarar todo el roadmap terminado solo porque exista una pantalla o una referencia visual.

## 9. Criterio para marcar un punto como cumplido

Cada numeral debe tener:

1. código identificable en API y/o web;
2. migración reversible si cambia el esquema;
3. permisos y actor auditables;
4. prueba unitaria, integración o manual reproducible;
5. comprobación de no duplicar IVA, pagos, inventario o saldos;
6. captura visual cuando el punto tenga referencia del PDF;
7. documentación de riesgos y decisiones pendientes;
8. estrategia de rollback.

## 10. Estado del repositorio revisado

Al iniciar la revisión ya existían cambios no confirmados en:

- `app/web/index.html`
- `app/web/src/components/desktop/window-titlebar.jsx`
- `app/web/src/index.css`
- `app/web/src/modules/pos/pos-window.css`
- `app/web/src/modules/reports/reports-window.css`
- `app/web/src/modules/sales/sales-window.jsx`
- `.claude/`

Estos cambios fueron preservados y no se consideraron evidencia suficiente de cumplimiento hasta que sean revisados, probados y confirmados.

