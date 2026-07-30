# Manual de Usuario - Apps Factory ERP Mundo Tienda

Revision basada en el software encontrado en este repositorio el 30/07/2026.

## 1. Alcance del manual

Este manual describe solamente lo que se encontro implementado en el software propio del proyecto.

- Incluye panel administrativo web, POS web, API ERP y seguimiento de pedidos app.
- No incluye Google Play, despliegues, credenciales reales, pasarelas externas ni pruebas en dispositivos fisicos.
- No se encontro codigo fuente de una app Android nativa dentro de este repositorio.

## 2. Roles encontrados en el sistema

### 2.1 Administrador

Puede usar el panel administrativo completo y tambien el POS.

Modulos visibles para este rol:

- Dashboard
- Usuarios
- Clientes
- Referidos
- Productos
- Codigos de barras
- Tipos de producto
- Proveedores
- Etiquetas
- Precios de producto
- Inventario
- Bodegas
- Facturas
- Compras
- Cotizaciones
- Ofertas
- Domicilios
- Pedidos app
- Creditos
- Cuentas bancarias
- Movimientos bancarios
- Reportes
- POS

### 2.2 Contador

Puede usar el POS y los modulos financieros.

Modulos visibles para este rol:

- Creditos
- Cuentas bancarias
- Movimientos bancarios
- Reportes
- POS

### 2.3 Cajero, Vendedor y Bodega

En el frontend revisado estos roles aterrizan principalmente en el POS.

### 2.4 Cliente final

El repositorio expone soporte de API para cliente final, pero no incluye una interfaz movil nativa lista para documentar paso a paso.

Funciones soportadas por API:

- Registro
- Inicio de sesion
- Consulta de catalogo publico
- Consulta de categorias, etiquetas y ofertas
- Creacion de pedido con domicilio
- Flujo de referidos

## 3. Acceso al sistema

### 3.1 Inicio de sesion

1. Abrir la pantalla de login.
2. Escribir usuario y contrasena.
3. Presionar el boton de ingreso.
4. El sistema redirige segun el rol:
5. `ADMIN` va a `Dashboard`.
6. `CONTADOR` va a `Creditos`.
7. `CAJERO`, `VENDEDOR` y `BODEGA` van a `POS`.

Espacio para imagen: pantalla de login.

________________________________________

### 3.2 Navegacion general

1. Usar el menu lateral para entrar a cada modulo.
2. Usar la barra superior para revisar notificaciones y cambiar tema visual.
3. Usar los botones de crear, editar, ver detalle, desactivar o reactivar segun el modulo.

Espacio para imagen: menu lateral del panel.

________________________________________

## 4. Modulos del administrador

### 4.1 Dashboard

El administrador puede:

- Ver resumen operativo general.
- Consultar tarjetas e indicadores de negocio.
- Acceder rapidamente a modulos operativos desde la navegacion general.

Espacio para imagen: dashboard general.

________________________________________

### 4.2 Usuarios

El administrador puede:

- Crear usuarios internos.
- Asociar un usuario a un cliente existente o dejarlo como interno.
- Definir rol entre `ADMIN`, `CAJERO`, `VENDEDOR`, `BODEGA` y `CONTADOR`.
- Cambiar username y contrasena.
- Activar, desactivar y reactivar usuarios.
- Ver detalle del usuario y su trazabilidad basica.

Flujo basico:

1. Entrar a `Usuarios`.
2. Presionar `Nuevo usuario`.
3. Completar cliente asociado, username, contrasena y rol.
4. Guardar el registro.
5. Usar las acciones de tabla para editar o cambiar estado.

Espacio para imagen: listado de usuarios.

Espacio para imagen: formulario de creacion de usuario.

________________________________________

### 4.3 Clientes

El administrador puede:

- Crear clientes.
- Editar datos comerciales y de contacto.
- Clasificar clientes como `MAYORISTA` o `MINORISTA`.
- Desactivar y reactivar clientes.
- Ver codigo y nivel de referidos dentro del detalle.

Flujo basico:

1. Entrar a `Clientes`.
2. Crear el cliente con identificacion, nombres, apellidos, tipo, telefono y direccion.
3. Buscar por nombre, documento o telefono.
4. Abrir el detalle para revisar trazabilidad y datos comerciales.

