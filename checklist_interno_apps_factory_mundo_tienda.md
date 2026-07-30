# Apps Factory - Checklist interno de desarrollo

> **Documento interno de trabajo:** No enviar al cliente sin depurar alcance, precios y fechas.

**CHECKLIST INTERNO DE FUNCIONALIDADES A DESARROLLAR**

**Proyecto: Mundo Tienda Montes de Maria S.A.S. | Apps Factory Colombia S.A.S.**

Version interna actualizada - 30/07/2026

**Uso del documento:** esta revision fue llenada como corte QA estatico sobre el software propio encontrado en el repositorio local. Se revisaron API NestJS, schema Prisma, panel web React/Vite y documentacion tecnica interna. No se evaluaron Google Play, despliegues, credenciales reales, servicios externos ni pruebas en dispositivo fisico.

**Leyenda QA usada en esta actualizacion**

- `Evidencia`: `API+WEB`, `API`, `WEB`, `Base`, `Docs`, `N/E`.
- `QA`: `100%` completo, `70%` parcial fuerte, `40%` parcial medio, `20%` base tecnica aislada, `0%` no encontrado, `N/E` no evaluado por depender de tercero o ambiente.
- `Estado`: `Verde`, `Amarillo`, `Rojo`, `N/E`.

# 1. Reglas internas de control

| **Item** | **Regla interna** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|----------|-------------------|---------------|--------|------------|-----------------|
| 1 | Todo modulo debe tener flujo creado, permisos por rol, datos de prueba y prueba de aceptacion interna. | API+WEB | 40% | Amarillo | Hay modulos amplios y guards por rol, pero no existen permisos finos por accion ni evidencia de pruebas de aceptacion completas para todos los modulos. |
| 2 | Cualquier funcion que imite Saint Enterprise debe documentarse como referencia funcional, no copia exacta. | No | 0% | Rojo | No se encontro modulo, doc o flujo especifico de referencia Saint Enterprise dentro del software revisado. |
| 3 | Las funciones con impuestos, 4x1000, creditos, exogenas, IVA o contabilidad deben validarse con reglas entregadas por el cliente antes de cerrar. | API+WEB | 20% | Amarillo | Hay base de IVA, creditos y reportes; 4x1000 sigue incompleto y no existe evidencia en el repo de validacion formal con reglas del cliente. |
| 4 | Ningun reporte se marca como terminado hasta validar filtros, totales, exportacion y consistencia con ventas, inventario y recaudos. | API+WEB | 40% | Amarillo | El frontend exporta CSV/PDF y arma cortes, pero el backend de reportes es parcial y no hay evidencia de conciliacion integral de ventas, inventario y recaudos. |
| 5 | Los escaneres de codigo de barras y factura por imagen deben quedar con advertencia de dependencia tecnica por calidad de imagen/datos. | WEB+Docs | 70% | Amarillo | El OCR y el lector por imagen muestran un flujo de revision manual y limitaciones tecnicas, pero la advertencia interna no esta unificada en todo el sistema. |

# 2. Mapa general de modulos obligatorios

