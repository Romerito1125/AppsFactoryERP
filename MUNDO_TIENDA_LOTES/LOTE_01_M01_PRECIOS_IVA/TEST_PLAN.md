# Lote 01 — Plan de pruebas

Este archivo define las pruebas del lote. En esta etapa solo se planifican; no se han ejecutado.

## Pruebas de cálculo

| ID | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| CALC-01 | Precio neto con tasa de IVA configurada | Base, IVA y total se redondean por línea y concilian | Pendiente |
| CALC-02 | Precio con IVA incluido editado | Se convierte una sola vez a neto y conserva el total final | Pendiente |
| CALC-03 | Tasa de IVA cero | IVA cero y total igual a base | Pendiente |
| CALC-04 | Cantidad decimal | Subtotal, IVA y total respetan precisión de cantidad y dinero | Pendiente |
| CALC-05 | Descuento u oferta | El descuento no genera un segundo cobro de IVA | Pendiente |
| CALC-06 | Redondeo por varias líneas | La suma de líneas coincide con subtotal, IVA y total de factura | Pendiente |

## Pruebas de selección de precio

| ID | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| PRICE-01 | Precio 0 activo | Se usa Precio 0 | Pendiente |
| PRICE-02 | Precio 1, 2 o 3 activo | Se usa exactamente el nivel seleccionado | Pendiente |
| PRICE-03 | Nivel solicitado inactivo | Se aplica fallback definido y se informa si no existe precio válido | Pendiente |
| PRICE-04 | Precio fuera de vigencia | No se usa como precio comercial | Pendiente |
| PRICE-05 | Cambio autorizado en Productos | Las dos cajas reciben el precio actualizado tras invalidar caché | Pendiente |
| PRICE-06 | Cambio de precio sin motivo | API rechaza la modificación | Pendiente |
| PRICE-07 | Factura histórica después de cambio | La factura conserva sus importes originales | Pendiente |

## Pruebas de integración de facturación

| ID | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| INV-01 | Crear factura desde `/pos` | Persistencia coincide con pantalla | Pendiente |
| INV-02 | Crear factura desde Ventas del escritorio | Persistencia coincide con pantalla y con `/pos` | Pendiente |
| INV-03 | Precio unitario editado con permiso | Se valida, audita y calcula correctamente | Pendiente |
| INV-04 | Precio unitario editado sin permiso | API rechaza la operación | Pendiente |
| INV-05 | Crédito | Límite y saldo usan el total persistido, una sola vez | Pendiente |
| INV-06 | Inventario | La salida usa la cantidad y unidad existentes, dentro de la transacción | Pendiente |

## Pruebas de interfaz

| ID | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| UI-01 | Editar precio en Productos | Campos con IVA incluido y desglose coherente | Pendiente |
| UI-02 | Carrito en `/pos` | Precio, IVA y total coinciden con API | Pendiente |
| UI-03 | Carrito en Ventas | Precio, IVA y total coinciden con API | Pendiente |
| UI-04 | Cambio de cliente/nivel | Los renglones cambian al nivel correcto | Pendiente |
| UI-05 | Scanner y precio | La lectura agrega el precio del nivel actual | Pendiente |

## Regresión

- ofertas activas;
- descuentos por referidos;
- crédito de cliente;
- cantidades por unidad, paquete y caja;
- stock por bodega;
- impresión del documento;
- historial y auditoría de precios;
- productos sin precio activo;
- sesiones y permisos de usuario.

## Evidencia requerida

Para cada prueba cerrada guardar resultado, fecha, usuario, datos de entrada, respuesta API cuando aplique y captura en `evidence/`.