Espacio para imagen: listado de clientes.

Espacio para imagen: formulario de cliente.

________________________________________

### 4.4 Referidos

El administrador puede:

- Crear una relacion de referido usando un codigo existente.
- Generar o consultar codigo de referido por cliente.
- Ajustar nivel de referido manualmente.
- Ver relaciones registradas.
- Ver red por generaciones.
- Revisar compras, utilidad y beneficio generado por generacion.
- Configurar porcentajes por generacion sin tocar codigo.

Flujo basico:

1. Entrar a `Referidos`.
2. Revisar las pestanas de relaciones, clientes, red y configuracion.
3. Crear la relacion indicando cliente referido y codigo usado.
4. Editar la configuracion de porcentajes por generacion.
5. Guardar cambios para actualizar la politica activa.

Espacio para imagen: tablero de referidos.

Espacio para imagen: configuracion de politicas de utilidad.

________________________________________

### 4.5 Productos

El administrador puede:

- Crear productos con tipo, proveedor principal, proveedores secundarios y marca.
- Registrar descripcion, IVA, stock minimo y stock maximo.
- Cargar imagen del producto.
- Crear varios precios iniciales y marcar uno como principal.
- Registrar stock inicial por bodega.
- Agregar uno o varios codigos de barras.
- Leer codigo por camara o desde imagen.
- Filtrar por tipo, proveedor, bodega, marca, codigo y estado de stock.
- Ver stock consolidado, proveedores asociados y resumen de codigos.
- Editar y cambiar estado del producto.
- Importar un borrador de producto a partir de OCR de factura.

Flujo basico:

1. Entrar a `Productos`.
2. Presionar `Nuevo producto`.
3. Completar datos generales.
4. Agregar precios.
5. Definir bodega y cantidad inicial.
6. Agregar o escanear codigos.
7. Guardar.

Espacio para imagen: listado de productos.

Espacio para imagen: formulario de producto.

Espacio para imagen: lector de codigos del producto.

Espacio para imagen: importacion OCR de factura.

________________________________________

### 4.6 Codigos de barras

El administrador puede:

- Consultar todos los codigos registrados.
- Crear codigos por producto.
- Marcar codigo principal.
- Editar codigo y tipo.
- Desactivar codigos.
- Escanear por camara o leer desde imagen.
- Buscar producto usando el selector visual.

Espacio para imagen: modulo de codigos de barras.

Espacio para imagen: escaneo por camara.

________________________________________

### 4.7 Tipos de producto

El administrador puede:

- Crear tipos de producto.
- Editar descripcion.
- Desactivar y reactivar tipos.
- Usarlos como clasificacion base del catalogo.

Espacio para imagen: modulo de tipos de producto.

________________________________________

### 4.8 Proveedores

El administrador puede:

- Crear proveedores.
- Editar nombre y descripcion.
- Desactivar y reactivar proveedores.
- Usarlos en productos y compras.

Espacio para imagen: modulo de proveedores.

________________________________________

### 4.9 Etiquetas

El administrador puede:

- Crear etiquetas comerciales.
- Editar descripcion.
- Desactivar y reactivar etiquetas.
- Usarlas en productos y ofertas.

Espacio para imagen: modulo de etiquetas.

________________________________________

### 4.10 Precios de producto

El administrador puede:

- Ver precios por producto.
- Crear precios nuevos.
- Editar valor, unidad, cantidad y vigencia.
- Marcar un precio como principal.
- Desactivar precios.
- Consultar historial de cambios de precio.

Espacio para imagen: listado de precios.

Espacio para imagen: historial de precio.

________________________________________

### 4.11 Inventario

El administrador puede:

- Ver stock por producto y por bodega.
- Filtrar por proveedor, tipo, bodega y estado de stock.
- Ver semaforo de stock.
- Registrar entrada.
- Registrar salida.
- Registrar traslado entre bodegas.
- Registrar ajuste.
- Ver historial de movimientos.
- Abrir detalle de producto o movimiento.

Flujo basico para un movimiento:

1. Entrar a `Inventario`.
2. Elegir el tipo de movimiento.
3. Seleccionar producto y bodega origen o destino.
4. Ingresar cantidad.
5. Registrar motivo cuando aplique.
6. Guardar el movimiento.