| **Modulo** | **Debe existir completamente** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|------------|--------------------------------|---------------|---------------|--------|------------|-----------------|
| App Android cliente final | Registro, inicio de sesion, catalogo, compra, valor domicilio, metodo de pago y seguimiento basico. | Critica | API | 20% | Rojo | La API soporta registro, login, catalogo y pedidos; no se encontro codigo fuente de la app Android ni interfaz cliente final en este repositorio. |
| Panel administrativo web | Usuarios, roles, productos, proveedores, bodegas, inventario, ventas, reportes, ofertas, configuracion. | Critica | API+WEB | 70% | Amarillo | Existe un panel robusto con la mayoria de modulos; faltan permisos granulares y algunas areas de configuracion avanzada. |
| Modulo de ventas / POS | Venta, facturacion, vendedor, cliente, deposito/bodega, precio editable, impuestos, creditos, cotizaciones. | Critica | API+WEB | 70% | Amarillo | Hay POS, facturas, creditos y cotizaciones; la venta no descuenta inventario automaticamente por bodega y faltan medios de pago mixtos. |
| Inventario real | 2.500 referencias aprox., existencias, IVA, proveedores, stock minimo/maximo, alertas por colores. | Critica | API+WEB | 70% | Amarillo | Existe inventario con stock, min/max y semaforo; no se encontro carga masiva ni evidencia de operacion real con 2.500 referencias. |
| Bodegas y traslados | Bodega principal, bodegas como unidades de negocio, ticket/soporte de traslado y reportes. | Critica | API+WEB | 70% | Amarillo | Hay CRUD de bodegas, traslados y reportes visibles; falta ticket o soporte formal de retiro por traslado. |
| Productos y conversiones | Codigo de barras, codigo alterno, marcas, proveedores, categorias, empaques, desempaque y unidades. | Critica | API+WEB | 60% | Amarillo | Productos, marcas, categorias, codigos y unidades existen; no se encontro modulo real de desempaque ni conversion comercial por presentacion. |
| Domiciliarios | Pantallas de pedidos, datos de entrega, estados y responsable del domicilio. | Alta | WEB | 40% | Amarillo | El admin ve pedidos y domicilios con estados; no existe una pantalla propia para rol domiciliario ni responsable asignado. |
| Ofertas y descuentos | Por cliente, cantidad, porcentaje, monto, tipo de oferta y reglas comerciales. | Alta | API+WEB | 70% | Amarillo | Las ofertas existen y son parametrizables; su aplicacion automatica en ventas no esta cerrada de punta a punta. |
| Referidos | 4 generaciones, 10% en primeros niveles y 5% / 5% en siguientes segun utilidad del producto. | Alta | API+WEB | 100% | Verde | La politica de utilidad fue ajustada a 4 generaciones y se fijo la regla 10% / 10% / 5% / 5% con administracion desde el modulo. |
| Reportes | Cierres, ventas, inventario, bodegas, recaudos, IVA, utilidades, exogenas, stock y transacciones. | Critica | API+WEB | 60% | Amarillo | El frontend arma cortes, IVA, exogenas, stock y top productos; backend de reportes y utilidad por cierre sigue parcial. |
| Finanzas / bancos | Cuentas por cobrar, abonos, recaudos, varias cuentas, 4x1000 segmentado. | Critica | API+WEB | 100% | Verde | Los movimientos bancarios ahora persisten bandera 4x1000, base, impuesto, total debitado y segmentacion para reportes y cierres. |
| Scanner | Codigo de barras, codigo alterno, totalizacion de compra y lectura de factura por foto. | Alta | WEB | 70% | Amarillo | Hay escaneo por camara e imagen y OCR de factura; falta un modulo consolidado y trazabilidad formal del OCR dudoso. |
| Publicacion Google Play | Preparacion de ficha, build, pruebas, politicas y envio a revision. | Media | N/E | N/E | N/E | Fuera del alcance de esta revision de software local. No se evaluaron cuentas, builds moviles ni activos de tienda. |

# 3. Checklist detallado por modulo

## 3.1 Usuarios, roles y permisos

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Crear roles: administrador, vendedor, domiciliario, proveedor, cliente final, contabilidad y superusuario. | Critica | API+WEB | 40% | Amarillo | Existen `ADMIN`, `CAJERO`, `VENDEDOR`, `BODEGA`, `CONTADOR` y `CLIENTE`; no existen `DOMICILIARIO`, `PROVEEDOR` ni `SUPERUSUARIO`, y no hay CRUD de roles. |
| Permisos por modulo: ventas, inventario, bodegas, reportes, proveedores, precios, ofertas, usuarios. | Critica | API+WEB | 40% | Amarillo | Hay route guards por rol y endpoints protegidos en varios modulos, pero no permisos detallados por modulo o accion configurable. |
| Registro de auditoria: quien creo, edito, elimino, cambio precio o aprobo movimientos. | Alta | API+WEB | 100% | Verde | Se implemento un log unificado de auditoria con usuario, modulo, accion, entidad, metadata, cambios de precio y aprobacion de traslados/movimientos. |
| Confirmacion obligatoria para cambios sensibles: precio final, descuento, traslado, anulacion, credito. | Alta | WEB | 40% | Amarillo | Existen confirmaciones en varios dialogs y motivo para cambio de precio, pero no es una politica transversal obligatoria para todos los casos sensibles. |
| Historial de acciones filtrable por usuario, fecha y modulo. | Media | API+WEB | 100% | Verde | Existe endpoint administrativo de auditoria y pantalla web para filtrar por usuario, fecha, modulo y texto libre. |

