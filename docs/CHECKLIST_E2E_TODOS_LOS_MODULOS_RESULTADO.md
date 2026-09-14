# Resultado del checklist E2E — Todos los módulos

Fecha: 2026-09-14  
Entorno: `http://localhost:5173/` en Chrome, sesión administrativa.  
Datos QA: se usó el prefijo `QA-E2E-`; todo lo creado para la prueba fue actualizado, consultado y eliminado al finalizar. Se conservaron `admin@mundotienda.com` y los datos `DEMO-*`.

## Leyenda y alcance

- `[x]` Ejecutada correctamente.
- `[!]` Ejecutada con incidencia técnica documentada.
- La UI se recorrió ventana por ventana en Chrome. Las operaciones con efectos financieros o de inventario se ejecutaron también sobre datos QA mediante el flujo de aplicación/API y se verificaron en BD, evitando duplicar movimientos sobre los datos demo.

## 1. Acceso, shell y navegación global

- [x] `SHELL-01` Inicio administrativo y sesión persistente al cambiar de módulo.
- [x] `SHELL-02` Carga de Administrativo, Ventas, Compras y Bancos sin pantalla en blanco ni errores de consola.
- [x] `SHELL-03` Títulos, botones, loading, validaciones y errores observados en español.
- [x] `SHELL-04` Apertura y cierre desde menús y accesos rápidos.
- [x] `SHELL-05` Una sola barra de título y sin doble borde.
- [x] `SHELL-06` Anterior/Próximo navega registros; Bancos no cambia de ventana desde el pie.
- [x] `SHELL-07` Menús superiores revisados sin opciones repetidas.
- [x] `SHELL-08` Búsqueda y menú de filtros revisados en listas.
- [x] `SHELL-09` Carga, vacío, refresco y mensajes de error/reintento revisados.

## 2. Administrativo

### Clientes

- [x] `ADM-CLI-01` Lista completa cargada: 19 registros demo.
- [x] `ADM-CLI-02` Crear `QA-E2E-CLI-01` con datos válidos.
- [x] `ADM-CLI-03` Código y nivel de referido generados automáticamente.
- [x] `ADM-CLI-04` Edición directa de identificación, nombre, tipo, activo y contacto.
- [x] `ADM-CLI-05` Guardado, loading, mensaje y persistencia verificados.
- [x] `ADM-CLI-06` Obligatorios, identificación corta y correo inválido resaltan el campo y muestran español.
- [x] `ADM-CLI-07` Referidos, red y estadísticas consultados.
- [x] `ADM-CLI-08` Eliminación definitiva del cliente QA confirmada.

### Proveedores

- [x] `ADM-PRO-01` Lista cargada: 3 proveedores.
- [x] `ADM-PRO-02` Crear proveedor jurídico QA.
- [x] `ADM-PRO-03` Id. fiscal, descripción, tipo, dirección y financieros editables.
- [x] `ADM-PRO-04` Fax, fecha de inicio, clase y municipio ausentes de la UI.
- [x] `ADM-PRO-05` Campos permitidos editados y guardados con loading.
- [x] `ADM-PRO-06` Obligatorios y valores inválidos validados en español.
- [x] `ADM-PRO-07` Productos asociados y cambio de pestañas verificados.
- [x] `ADM-PRO-08` Eliminación definitiva del proveedor QA confirmada.

### Tipos de producto y bodegas

- [x] `ADM-CAT-01` Tipos de producto cargados.
- [x] `ADM-CAT-02` Tipo `QA-E2E-TIPO-01` creado, editado, consultado y eliminado.
- [x] `ADM-CAT-03` Bodegas cargadas.
- [x] `ADM-CAT-04` Bodega `QA-E2E-BOD-01` creada, editada, consultada y eliminada.
- [x] `ADM-CAT-05` Crear tipo rápidamente desde Productos; modal Guardar/Cancelar operativo.
- [x] `ADM-CAT-06` Crear bodega rápidamente desde Productos; modal Guardar/Cancelar operativo.

### Productos

- [x] `ADM-PRD-01` Búsqueda por texto/código/estado/favoritos; 5 tarjetas demo visibles.
- [x] `ADM-PRD-02` Producto QA creado con proveedor, tipo, bodega, imagen y precio.
- [x] `ADM-PRD-03` Código, descripción, nombre, proveedor, tipo, activo y bodega editables.
- [x] `ADM-PRD-04` Guardado con loading y persistencia tras recarga.
- [x] `ADM-PRD-05` Precios creados, editados, activados/desactivados y eliminados.
- [x] `ADM-PRD-06` Margen correcto: ganancia / costo de adquisición × 100; $5.000 / $10.000 = 50%.
- [x] `ADM-PRD-07` Unidades por empaque creadas, editadas y eliminadas sin `undefined.trim`.
- [x] `ADM-PRD-08` Ajuste de inventario y stock/valor por bodega verificados.
- [x] `ADM-PRD-09` Códigos de barras creados, editados, principal/desactivado y eliminados.
- [x] `ADM-PRD-10` Imagen cargada, cambiada, eliminada y previsualizada.
- [x] `ADM-PRD-11` Favorito marcado y quitado; favoritos demo persistidos.
- [x] `ADM-PRD-12` Proveedor, tipo, código, descripción y cantidades validados.
- [x] `ADM-PRD-13` Producto con relaciones no se elimina: mensaje seguro y sin pérdida indebida.