Espacio para imagen: vista de stock.

Espacio para imagen: formulario de movimiento.

Espacio para imagen: historial de movimientos.

________________________________________

### 4.12 Bodegas

El administrador puede:

- Crear bodegas.
- Editar ubicacion.
- Desactivar y reactivar bodegas.
- Usarlas en productos, inventario y compras.

Espacio para imagen: modulo de bodegas.

________________________________________

### 4.13 Facturas

El administrador puede:

- Crear facturas manualmente.
- Seleccionar cliente.
- Agregar productos y cantidades.
- Tomar el precio activo por defecto o elegir otro.
- Aplicar descuento por referidos disponible.
- Agregar productos desde favoritos.
- Buscar productos en catalogo visual.
- Escanear productos por camara o por imagen.
- Ver detalle de cada factura.
- Descargar PDF.
- Abrir vista previa PDF.
- Editar consecutivo.
- Anular factura.

Flujo basico:

1. Entrar a `Facturas`.
2. Crear una nueva factura.
3. Seleccionar cliente.
4. Agregar productos por listado, favoritos o escaneo.
5. Confirmar cantidades y precios.
6. Guardar la factura.
7. Descargar o imprimir el PDF si se requiere.

Espacio para imagen: listado de facturas.

Espacio para imagen: formulario de factura.

Espacio para imagen: escaneo de producto en factura.

Espacio para imagen: PDF de factura.

________________________________________

### 4.14 Compras

El administrador puede:

- Crear compras en estado borrador.
- Elegir proveedor y bodega destino.
- Definir fecha esperada y referencia externa.
- Agregar lineas con producto, cantidad, costo e impuesto.
- Editar compras en borrador.
- Ordenar la compra.
- Recibir la compra.
- Anular la compra.
- Ver resumen, detalle y metricas.

Cuando se recibe una compra el sistema:

- aumenta inventario,
- registra movimientos,
- y actualiza costo historico del producto.

Espacio para imagen: listado de compras.

Espacio para imagen: formulario de compra.

Espacio para imagen: detalle de compra recibida.

________________________________________

### 4.15 Cotizaciones

El administrador puede:

- Crear cotizaciones.
- Definir fecha de vencimiento.
- Agregar productos y cantidades.
- Consultar el detalle.
- Cambiar estado.
- Rechazar cotizaciones.
- Convertir una cotizacion a factura.

Espacio para imagen: modulo de cotizaciones.

________________________________________

### 4.16 Ofertas

El administrador puede:

- Crear ofertas por porcentaje o monto fijo.
- Definir vigencia.
- Definir minimo y maximo por cantidad.
- Marcar si una oferta es acumulable.
- Asignar ofertas a clientes, productos, tipos de producto y etiquetas.
- Editar, desactivar y reactivar ofertas.
- Ver detalle de cada regla.

Espacio para imagen: listado de ofertas.

Espacio para imagen: formulario de oferta.

________________________________________

### 4.17 Domicilios

El administrador puede:

- Crear un domicilio para una factura activa.
- Registrar direccion, destinatario, telefono y notas.
- Editar los datos del domicilio.
- Cambiar estado entre pendiente, en preparacion, en camino, entregado y cancelado.
- Cancelar domicilios.
- Ver detalle operativo del envio.

Espacio para imagen: listado de domicilios.

Espacio para imagen: cambio de estado del domicilio.

________________________________________

### 4.18 Pedidos app

El administrador puede:

- Ver pedidos creados desde el checkout movil soportado por API.
- Filtrar por estado de entrega.
- Buscar por cliente, pedido o direccion.
- Ver detalle del pedido, factura asociada, cliente, entrega, items y notas.

Nota importante:

- En este repositorio solo se encontro la pantalla administrativa de seguimiento.
- No se encontro la interfaz cliente final de la app Android.

Espacio para imagen: listado de pedidos app.

Espacio para imagen: detalle de pedido app.

________________________________________

## 5. Modulos financieros

### 5.1 Creditos

El administrador y el contador pueden:

- Crear un credito desde una factura activa.
- Definir fecha de vencimiento.
- Consultar estado del credito.
- Registrar abonos.
- Asociar el pago a una cuenta bancaria de forma opcional.
- Cambiar estado del credito.
- Ver detalle de saldo, pagos y trazabilidad.