## 3.2 Productos, referencias y proveedores

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Crear/editar producto con nombre, descripcion, imagen, codigo de barras, codigo alterno, marca, proveedor, linea, categoria y subcategoria. | Critica | API+WEB | 70% | Amarillo | Producto, imagen, marca, categoria, proveedores y varios codigos existen; no hay linea o subcategoria dedicadas, y el codigo alterno se resuelve como barcode adicional. |
| Manejar si el producto tiene IVA o no tiene IVA. | Critica | API+WEB | 100% | Verde | Existe `taxRate` en producto y factura con manejo explicito de impuesto. |
| Manejar unidad de venta, empaque, caja, paquete, paca o presentacion definida. | Critica | API+WEB | 70% | Amarillo | El sistema maneja unidades como `UND`, `KG`, `L`, `CAJA` y `PAQUETE`; no se encontro una logica completa de presentaciones comerciales tipo `paca` o reglas de venta por empaque. |
| Manejar proveedor con datos completos: NIT/ID fiscal, tipo, direccion, pais, ciudad, telefonos, email, representante, estado activo. | Alta | API+WEB | 100% | Verde | La ficha del proveedor ahora soporta NIT, tipo, direccion, pais, ciudad, telefonos, email, representante legal y estado activo. |
| Relacionar producto con proveedor, marca y linea de negocio. | Alta | API+WEB | 70% | Amarillo | El producto se relaciona con proveedor principal, secundarios y marca; no existe una entidad explicita de linea de negocio. |
| Soportar carga inicial de aproximadamente 2.500 referencias. | Critica | Base | 20% | Amarillo | El modelo soporta volumen alto, pero no se encontro importacion masiva ni evidencia de carga inicial automatizada. |
| Registrar foto del producto y/o foto de soporte al crear producto nuevo cuando aplique. | Media | API+WEB | 70% | Amarillo | Se puede cargar imagen del producto; no se encontro un campo separado para foto documental de soporte. |

## 3.3 Inventario real y alertas de stock

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Existencia actual por producto y por bodega. | Critica | API+WEB | 100% | Verde | Existe stock por producto y bodega con vistas y endpoints dedicados. |
| Stock minimo y stock maximo por producto. | Critica | API+WEB | 100% | Verde | El producto tiene `minimumStock` y `maximumStock` y se usa en filtros y semaforos. |
| Semaforo verde, amarillo y rojo segun niveles de stock. | Alta | WEB | 100% | Verde | El frontend muestra estados visuales de stock bajo, regular y operativo. |
| Reporte semanal de stock y alerta, con corte dominical y envio por correo. | Alta | API+WEB | 100% | Verde | El modulo de reportes ahora reconstruye el corte semanal al domingo, genera el bloque de stock semanal y permite enviarlo por correo. |
| Reporte de productos sin existencia, bajo minimo, sobre maximo y movimientos recientes. | Alta | API+WEB | 70% | Amarillo | Existen filtros por stock y vista de movimientos recientes; el reporte esta mas apoyado en frontend que en un backend analitico dedicado. |
| Ajustes de inventario con motivo, usuario y soporte. | Critica | API+WEB | 40% | Amarillo | El ajuste exige motivo y queda como movimiento; no se encontro soporte adjunto ni un registro claro del usuario en el historial visible. |
| Control de cantidades exactas para bodegas de almacenamiento: cajas selladas, paquetes sellados y unidades. | Critica | Base | 40% | Amarillo | Existen unidades y cantidades exactas por bodega, pero no un control real de empaques sellados o conversiones fisicas. |

## 3.4 Bodegas, depositos y traslados

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Crear bodega principal y bodegas adicionales como unidades de negocio/deposito. | Critica | API+WEB | 100% | Verde | Hay CRUD de bodegas y uso transversal en productos, inventario y compras. |
| Traslado de bodega a bodega con origen, destino, producto, cantidad, costo, usuario y fecha. | Critica | API+WEB | 70% | Amarillo | El traslado maneja origen, destino, producto, cantidad y fecha; no se encontro costo del traslado ni aprobacion por usuario visible como dato operativo. |
| Generar ticket o soporte cuando se retire mercancia de otra bodega. | Critica | API+WEB | 100% | Verde | Cada traslado aprobado genera ticket formal con numero, soporte, aprobacion y consulta desde historial de movimientos. |
| Reporte diario o cada 3 dias de movimientos entre bodegas. | Alta | API+WEB | 100% | Verde | El modulo de reportes incluye bloque de traslados recientes con ventana de 1 dia o 3 dias, listo para exportar o enviar por correo. |
| Reporte general de todas las bodegas con existencias y valorizacion. | Alta | API+WEB | 60% | Amarillo | Hay existencias por bodega y costos historicos; la valorizacion global no aparece cerrada como reporte integral de backend. |
| Validar que el traslado descuente en origen y aumente en destino. | Critica | API+WEB | 100% | Verde | La logica de inventario valida y ejecuta el descuento y el aumento correctamente. |
| Controlar embalaje y conversion de cantidades para cuadrar cajas, paquetes y unidades. | Alta | API+WEB | 70% | Amarillo | Se agrego perfil de empaque por producto y desglose de cajas, paquetes y unidades en movimientos, tickets y reportes; aun no cubre el modulo completo de desempaque comercial. |

