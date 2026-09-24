# Guía para generar manuales de módulos

Esta guía define el método utilizado para crear el manual corto del POS de Mundo Tienda. Debe reutilizarse para crear manuales de Clientes, Productos, Compras, Finanzas, Bodega u otros módulos manteniendo el mismo estilo, calidad visual y estructura.

## Resultado esperado

Cada manual debe entregarse como un archivo `.docx` listo para copiar, editar e imprimir en Word. Debe ser corto, práctico y visual:

- Entre 3 y 6 páginas, según la complejidad del módulo.
- Título claro y subtítulo descriptivo.
- Introducción de un párrafo que explique el objetivo.
- Capturas reales del sistema, recortadas y señaladas.
- Pasos numerados en el orden natural de trabajo.
- Atajos, recomendaciones y solución de errores frecuentes cuando aplique.
- Pie de página con nombre del sistema y número de página.

## Archivos de referencia del manual POS

- Manual final: `Manual_de_uso_POS_Mundo_Tienda.docx`
- Script reutilizable: `.codex-temp/pos-manual/build_manual.py`
- Capturas generadas: `.codex-temp/pos-manual/01_pantalla_general.png` a `04_ticket_y_cobro.png`

Para otro módulo, conviene copiar el script a una carpeta temporal propia y cambiar únicamente el contenido, las imágenes y los títulos. No se debe editar el DOCX manualmente como primera opción porque el script permite repetir el resultado con consistencia.

## 1. Definir el alcance antes de escribir

Documentar solamente las tareas que el usuario final necesita ejecutar. Para cada módulo definir:

1. Quién usa la pantalla.
2. Qué objetivo cumple.
3. Cuál es el flujo completo de inicio a fin.
4. Qué datos debe seleccionar o completar.
5. Qué botón confirma la operación.
6. Qué mensaje confirma que terminó correctamente.
7. Qué errores puede encontrar y cómo resolverlos.

La guía debe diferenciar las acciones del usuario de la administración interna. Por ejemplo, el POS solo explica vender; la creación de productos y la configuración de precios deben documentarse en el manual administrativo.

## 2. Recolectar capturas reales

Usar capturas de la versión nueva y vigente del módulo. No utilizar Legacy ni pantallas antiguas.

Capturar, como mínimo:

- Vista general de la pantalla.
- Zona donde se seleccionan los datos principales.
- Zona de búsqueda, formulario o tabla principal.
- Resultado final, confirmación o comprobante.

Antes de recortar, revisar que la captura corresponda al código actual. Si una captura tiene texto antiguo, cubrirlo o reemplazarla; nunca dejar en el manual una etiqueta diferente a la que ve el usuario actual.

## 3. Recortar y señalar capturas

La numeración debe seguir el orden de uso, no el orden visual accidental de la captura:

1. Datos necesarios para iniciar la operación.
2. Búsqueda, formulario o selección principal.
3. Resultados, productos o líneas de trabajo.
4. Resumen, confirmación o acción final.

Reglas para las anotaciones:

- Usar recuadros con bordes redondeados.
- Usar un color azul petróleo para controles y un verde para resultados exitosos.
- Colocar el número dentro de un círculo en la esquina de la zona resaltada.
- No poner el número sobre una franja vacía, un encabezado o un elemento distinto al descrito.
- Verificar las coordenadas contra la imagen original, no contra una vista redimensionada.
- Cuando el texto de la captura no sea legible por su tamaño, conservar la captura como referencia visual y explicar el nombre del control en el texto del manual.

### Comprobación de coordenadas

Las imágenes pueden cambiar de tamaño al mostrarse en la conversación. Por eso, antes de fijar coordenadas:

1. Abrir la imagen original en su resolución completa.
2. Identificar el ancho y el alto reales.
3. Ubicar la posición de cada zona en esa resolución.
4. Dibujar los recuadros sobre la imagen original.
5. Volver a abrir la captura anotada y revisar que cada número corresponda al texto.

Si la imagen original tiene resolución `W x H`, nunca se deben copiar coordenadas tomadas de una vista que muestre, por ejemplo, `2048 px` de ancho si la imagen real mide `2556 px`.

## 4. Estructura recomendada del DOCX

### Página inicial

- Título: `Manual de uso del [módulo]`.
- Subtítulo: `Guía rápida para [objetivo]`.
- Párrafo corto de alcance.
- Captura general anotada.
- Lista de las zonas principales numeradas.

### Secciones operativas