### Retenciones

- [x] `ADM-RET-01` Retenciones cargadas.
- [x] `ADM-RET-02` `QA-E2E-RET-01` creado con rangos y porcentajes.
- [x] `ADM-RET-03` Código, descripción, base, aplicación y rangos editados.
- [x] `ADM-RET-04` Loading, guardado y persistencia verificados.
- [x] `ADM-RET-05` Rangos inválidos y vacíos resaltados con mensajes en español.
- [x] `ADM-RET-06` Retención QA eliminada definitivamente.

### Usuarios

- [x] `ADM-USR-01` Usuarios cargados: 10 visibles, incluido admin.
- [x] `ADM-USR-02` Usuario QA creado con contraseña y rol.
- [x] `ADM-USR-03` Identificación, correo, nombre, rol y contraseña editados directamente.
- [x] `ADM-USR-04` Accesos por módulos guardados mediante `PUT /usuarios/:id/permisos` y verificados.
- [x] `ADM-USR-05` Loading en actualización, rol y permisos verificado.
- [x] `ADM-USR-06` Correo, contraseña y obligatorios inválidos validados en español.
- [x] `ADM-USR-07` Usuario QA eliminado definitivamente, no archivado.

### Cuentas por cobrar y pagar

- [x] `ADM-CTA-01` Cobrar muestra anticipos `$75.000` y saldo `$14.280`.
- [x] `ADM-CTA-02` Cuenta por cobrar QA con productos y vencimiento creada y verificada.
- [x] `ADM-CTA-03` Abono registrado desde fila con botón `Abonar`, sin depender del doble clic.
- [x] `ADM-CTA-04` Doble clic, monto máximo, saldo parcial y saldo pagado verificados.
- [x] `ADM-CTA-05` Pagar muestra compras recibidas y saldo proveedor `$171.360`.
- [x] `ADM-CTA-06` Pago parcial a proveedor con cuenta bancaria y loading verificado en QA.
- [x] `ADM-CTA-07` Monto superior, cuenta inactiva y saldo insuficiente validados en español.

## 3. Ventas

### Facturación

- [x] `VEN-FAC-01` Cliente, vendedor, bodega, contado/crédito y cuentas cargados.
- [x] `VEN-FAC-02` Clientes/productos buscados por texto, código e imagen.
- [x] `VEN-FAC-03` Varios productos, cantidades, subtotal, IVA, total y utilidad verificados; total local `$38.080`.
- [x] `VEN-FAC-04` Stock insuficiente, producto sin precio y obligatorios validados.
- [x] `VEN-FAC-05` Venta de contado QA emitida; factura, inventario y banco verificados.
- [x] `VEN-FAC-06` Venta a crédito QA emitida; cuenta por cobrar verificada.
- [x] `VEN-FAC-07` Factura demo cargada y detalle consultado.
- [x] `VEN-FAC-08` Loading, cancelación y limpieza verificados.

### Presupuestos

- [x] `VEN-COT-01` Presupuesto QA con varios productos creado.
- [x] `VEN-COT-02` Guardado con loading y registro en tabla confirmado.
- [x] `VEN-COT-03` Cargar, ver, aprobar y rechazar verificados.
- [x] `VEN-COT-04` Presupuesto aprobado convertido a factura QA.
- [x] `VEN-COT-05` Vigencia y errores de cliente/productos validados.

### Pedidos y notas de entrega

- [x] `VEN-PED-01` Estados Pendiente, En preparación, En camino, Entregado y Cancelado visibles.
- [x] `VEN-PED-02` Búsqueda y detalle de pedido verificados.
- [x] `VEN-ENT-01` Destinatario, dirección y estados de entregas visibles.
- [x] `VEN-ENT-02` Entrega QA creada y estados actualizados.
- [x] `VEN-ENT-03` Cambios de estado persistieron tras recargar.

### Devoluciones, reportes y varios

- [x] `VEN-DEV-01` Factura consultada y flujo de devolución/anulación abierto; detalle informa devolución de inventario.
- [x] `VEN-REP-01` Reportes muestran métricas, tablas y filtros; 13 ventas y `$704.480` vendidos.
- [x] `VEN-VAR-01` Accesos de Varios abren ventanas funcionales.

## 4. Compras

### Compras y órdenes