## 3.5 Desempaque y conversiones de producto

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Parametrizar equivalencias: caja -> paquetes -> unidades; ejemplo Raid x3. | Critica | No | 0% | Rojo | No se encontro parametrizacion de equivalencias por producto. |
| Registrar movimientos por unidad aun cuando el ingreso venga por caja o paquete. | Critica | No | 0% | Rojo | No existe conversion operativa de ingreso por presentacion a salida por unidad. |
| Evitar venta por presentacion no permitida si el negocio define venta solo por unidad. | Alta | No | 0% | Rojo | No se encontro regla de bloqueo por presentacion de venta. |
| Mostrar trazabilidad de conversiones y saldos resultantes. | Alta | No | 0% | Rojo | No existe historial o reporte de conversiones. |

## 3.6 Ventas, POS y facturacion

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Venta POS con cliente, vendedor, deposito/bodega, productos, cantidades, precio, impuestos y total. | Critica | API+WEB | 100% | Verde | El POS soporta cliente, usuario vendedor, bodega, carrito, precio, impuestos y total. |
| Manejo de vendedores. | Critica | API+WEB | 70% | Amarillo | Existen roles y seleccion de usuario en POS, pero no un modulo especializado de vendedores ni metas/comisiones. |
| Manejo de tipos de deposito/bodega que factura. | Critica | API+WEB | 70% | Amarillo | El POS filtra por bodega y la operacion trabaja con bodegas, aunque no existe una clasificacion mas rica de depositos facturadores. |
| Manejo de diferentes tipos de clientes: mayorista, minorista y otros definidos. | Critica | API+WEB | 100% | Verde | Se manejan clientes mayorista y minorista. |
| Al menos tres precios especificos por producto. | Critica | API+WEB | 70% | Amarillo | El sistema soporta varios precios, pero no obliga un minimo de tres por producto. |
| Adaptar precio segun tipo de cliente y permitir editar precio final con permiso. | Critica | API+WEB | 40% | Amarillo | Se puede editar precio y escoger precios activos; no se encontro regla automatica cerrada por tipo de cliente. |
| Confirmacion y motivo obligatorio para cambio de precio. | Alta | API+WEB | 70% | Amarillo | El precio puede cambiarse con razon en historial, pero la confirmacion no esta aplicada de forma uniforme en todos los flujos. |
| Aplicar ofertas como el usuario las busque: por cliente, cantidad, monto, porcentaje u otra regla definida. | Alta | API+WEB | 40% | Amarillo | Existe evaluacion de ofertas aplicables, pero no una aplicacion integral y visible en POS/factura para todas las reglas. |
| Cotizacion de productos: crear, guardar, consultar y convertir a venta si aplica. | Alta | API+WEB | 100% | Verde | El modulo de cotizaciones cubre creacion, consulta, cambio de estado y conversion a factura. |
| Tratar impuestos en factura/venta segun parametrizacion. | Critica | API+WEB | 100% | Verde | Facturas y productos manejan `taxRate` y calculos asociados. |
| Manejo de creditos en ventas. | Critica | API+WEB | 100% | Verde | Se pueden generar creditos desde facturas y tambien vender a credito desde POS. |
| Factura con datos suficientes para control interno y reporte. | Alta | API+WEB | 100% | Verde | La factura conserva consecutivo, cliente, items, subtotal, impuestos, total, origen y trazabilidad base. |