Usar encabezados como:

1. Preparar la operación.
2. Buscar, seleccionar o completar datos.
3. Revisar la información.
4. Confirmar, guardar, cobrar o emitir.

Cada sección debe incluir una explicación breve, una captura cuando aporte valor y pasos concretos. Evitar párrafos largos y describir los botones con el mismo texto que aparece en la interfaz.

### Cierre

Incluir solo lo que ayude a operar:

- Atajos de teclado.
- Mensajes de confirmación.
- Errores frecuentes.
- Qué hacer si la sesión se pierde o no hay conexión.

## 5. Estilo visual utilizado

Mantener estas decisiones para todos los módulos:

- Fuente principal: Aptos.
- Título: negro, grande y sin subrayado.
- Encabezados: negros y con jerarquía clara.
- Acento operativo: azul petróleo `#14516B`.
- Acento de controles: azul `#2D829F`.
- Confirmaciones: verde `#27834B` sobre fondo verde muy claro.
- Bordes de tablas: gris claro `#D9E1E5`.
- Márgenes aproximados: 0.7 pulgadas.
- Pie de página: `Mundo Tienda · Manual rápido del [módulo]` y número de página.

No usar demasiadas cajas decorativas, banners ni texto de relleno. La prioridad es que el usuario pueda encontrar y ejecutar la acción rápidamente.

## 6. Generación técnica

El manual POS se generó con `python-docx` y Pillow usando las dependencias empaquetadas del entorno. Para repetirlo, usar siempre las rutas de dependencias proporcionadas por `load_workspace_dependencies`; no depender del Python o Node global.

Rutas utilizadas:

```powershell
$PYTHON = "C:\Users\vasqu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$NODE = "C:\Users\vasqu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
```

Ejecutar el generador desde la raíz del proyecto:

```powershell
& $PYTHON ".codex-temp\[modulo]-manual\build_manual.py"
```

El script debe:

- Leer las capturas originales.
- Crear los recortes anotados en una carpeta temporal.
- Construir el DOCX.
- Guardar el resultado con un nombre descriptivo.

Después, copiar el DOCX final a la raíz del proyecto o a la carpeta de entregables:

```powershell
Copy-Item `
  -LiteralPath ".codex-temp\[modulo]-manual\Manual_de_uso_[Modulo].docx" `
  -Destination "Manual_de_uso_[Modulo].docx" `
  -Force
```

## 7. Verificación obligatoria

No entregar el DOCX solo porque el script terminó sin errores. Renderizarlo y revisar todas las páginas.

### Exportar con Word cuando no haya LibreOffice

Si el renderizador estándar no encuentra `soffice.exe`, exportar el DOCX a PDF con Word localmente y rasterizar el PDF con Poppler:

```powershell
$docx = (Resolve-Path "Manual_de_uso_[Modulo].docx").Path
$pdf = Join-Path (Resolve-Path ".codex-temp\[modulo]-manual\render-final").Path "Manual_de_uso_[Modulo].pdf"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Open($docx, $false, $true)
$doc.ExportAsFixedFormat($pdf, 17)
$doc.Close($false)
$word.Quit()

& "C:\Users\vasqu\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe" `
  -png -r 150 $pdf ".codex-temp\[modulo]-manual\render-final\page"
```

Revisar visualmente cada `page-*.png` al 100% y comprobar:

- Que los números señalen la zona correcta.
- Que las capturas no estén desplazadas.
- Que no haya texto cortado ni superpuesto.
- Que las tablas no se salgan del margen.
- Que los títulos y pies de página estén completos.
- Que el botón final y el mensaje de confirmación coincidan con la interfaz actual.
- Que no aparezcan datos sensibles innecesarios.

Si se corrige cualquier texto, imagen o coordenada, volver a generar, renderizar y revisar todas las páginas desde el principio.

## 8. Lista de control antes de entregar

- [ ] El manual corresponde al módulo nuevo y no a Legacy.
- [ ] El título explica claramente el propósito.
- [ ] El flujo se puede seguir de arriba hacia abajo.
- [ ] Los textos de botones coinciden con el sistema.
- [ ] Las capturas están recortadas y señaladas correctamente.
- [ ] La numeración 1, 2, 3 y 4 coincide con la explicación.
- [ ] El manual es corto y fácil de copiar en Word.
- [ ] El DOCX fue renderizado y revisado página por página.
- [ ] El archivo final quedó en una ruta clara y descriptiva.
