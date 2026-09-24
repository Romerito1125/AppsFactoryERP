# Pruebas OCR de cotizaciones de compras

Archivos ficticios para validar el boton **OCR cotizacion** del modulo **Compras**.

## Archivos

- `cotizacion_proveedor_texto.pdf`: PDF digital con texto seleccionable. Valida la lectura directa del PDF.
- `cotizacion_proveedor_escaneada.pdf`: PDF compuesto por una imagen, sin capa de texto. Valida el OCR de PDF escaneado.
- `cotizacion_proveedor_imagen.png`: imagen de una cotizacion antigua. Valida la carga directa de imagen.
- `cotizacion_proveedor_imagen.jpg`: la misma prueba en formato JPG.

Todos los datos son ficticios y estan preparados para la prueba:

- Proveedor: **Distribuciones Andina S.A.S.**
- NIT: **901.456.789-2**
- Documento: **COT-AND-2026-0042**
- Fecha: **23/09/2026**
- Bodega indicada: **Bodega Principal**
- Productos: **Bebida favorita demo**, cantidad **12**, costo **7.000**; **Cafe utilidad demo**, cantidad **8**, costo **10.000**.
- Total esperado: **164.000**

## Como probarlo

1. Entra al modulo **Compras** y crea una nueva compra.
2. Presiona **OCR cotizacion**.
3. Sube cada archivo, uno por uno, y presiona **Analizar documento**.
4. Comprueba que el proveedor y el numero de cotizacion se detecten correctamente.
5. Verifica que aparezca la lista **Productos detectados** y que cada linea indique **Se agregara** con el producto encontrado.
6. Presiona **Usar datos y agregar productos**.
7. Confirma que la tabla de la compra quede cargada con los dos productos, sus cantidades y costos.
8. Revisa y corrige los datos antes de guardar la compra.

La prueba correcta debe permitir continuar con una compra nueva usando los datos detectados y agregar automaticamente las lineas coincidentes, incluso cuando el archivo sea un PDF escaneado o una imagen. El OCR es una ayuda de captura: siempre se deben revisar cantidades, costos y productos antes de guardar la compra.