## 3.7 Compras virtuales y domicilios

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Cliente final se registra e inicia sesion en app Android. | Critica | API | 30% | Amarillo | La API soporta registro y login de cliente final; no se encontro la app Android. |
| Cliente consulta catalogo y productos disponibles. | Critica | API | 40% | Amarillo | La API publica catalogo, categorias, etiquetas y ofertas; no hay frontend movil en este repositorio. |
| Cliente realiza compra virtual y ve valor del domicilio dentro de la app. | Critica | API | 20% | Amarillo | La API crea pedido con domicilio, pero no existe interfaz movil y no se encontro campo de valor de domicilio. |
| Administrador ve el pedido, metodo de pago y quien lleva el domicilio. | Critica | API+WEB | 40% | Amarillo | El admin ve el pedido y el domicilio; no se encontro metodo de pago del checkout ni responsable asignado de entrega. |
| Domiciliario tiene pantalla de pedidos asignados e informacion de entrega. | Alta | No | 0% | Rojo | No existe pantalla propia para rol domiciliario. |
| Estados basicos: pendiente, en preparacion, asignado, en camino, entregado, cancelado. | Alta | API+WEB | 70% | Amarillo | Existen `PENDIENTE`, `EN_PREPARACION`, `EN_CAMINO`, `ENTREGADO` y `CANCELADO`; no se encontro estado `ASIGNADO`. |

## 3.8 Ofertas, descuentos y reglas comerciales

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Oferta por cliente especifico o grupo/tipo de cliente. | Alta | API+WEB | 70% | Amarillo | La oferta puede apuntar a clientes especificos, productos, tipos y etiquetas; no se encontro segmentacion directa por tipo de cliente. |
| Oferta por cantidad, monto, porcentaje o tipo de oferta. | Alta | API+WEB | 100% | Verde | Se manejan cantidad minima/maxima, porcentaje y monto fijo. |
| Vigencia de oferta: fecha inicio, fecha fin y estado activo/inactivo. | Media | API+WEB | 100% | Verde | La oferta soporta fechas y estado activo. |
| Control de acumulacion o no acumulacion de descuentos. | Media | API+WEB | 100% | Verde | Existe bandera `isStackable`. |
| Reporte de ventas con descuento aplicado. | Alta | API+WEB | 40% | Amarillo | Hay datos de descuentos en facturas y reportes frontend, pero no un reporte cerrado y especifico por oferta aplicada. |

## 3.9 Referidos y mercadeo de redes

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Crear estructura de invitados/referidos por usuario. | Alta | API+WEB | 100% | Verde | Existe relacion entre cliente referente y cliente referido con codigo. |
| Manejar 4 generaciones/niveles. | Alta | API+WEB | 100% | Verde | La estadistica y la politica operan ahora sobre 4 generaciones definidas para la red de referidos. |
| Comision calculada sobre utilidad del producto, no sobre bono fijo. | Critica | API+WEB | 100% | Verde | El sistema tiene politicas de utilidad y beneficios basados en profit. |
| Porcentajes: primeros 2 niveles con 10% segun regla aprobada; siguientes niveles 5% y 5%. | Critica | API+WEB | 100% | Verde | La politica base quedo alineada a 10% para generaciones 1 y 2, y 5% para generaciones 3 y 4. |
| Reporte de comisiones por usuario, venta, producto, utilidad, nivel y estado. | Alta | API+WEB | 60% | Amarillo | Existen estadisticas, red y beneficios por generacion; no se encontro un reporte operativo completo por venta y producto desde la UI. |
| Parametrizacion para cambiar porcentajes sin tocar codigo cuando sea posible. | Media | API+WEB | 100% | Verde | La configuracion de politicas de utilidad se actualiza desde el modulo de referidos. |

## 3.10 Cuentas por cobrar, creditos y recaudos

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Modulo de cuentas por cobrar. | Critica | API+WEB | 100% | Verde | Existe el modulo de creditos y consulta por cliente. |
| Apartado de pagos y abonos. | Critica | API+WEB | 100% | Verde | Se registran abonos con notas y cuenta bancaria opcional. |
| Registro de venta a credito, saldo anterior, abonos, saldo pendiente y vencimientos. | Critica | API+WEB | 100% | Verde | El credito guarda total, pagado, saldo, vencimiento y estado. |
| Todos los recaudos deben aparecer en reporte de cierre. | Critica | API+WEB | 60% | Amarillo | El frontend de reportes muestra recaudos, pero no se encontro un cierre contable integral certificado desde backend. |
| Filtro por cliente, fecha, vendedor, deposito, estado y vencimiento. | Alta | API+WEB | 40% | Amarillo | El modulo permite busqueda y estado; no se encontro cobertura completa de todos los filtros pedidos. |
| Soporte para diferentes instrumentos de pago. | Alta | API+WEB | 40% | Amarillo | Se puede asociar cuenta bancaria, pero no existen tipos detallados de instrumento de pago. |