- [x] `COM-CPR-01` Proveedor, bodega, documento y fecha cargados.
- [x] `COM-CPR-02` Compra QA con productos, costos, impuestos y cantidades creada.
- [x] `COM-CPR-03` Proveedor, bodega, documento, fecha y productos editados.
- [x] `COM-CPR-04` Guardado con loading y persistencia confirmados.
- [x] `COM-OC-01` Estados Borrador, Ordenada, Recibida y Anulada consultados.
- [x] `COM-OC-02` Borrador cargado, editado y guardado.
- [x] `COM-OC-03` Borrador ordenado y transición validada.
- [x] `COM-OC-04` Orden recibida; stock, costo e inventario verificados en QA.
- [x] `COM-OC-05` Orden permitida anulada y estado confirmado.
- [x] `COM-PAG-01` Pago parcial de compra recibido y saldo bancario verificado en QA.

### Cotizaciones, devoluciones, entregas, reportes y varios

- [x] `COM-COT-01` Cotizaciones sin duplicados; alcance real informado como órdenes de compra.
- [x] `COM-DEV-01` Devoluciones abiertas; alcance real y acceso a órdenes recibidas visibles.
- [x] `COM-ENT-01` Recepciones pendientes consultadas y orden recibida desde la vista en QA.
- [x] `COM-REP-01` Reportes muestran 10 compras, 5 pendientes y `$1.886.626` acumulado.
- [x] `COM-VAR-01` Accesos de Varios verificados.
- [x] `COM-MENU-01` Menús superiores revisados sin duplicación.

## 5. Bancos

### Cuentas, bancos y beneficiarios

- [x] `BAN-CTA-01` 3 cuentas consultadas con saldos.
- [x] `BAN-CTA-02` Cuenta QA creada, editada y eliminada/desactivada.
- [x] `BAN-CTA-03` Ajuste de saldo a cero permitido.
- [x] `BAN-BAN-01` Bancos agrupados y saldos consultados: Bancolombia, Davivienda y Nequi.
- [x] `BAN-BEN-01` Beneficiarios consultados y buscados: 19 clientes y 3 proveedores demo.

### Transacciones

- [x] `BAN-TRX-01` Ingreso QA registrado con loading y saldo verificado.
- [x] `BAN-TRX-02` Egreso QA registrado con saldo suficiente y 4×1000.
- [x] `BAN-TRX-03` Nota de crédito y nota de débito QA registradas.
- [x] `BAN-TRX-04` Transferencia QA registrada y ambos movimientos confirmados.
- [x] `BAN-TRX-05` Ajuste QA registrado, incluido saldo real cero.
- [x] `BAN-TRX-06` Cuenta, monto, descripción, destino y saldo insuficiente validados.
- [x] `BAN-TRX-07` Movimientos buscados y encabezados conservados; 8 demo visibles.

### Cuentas, reportes y varios

- [x] `BAN-CXC-01` CxC muestra documento, cliente, total y saldo; excluye anticipos negativos.
- [x] `BAN-CXP-01` CxP muestra proveedor, estado y saldo.
- [x] `BAN-REP-01` Reporte muestra saldo `$9.653.774`, ingresos `$1.188.774`, egresos `$700.000` y detalle.
- [x] `BAN-REP-02` Filtro por cuenta actualiza totales y tabla.
- [x] `BAN-VAR-01` Accesos de Varios verificados.
- [x] `BAN-NAV-01` Pie de Bancos solo muestra Salir.

## 6. Verificación técnica y cierre

- [!] `TECH-01` Lint web pasó; lint global backend conserva 1.026 errores y 24 advertencias preexistentes de `any`/formato. No impide el build y no fue causado por esta auditoría.
- [x] `TECH-02` Build de Vite exitoso.
- [x] `TECH-03` Build de NestJS exitoso.
- [x] `TECH-04` `git diff --check` sin errores.
- [x] `TECH-05` Recarga Chrome y persistencia de datos demo confirmadas.
- [x] `TECH-06` Consulta final: 0 registros `QA-E2E-` sin limpiar.

## Registro de hallazgos y correcciones

| ID | Estado | Resultado |
|---|---|---|
| F-01 | Corregido | Bancos → Cuentas por cobrar ahora filtra documentos con saldo pendiente mayor que cero y no muestra anticipos negativos. |
| F-02 | Corregido | Menús contextuales de Compras quedaron sin opciones repetidas. |
| F-03 | Corregido | Bancos dejó de usar Anterior/Próximo para cambiar de ventana; el pie solo muestra Salir. |
| F-04 | Corregido | Productos validado con tipo/bodega, creación rápida, imágenes, favoritos, precios, margen, empaques, inventario y códigos de barras. |
| F-05 | Documentado | Cotizaciones y devoluciones de Compras muestran el alcance real basado en órdenes recibidas, sin mockup engañoso. |
| F-06 | Pendiente técnico | La deuda de lint global del backend requiere una tarea separada; los builds, lint web, consola Chrome y QA CRUD pasaron. |

## Resumen

- **125 pruebas totales**.
- **124 correctas**.
- **1 incidencia técnica**: `TECH-01`, lint global del backend preexistente.
- **0 bloqueadas**.
- **31/31 pruebas QA API/BD correctas**.
- **0 registros QA-E2E restantes**.
- Consola Chrome: **0 errores y 0 advertencias** durante el recorrido.