Espacio para imagen: listado de creditos.

Espacio para imagen: registro de pago de credito.

________________________________________

### 5.2 Cuentas bancarias

El administrador y el contador pueden:

- Crear cuentas bancarias.
- Editar banco, numero y tipo.
- Definir saldo inicial.
- Desactivar y reactivar cuentas.
- Ver saldo consolidado y detalle de cada cuenta.

Espacio para imagen: modulo de cuentas bancarias.

________________________________________

### 5.3 Movimientos bancarios

El administrador y el contador pueden:

- Registrar ingresos.
- Registrar egresos.
- Registrar transferencias entre cuentas.
- Registrar ajustes de saldo.
- Asociar un movimiento a una factura cuando aplique.
- Consultar historial y detalle de movimientos.

Espacio para imagen: listado de movimientos bancarios.

Espacio para imagen: formulario de movimiento bancario.

________________________________________

### 5.4 Reportes

El administrador y el contador pueden:

- Elegir un rango de fechas para el corte.
- Ver resumen de facturacion.
- Ver consolidado de IVA.
- Ver base de exogenas.
- Ver estimacion de 4x1000 sobre movimientos cargados.
- Ver stock critico.
- Ver top de productos.
- Exportar bloques a CSV.
- Exportar bloques a PDF.
- Enviar reporte por correo por medio del modulo de email.

Espacio para imagen: tablero de reportes.

Espacio para imagen: exportacion PDF o CSV.

Espacio para imagen: envio de reporte por correo.

________________________________________

## 6. POS para roles operativos

Los roles `ADMIN`, `CONTADOR`, `CAJERO`, `VENDEDOR` y `BODEGA` pueden entrar al POS.

En el POS se puede:

- Buscar productos.
- Filtrar por categoria y bodega.
- Agregar productos al carrito.
- Cambiar cantidades.
- Quitar lineas del carrito.
- Ver disponibilidad por bodega.
- Elegir cliente.
- Elegir usuario vendedor.
- Elegir cuenta bancaria para ventas de contado.
- Elegir modalidad contado o credito.
- Definir vencimiento para credito.
- Editar un precio existente.
- Crear un precio nuevo para el producto desde el POS.
- Generar la venta.
- Imprimir comprobante.
- Revisar ventas recientes.

Flujo basico de una venta:

1. Entrar a `POS`.
2. Seleccionar bodega.
3. Buscar y agregar productos.
4. Seleccionar cliente.
5. Elegir si la venta sera de contado o credito.
6. Si es contado, seleccionar cuenta bancaria.
7. Si es credito, definir fecha de vencimiento.
8. Confirmar la venta.
9. Imprimir comprobante si se requiere.

Espacio para imagen: pantalla principal del POS.

Espacio para imagen: carrito y forma de pago.

Espacio para imagen: impresion del comprobante.

________________________________________

## 7. Funciones expuestas por API para cliente final

Aunque no se encontro la app Android dentro del repositorio, la API si soporta estas operaciones:

- Registro de cliente final.
- Inicio de sesion.
- Consulta de perfil autenticado.
- Consulta de catalogo publico.
- Consulta de categorias.
- Consulta de etiquetas.
- Consulta de ofertas activas.
- Validacion de codigo de referido.
- Registro de referido.
- Generacion de codigo de referido por cliente.
- Creacion de pedido con domicilio.
- Consulta administrativa de pedidos creados desde la tienda.

Espacio para imagen: pendiente de interfaz movil cuando exista el frontend correspondiente.

________________________________________

## 8. Observaciones de uso

- Las ventas por factura no descuentan inventario automaticamente por bodega; el inventario se gestiona por el modulo de `Inventario`.
- El reporte de 4x1000 visible en frontend es una estimacion calculada sobre movimientos; no se encontro una parametrizacion contable completa del impuesto en backend.
- El OCR y el escaneo por camara requieren validacion humana antes de dar por correcto el resultado.
- Los permisos son por rol fijo; no se encontro un modulo de permisos granulares por accion.

## 9. Espacio para firmas internas

Responsable funcional:

________________________________________

Responsable QA:

________________________________________

Fecha de validacion:

________________________________________