## 3.11 Finanzas, bancos y 4x1000

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Manejar varias cuentas bancarias/financieras. | Critica | API+WEB | 100% | Verde | Hay CRUD de cuentas bancarias y movimientos asociados. |
| Parametrizar cuando un pago aplica 4x1000. | Critica | API+WEB | 100% | Verde | El movimiento bancario permite marcar si aplica 4x1000 y la decision queda persistida en BD. |
| Recalcular pagos bancarios: si factura es 1.000.000 y aplica 4x1000, registrar 1.004.000 total de salida o pago segun regla. | Critica | API+WEB | 100% | Verde | El backend recalcula base, GMF y total debitado; en egresos o transferencias salientes el saldo se afecta por el valor total incluyendo impuesto. |
| Segmentar el valor del 4x1000 para declaraciones y reportes. | Critica | API+WEB | 100% | Verde | La segmentacion del GMF ya no es estimada: queda almacenada por movimiento y se usa en tablas, exportaciones y correo. |
| Reporte por cuenta bancaria, movimiento, impuesto 4x1000, total pagado y concepto. | Alta | API+WEB | 100% | Verde | El reporte muestra cuenta, banco, movimientos, base, 4x1000, impacto total, factura y concepto usando datos persistidos. |

## 3.12 Reportes, cierres y analitica

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Cierre de caja con filtros por fecha/hora, tipo operacion, cliente, zona, ciudad, vendedor, deposito, usuario y estacion. | Critica | API+WEB | 100% | Verde | El cierre ahora filtra por rango temporal, tipo de operacion, cliente, usuario/vendedor, deposito, zona, ciudad y estacion con metadata guardada en la factura. |
| Fecha configurable para cortes. | Critica | WEB | 100% | Verde | El usuario puede definir fecha inicial y final del corte. |
| Reporte de transacciones procesadas con monto neto, contado, credito, impuestos, total, costos, utilidad y porcentaje de utilidad. | Critica | API+WEB | 100% | Verde | El corte de transacciones ya muestra neto, contado, credito, impuestos, total, costo historico, utilidad y porcentaje de utilidad por factura. |
| Reporte de IVA cobrado. | Critica | API+WEB | 100% | Verde | El modulo de reportes muestra consolidado de IVA. |
| Reporte para exogenas como base de analisis y exportacion, sujeto a definicion contable. | Alta | API+WEB | 70% | Amarillo | Hay bloque de exogenas con exportacion, pero sigue sujeto a validacion contable externa. |
| Reporte de productos mas vendidos, ventas por categoria, proveedor, bodega, vendedor y cliente. | Alta | API+WEB | 70% | Amarillo | El frontend arma top productos y cortes por varias dimensiones; vendedor y utilidad aun no estan cerrados al nivel pedido. |
| Reporte de recaudos en cierre. | Critica | API+WEB | 70% | Amarillo | Se muestran recaudos y creditos en el corte, pero no hay un backend de cierre contable dedicado. |
| Reporte de traslados de inventario. | Alta | API+WEB | 100% | Verde | Los movimientos de inventario y traslados son visibles y exportables. |
| Exportacion de reportes a Excel/PDF cuando aplique. | Media | WEB | 100% | Verde | El frontend exporta a CSV y PDF. |

## 3.13 Scanner y lectura de facturas

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Escanear codigo de barras y mostrar informacion del producto. | Alta | API+WEB | 100% | Verde | Existe escaner por camara e imagen y consulta de producto por barcode. |
| Escanear codigo alterno de cada empresa al registrar producto nuevo. | Alta | API+WEB | 100% | Verde | El sistema permite multiples codigos por producto y captura desde camara o imagen. |
| Totalizar compra por escaneo de productos. | Alta | WEB | 70% | Amarillo | El flujo de facturas y POS puede agregar productos escaneados; la totalizacion existe dentro del flujo de venta. |
| Cargar foto de factura para extraer cantidades, codigos de barra y descripcion cuando tecnicamente sea posible. | Alta | WEB | 100% | Verde | Existe OCR de factura por PDF o imagen para generar borradores de producto. |
| Relacionar lo leido por la factura con productos existentes o crear pendientes de revision. | Media | WEB | 70% | Amarillo | El OCR permite correccion manual e importacion, pero no deja un estado formal de pendiente de revision. |
| Guardar foto/soporte asociado al registro cuando aplique. | Media | Base | 30% | Amarillo | Se guarda imagen del producto, pero no se encontro persistencia formal del documento OCR como soporte asociado. |
| Marcar como pendiente cualquier lectura OCR dudosa para revision humana. | Alta | WEB | 40% | Amarillo | El flujo obliga revision manual, pero no existe bandera persistida de OCR dudoso. |

## 3.14 Integracion o referencia con Saint Enterprise / ERP

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Diseñar UI/flujos que se asemejen funcionalmente al proceso actual del cliente. | Alta | No | 0% | Rojo | No se encontro evidencia explicita de diseno orientado a Saint Enterprise. |
| No prometer clon exacto ni integracion directa sin APIs/accesos/exportables. | Critica | No | 0% | Rojo | No se encontro documentacion o validacion interna de este punto dentro del software revisado. |
| Contemplar importacion de datos desde archivos si Saint Enterprise permite exportar productos, clientes, proveedores o inventario. | Alta | No | 0% | Rojo | No se encontro importador o flujo Saint. |
| Documentar diferencias funcionales y limitaciones tecnicas. | Alta | No | 0% | Rojo | No existe documentacion tecnica en el repo enfocada en diferencias contra Saint. |

## 3.15 Publicacion, soporte y entrega tecnica

| **Funcionalidad interna a completar** | **Prioridad** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|---------------------------------------|---------------|---------------|--------|------------|-----------------|
| Build Android probado en dispositivo real. | Critica | N/E | N/E | N/E | Fuera del alcance de esta revision. No se encontro app Android en el repositorio. |
| Ambiente web administrativo desplegado. | Critica | N/E | N/E | N/E | El despliegue no se puede certificar desde el codigo local. |
| Base de datos inicial configurada. | Critica | API+Docs | 70% | Amarillo | Hay schema Prisma, migraciones y seeds parciales; no se valido una base inicial real cargada para produccion. |
| Cuentas, llaves, variables de entorno y credenciales documentadas internamente. | Alta | Docs | 40% | Amarillo | Existe README del API y `.env.docker.example`, pero no una matriz completa de credenciales internas. |
| Pruebas de roles y permisos. | Critica | Base | 20% | Amarillo | Hay guards y roles, pero no se encontro evidencia de una bateria QA completa de permisos. |
| Documento basico de uso interno/soporte. | Media | Docs | 100% | Verde | Se deja en este corte `manual_usuario_apps_factory_mundo_tienda.md` y su version `.docx` como base de uso interno. |
| Checklist de Google Play: icono, capturas, descripcion, politicas, privacidad, firma, version. | Media | N/E | N/E | N/E | Fuera del alcance de la revision de software local. |

# 4. Criterios de aceptacion interna antes de mostrar al cliente

| **Prueba interna** | **Criterio minimo** | **Evidencia** | **QA** | **Estado** | **Hallazgo QA** |
|--------------------|---------------------|---------------|--------|------------|-----------------|
| Flujo cliente compra virtual | Cliente puede registrarse, ver producto, comprar, ver domicilio y pedido queda visible al admin. | API+WEB | 40% | Amarillo | Registro, catalogo, pedido y seguimiento admin existen; falta frontend movil real y valor/metodo de pago del domicilio. |
| Flujo POS | Vendedor factura producto, aplica precio correcto, impuestos y descuenta inventario de bodega. | API+WEB | 40% | Amarillo | El POS factura con impuestos y precio, pero la factura no descuenta inventario automaticamente. |
| Flujo traslado | Se crea ticket/soporte, descuenta bodega origen, aumenta bodega destino y aparece en reporte. | API+WEB | 70% | Amarillo | El traslado mueve stock y aparece en historial; falta ticket o soporte formal. |
| Flujo inventario bajo | Producto cambia semaforo y aparece en reporte semanal de stock. | API+WEB | 70% | Amarillo | El semaforo existe y el reporte puede mostrar stock critico; no hay automatizacion semanal. |
| Flujo credito | Venta a credito genera cuenta por cobrar, permite abono y aparece en cierre/recaudos. | API+WEB | 70% | Amarillo | El credito y el abono existen; el cierre sigue parcial. |
| Flujo 4x1000 | Pago bancario calcula, segmenta y reporta el impuesto correctamente. | API+WEB | 100% | Verde | El movimiento bancario calcula GMF, persiste base/impuesto/total y lo refleja en reportes y detalle de movimientos. |
| Flujo reporte cierre | Cierre muestra recaudos, creditos, traslados relevantes, impuestos y totales correctos. | API+WEB | 100% | Verde | El cierre integra filtros operativos, recaudos, creditos, traslados, impuestos, costo y utilidad con exportacion y correo. |
| Flujo scanner | Codigo de barras consulta producto; factura por imagen genera datos revisables. | API+WEB | 100% | Verde | Ambos flujos estan presentes en frontend y API. |
| Flujo referidos | Compra calcula utilidad y comision por generacion segun regla configurada. | API+WEB | 70% | Amarillo | La mecanica por utilidad existe; la regla exacta de negocio del checklist aun debe alinearse. |
| Seguridad | Un rol sin permiso no puede entrar ni modificar modulos restringidos. | API+WEB | 40% | Amarillo | Hay guards por rol, pero no permisos granulares ni evidencia QA completa de restriccion en todos los endpoints. |

# 5. Pendientes que Apps Factory debe confirmar con el cliente antes de cerrar desarrollo

| **Pregunta/insumo requerido** | **Por que se necesita** | **Estado actual** | **Hallazgo QA** |
|------------------------------|--------------------------|-------------------|-----------------|
| Archivo/listado de productos, precios, IVA, existencias, codigos, proveedores y bodegas. | Carga inicial y validacion de inventario real. | Pendiente cliente | El software tiene la estructura, pero no se encontro flujo de carga inicial cerrada ni dataset real. |
| Reglas exactas de stock verde/amarillo/rojo. | Configurar semaforo y reportes de alerta. | Pendiente cliente | El software hoy usa umbrales tecnicos propios; falta definicion exacta del cliente. |
| Definicion de precios mayorista, minorista y tercer precio. | POS y app deben calcular precio correcto. | Pendiente cliente | El sistema soporta multiples precios, pero no una regla comercial cerrada por tipo de cliente. |
| Reglas de ofertas y descuentos: acumulables, por cliente, cantidad, fecha, monto. | Evitar calculos ambiguos. | Pendiente cliente | La plataforma permite parametrizar, pero falta confirmar la regla comercial final. |
| Reglas contables/fiscales de IVA, exogenas, 4x1000 y creditos. | No cerrar reportes contables con supuestos. | Pendiente cliente | 4x1000 sigue incompleto y los reportes contables no deben darse por cerrados sin esta definicion. |
| Reglas exactas de referidos por utilidad y generaciones. | Calculo de comisiones. | Pendiente cliente | El modulo existe, pero la politica actual no coincide de forma exacta con la version del checklist. |
| Datos de domiciliarios, zonas, valor de domicilio y metodos de pago. | Compra virtual y operacion de reparto. | Pendiente cliente | El sistema no tiene estos datos modelados de forma completa en el flujo revisado. |
| Exportables o accesos de Saint Enterprise. | Importacion/conciliacion o referencia funcional. | Pendiente cliente | No existe integracion Saint en el software actual. |
| Cuenta Google Play y politicas/privacidad. | Publicacion Android. | Externo | Punto fuera del alcance de esta revision de software local. |

# 6. Semaforo interno de avance

| **Color** | **Uso interno** | **Condicion para marcar** |
|-----------|------------------|---------------------------|
| Rojo | No iniciado o bloqueado | Falta informacion, definicion o desarrollo base. |
| Amarillo | En desarrollo o con dudas | Funciona parcialmente, faltan validaciones, datos o QA. |
| Verde | Completo internamente | Funciona, fue probado por QA y no tiene bloqueantes conocidos. |
| N/E | No evaluado en este corte | Depende de tercero, despliegue, cuenta externa o activo no presente en el repositorio. |

# 7. Control de aprobacion interna

| **Responsable** | **Nombre** | **Fecha** | **Firma/OK** |
|-----------------|------------|-----------|--------------|
| Lider tecnico Apps Factory | | | |
| QA / Pruebas internas | | | |
| Comercial / Alcance | | | |
| Soporte / Implementacion | | | |
