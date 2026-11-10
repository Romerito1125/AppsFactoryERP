from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

OUT = Path('output/pdf/guia-pruebas-cuentas-cobrar-pagar.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)
NAVY = colors.HexColor('#173b63')
BLUE = colors.HexColor('#2f74b5')
LIGHT_BLUE = colors.HexColor('#eaf4ff')
GREEN = colors.HexColor('#16804b')
LIGHT_GREEN = colors.HexColor('#eaf8f0')
AMBER = colors.HexColor('#9a5a08')
LIGHT_AMBER = colors.HexColor('#fff6df')
INK = colors.HexColor('#152334')
MUTED = colors.HexColor('#5e7184')
LINE = colors.HexColor('#d4dee8')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('CoverKicker', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=BLUE, spaceAfter=8))
styles.add(ParagraphStyle('CoverTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=27, leading=31, textColor=NAVY, alignment=TA_LEFT, spaceAfter=10))
styles.add(ParagraphStyle('CoverLead', parent=styles['Normal'], fontSize=12, leading=18, textColor=INK, spaceAfter=14))
styles.add(ParagraphStyle('H1Blue', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=NAVY, spaceBefore=6, spaceAfter=10))
styles.add(ParagraphStyle('H2Blue', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=BLUE, spaceBefore=9, spaceAfter=6))
styles.add(ParagraphStyle('BodyClean', parent=styles['BodyText'], fontSize=9.5, leading=14, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle('SmallMuted', parent=styles['Normal'], fontSize=8, leading=11, textColor=MUTED))
styles.add(ParagraphStyle('Step', parent=styles['BodyText'], fontSize=9.2, leading=13.5, leftIndent=14, firstLineIndent=-14, textColor=INK, spaceAfter=4))
styles.add(ParagraphStyle('Callout', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=10, leading=14, textColor=NAVY, spaceAfter=3))

def P(text, style='BodyClean'):
    return Paragraph(text, styles[style])

def step(number, text):
    return P(f'{number}. {text}', 'Step')

def card(title, body, bg=LIGHT_BLUE, border=BLUE):
    t = Table([[P(title, 'Callout')], [P(body, 'BodyClean')]], colWidths=[171 * mm])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('BOX', (0, 0), (-1, -1), 0.8, border), ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
    return t

def table(data, widths):
    rows = [[P(str(cell), 'SmallMuted' if index == 0 else 'BodyClean') for cell in row] for index, row in enumerate(data)]
    t = Table(rows, colWidths=widths, repeatRows=1, hAlign='LEFT')
    commands = [('GRID', (0, 0), (-1, -1), 0.35, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6), ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white)]
    for index in range(2, len(rows), 2):
        commands.append(('BACKGROUND', (0, index), (-1, index), colors.HexColor('#f7fafc')))
    t.setStyle(TableStyle(commands))
    return t

def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 14 * mm, width, 14 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont('Helvetica-Bold', 9)
    canvas.drawString(18 * mm, height - 9 * mm, 'MUNDO TIENDA')
    canvas.setFont('Helvetica', 8)
    canvas.drawRightString(width - 18 * mm, height - 9 * mm, 'Guía QA - cartera, pagos y retenciones')
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(18 * mm, 8 * mm, 'Actualizada 09/11/2026')
    canvas.drawRightString(width - 18 * mm, 8 * mm, f'Página {doc.page}')
    canvas.restoreState()

doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=23 * mm, bottomMargin=20 * mm)
doc.addPageTemplates([PageTemplate(id='main', frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='normal')], onPage=header_footer)])
story = []
story += [Spacer(1, 20 * mm), P('GUÍA DE PRUEBA INTEGRAL', 'CoverKicker'), P('Cuentas por cobrar y cuentas por pagar', 'CoverTitle'), P('Flujo completo para validar facturas a crédito, retenciones automáticas, pagos y abonos, notas, anticipos, recibos, bancos, estados de cuenta y anulaciones.', 'CoverLead'), Spacer(1, 5 * mm), card('Resultado esperado del lote', 'En Cuentas por cobrar, una factura de $ 100.000 para C00019 genera automáticamente $ 90.000 recibidos y $ 10.000 de retención. En Cuentas por pagar, una compra recibida se paga desde una o varias cuentas y el egreso queda reflejado en Bancos.', LIGHT_GREEN, GREEN), Spacer(1, 8 * mm), P('Esta guía corresponde al Lote 04 y conserva el mismo archivo PDF usado para las pruebas anteriores.', 'SmallMuted'), PageBreak()]
story += [P('1. Datos de prueba ya preparados', 'H1Blue'), P('Usa estos registros para que el flujo sea repetible y fácil de identificar en la base de datos.'), table([['Dato', 'Valor QA', 'Qué debe tener'], ['Cliente', 'C00019 - Cliente QA CxC Pruebas', 'Crédito activo, límite $ 1.000.000'], ['Retención', 'QA-ACCOUNTS-RET-10', '10% en ventas a crédito, aplicada automáticamente'], ['Proveedor', 'QA-ACCOUNTS Proveedor CxP', 'Activo para pruebas de pagar'], ['Bodega', 'QA-ACCOUNTS Bodega Principal', 'Activa'], ['Producto', 'QA-ACCOUNTS Producto de prueba', 'Costo 100 y stock QA'], ['Cuenta', 'QA-ACCOUNTS Caja principal', 'Activa, disponible para recibir dinero']], [31 * mm, 75 * mm, 65 * mm]), Spacer(1, 7 * mm), card('Regla clave', 'La retención pertenece al cliente. No la escribas en la pantalla de pagos. Un cliente sin retención configurada debe mostrar $ 0 de retención y aplicar el abono completo.', LIGHT_AMBER, AMBER), P('Antes de empezar anota el saldo de la cuenta bancaria QA. Después del cobro debe aumentar exactamente por el dinero recibido, sin sumar la retención.'), PageBreak()]
story += [P('2. Crear la factura a crédito', 'H1Blue'), P('Módulo: Ventas → Facturación', 'H2Blue'), step(1, 'Abre <b>Ventas → Facturación → Emitir factura</b>.'), step(2, 'En <b>Cliente</b>, busca <b>C00019</b> y selecciona <b>Cliente QA CxC Pruebas</b>.'), step(3, 'Selecciona un vendedor y un cajero en los campos blancos.'), step(4, 'Agrega <b>QA-ACCOUNTS Producto de prueba</b>, cantidad 1 y precio final de <b>$ 100.000</b>.'), step(5, 'Pulsa <b>Emitir factura</b>. En <b>Total operación</b>, selecciona <b>Crédito</b>. Esta opción solo se muestra si el cliente tiene crédito y cupo disponible.'), step(6, 'Pulsa <b>F3 Aceptar</b>. Copia el consecutivo de la factura para localizarlo en cartera.'), Spacer(1, 6 * mm), card('Comprobación inmediata', 'La factura queda en Ventas y aparece en Administrativo → Cuentas por cobrar → Pendiente con saldo de $ 100.000 y vencimiento calculado.', LIGHT_BLUE, BLUE), P('Si no aparece Crédito, revisa que el cliente sea C00019, tenga crédito activo y que su límite no esté consumido.'), PageBreak()]
story += [P('3. Registrar el abono con retención automática', 'H1Blue'), P('Módulo: Administrativo → Cuentas por cobrar → Operaciones → Pagos y abonos', 'H2Blue'), step(1, 'Selecciona <b>Cliente QA CxC Pruebas</b> y abre <b>Pagos y abonos</b>.'), step(2, 'Selecciona la factura de $ 100.000. La fila se prellena con <b>Monto abonado $ 90.000</b> y <b>Retención automática $ 10.000</b>.'), step(3, 'No edites la columna de retención. Es un valor calculado a partir de la configuración del cliente.'), step(4, 'Pulsa <b>F3 Totalizar</b>. Revisa el número de documento, detalle y vendedor precargados.'), step(5, 'En <b>Efectivo</b> o en <b>Instrumentos de pago</b>, distribuye $ 90.000. No existe la opción Cheques.'), step(6, 'Para pago mixto, usa por ejemplo $ 45.000 en efectivo y $ 45.000 en una cuenta bancaria. El <b>Total desglose</b> debe ser $ 90.000.'), step(7, 'Adjunta un soporte si aplica y pulsa <b>F3 Aceptar</b>.'), Spacer(1, 6 * mm), table([['Concepto', 'Resultado esperado'], ['Saldo de la factura', '$ 0'], ['Aplicado al crédito', '$ 100.000'], ['Ingreso bancario', '$ 90.000'], ['Retención automática', '$ 10.000']], [65 * mm, 106 * mm]), PageBreak()]
story += [P('4. Verificar estado, recibo y cierre', 'H1Blue'), P('Módulos: Administrativo → Cuentas por cobrar, Bancos y Reportes', 'H2Blue'), step(1, 'En <b>Estado de cuenta</b>, filtra Pagos y abonos y confirma el recibo con su número.'), step(2, 'En <b>Pendiente</b>, confirma que la factura ya no tiene saldo pendiente.'), step(3, 'En <b>Vencimientos</b>, confirma que el documento no aparece como vencido ni por vencer.'), step(4, 'En <b>Bancos</b>, valida que la cuenta aumentó solo $ 90.000. La retención no entra al banco.'), step(5, 'En el recibo, pulsa <b>Imprime</b>. Debe verse el documento aplicado por $ 90.000, la retención de $ 10.000 y el total aplicado de $ 100.000, conservando centavos.'), step(6, 'Si el recibo se anula, la cartera y el banco deben regresar a los saldos anteriores.'), Spacer(1, 6 * mm), card('Pagos a proveedores', 'Administrativo → Cuentas por pagar usa el mismo flujo, pero sin retención de cliente ni vendedor. Selecciona compras recibidas, distribuye el pago entre efectivo y las cuentas bancarias y valida los egresos en Bancos.', LIGHT_BLUE, BLUE), PageBreak()]
story += [P('5. Pruebas de control', 'H1Blue'), P('Ejecuta estas comprobaciones para cerrar el lote.'), table([['Prueba', 'Cómo ejecutarla', 'Resultado'], ['Cliente sin retención', 'Usa un cliente sin regla y abre Pagos y abonos', 'Retención $ 0; abono igual al saldo'], ['Pago mixto', 'Efectivo + cuenta bancaria', 'Total desglose igual al dinero recibido'], ['Desglose incorrecto', 'Cambia el total de fuentes para que no coincida', 'No guarda y no mueve saldos'], ['Saldo excedido', 'Aumenta el abono sobre el pendiente', 'Error claro y sin cambios'], ['Documento repetido', 'Reutiliza el ticket de un recibo', 'El sistema rechaza el duplicado'], ['Decimales', 'Prueba un valor como 141,61', 'Se conserva 141,61 en cartera, recibo y PDF']], [43 * mm, 77 * mm, 51 * mm]), Spacer(1, 7 * mm), card('Si algo no aparece', 'Actualiza la ventana de cartera después de crear la factura, verifica que el cliente seleccionado sea C00019 y que la API esté en http://localhost:7502/health con respuesta 200. La regla de retención se administra en Clientes → Datos principales → Retención automática en cobros.', LIGHT_AMBER, AMBER), PageBreak()]

story += [P('6. Cuentas por cobrar - revisión general', 'H1Blue'), P('Módulo: Administrativo → Cuentas por cobrar', 'H2Blue'), step(1, 'En la lista lateral prueba las búsquedas <b>ID Fiscal</b>, <b>Descripción</b> y <b>Clave</b>. Busca C00019 y confirma que solo aparecen clientes con crédito o saldo pendiente.'), step(2, 'Pulsa <b>Toda la cartera · vencimientos generales</b>. Revisa el total de clientes, documentos pendientes, saldo total, vencido y por vencer.'), step(3, 'Vuelve al cliente y revisa las cuatro pestañas: <b>Operaciones</b>, <b>Estado de cuenta</b>, <b>Pendiente</b> y <b>Vencimientos</b>.'), step(4, 'En Estado de cuenta filtra <b>Facturas</b> y luego <b>Pagos y abonos</b>. Cambia Desde/Hasta y confirma el saldo de apertura y el saldo corrido.'), step(5, 'En Pendiente verifica Número, Detalle documento, Vence, Días y Saldo pendiente. En Vencimientos revisa los rangos y el gráfico de vencido.'), step(6, 'En la fila seleccionada usa <b>Imprime</b>, <b>Editar</b> y <b>Soporte</b>. Confirma que el recibo y sus datos corresponden al cliente.'), Spacer(1, 6 * mm), card('Criterio de aprobación', 'La factura queda visible en el estado de cuenta, el saldo corrido cambia después del abono y la vista general permite consultar todos los vencimientos sin seleccionar un cliente.', LIGHT_BLUE, BLUE), PageBreak()]

story += [P('7. Cuentas por cobrar - notas, anticipos y anulaciones', 'H1Blue'), P('Módulo: Administrativo → Cuentas por cobrar → Operaciones', 'H2Blue'), step(1, '<b>Notas de débito</b>: abre la tarjeta, usa documento ND-CXC-001, detalle Intereses QA, valor $ 25.000 y vencimiento. Pulsa <b>Registrar</b>. Debe aparecer una nueva cuenta por cobrar.'), step(2, '<b>Notas de crédito</b>: selecciona una cuenta pendiente, usa NC-CXC-001 y $ 10.000. El saldo baja sin movimiento bancario. Confirma la fila N/C en el estado de cuenta.'), step(3, '<b>Notas crédito / Anticipos</b>: abre <b>Nuevo anticipo</b>, documento ANT-CXC-001, valor $ 50.000 y cuenta QA. Confirma aumento del banco y Saldo anticipos de $ 50.000.'), step(4, 'Aplica $ 30.000 del anticipo a una factura. El crédito baja $ 30.000 y el banco no cambia por la aplicación.'), step(5, 'Devuelve el saldo restante del anticipo y confirma que el banco baja y el anticipo queda Devuelto.'), step(6, '<b>Anular notas crédito / anticipos</b>: anula una nota o anticipo sin aplicar, escribe un motivo y confirma la reversión. Un anticipo aplicado debe bloquear la anulación.'), Spacer(1, 6 * mm), card('Control de errores', 'Una nota mayor que el saldo, una anulación sin motivo o un documento duplicado deben mostrar un error y dejar sin cambios la cartera y el banco.', LIGHT_AMBER, AMBER), PageBreak()]

story += [P('8. Cuentas por pagar - revisión general', 'H1Blue'), P('Módulo: Administrativo → Cuentas por pagar', 'H2Blue'), step(1, 'Busca el proveedor <b>QA-ACCOUNTS Proveedor CxP</b> en la lista lateral y confirma código, nombre, dirección, teléfono y saldo de anticipos.'), step(2, 'Revisa las cuatro pestañas: <b>Operaciones</b>, <b>Estado de cuenta</b>, <b>Pendiente</b> y <b>Vencimientos</b>.'), step(3, 'En Estado de cuenta confirma que las compras recibidas son débitos, los pagos son créditos y el saldo representa lo que falta por pagar.'), step(4, 'En Pendiente valida número de compra, detalle, vencimiento, días y saldo pendiente. En Vencimientos revisa rangos y totales.'), step(5, 'En Operaciones abre <b>Pagos y abonos</b>. El flujo de proveedor no muestra retenciones de cliente ni vendedor.'), step(6, 'En el pie del estado de cuenta prueba <b>Imprime</b>, <b>Editar</b> y <b>Soporte</b> para un pago existente.'), Spacer(1, 6 * mm), card('Preparación de una compra', 'En Compras crea una compra para el proveedor QA, agrega el producto QA, pulsa Guardar compra y confirma su recepción. Solo las compras recibidas con saldo aparecen en Cuentas por pagar.', LIGHT_BLUE, BLUE), PageBreak()]

story += [P('9. Cuentas por pagar - pago y comprobante', 'H1Blue'), P('Módulo: Administrativo → Cuentas por pagar → Operaciones → Pagos y abonos', 'H2Blue'), step(1, 'Selecciona una o dos compras recibidas con saldo y pulsa <b>Registrar pago</b>.'), step(2, 'En la tabla confirma Número, Emisión, Vence, Saldo pendiente, Monto abonado y Saldo restante.'), step(3, 'Pulsa <b>F3 Totalizar</b>. El campo obligatorio es Número de documento, por ejemplo PG-CXP-001, y el detalle Pago de compra QA.'), step(4, 'Distribuye el valor entre efectivo y cuentas bancarias. Ejemplo: $ 50.000 en efectivo y $ 50.000 en transferencia. No uses cheques.'), step(5, 'Adjunta soporte, marca imprimir recibo si lo necesitas y pulsa <b>F3 Aceptar</b>.'), step(6, 'Confirma que el saldo de la compra baja, el recibo aparece como pago y Bancos registra egresos por cada cuenta utilizada.'), step(7, 'Edita el detalle del pago y reimprime el comprobante. El cambio debe quedar en Auditoría.'), Spacer(1, 6 * mm), table([['Validación', 'Resultado esperado'], ['Total debitado', 'Igual al efectivo más las transferencias'], ['Compra', 'Saldo pendiente reducido'], ['Bancos', 'Egreso por cada cuenta seleccionada'], ['Soporte', 'Disponible desde el estado de cuenta']], [65 * mm, 106 * mm]), PageBreak()]

story += [P('10. Cuentas por pagar - notas, anticipos y cierre', 'H1Blue'), P('Módulo: Administrativo → Cuentas por pagar → Operaciones', 'H2Blue'), step(1, '<b>Notas de débito</b>: usa ND-CXP-001, detalle Descuento QA, $ 30.000 y una compra recibida. El saldo de la compra debe bajar y aparecer N/D.'), step(2, '<b>Notas de crédito</b>: usa NC-CXP-001, detalle Flete QA, $ 10.000 y una compra recibida. El saldo de la compra debe subir y aparecer N/C.'), step(3, '<b>Notas débito / Anticipos</b>: crea ANT-CXP-001 por $ 200.000, selecciona la cuenta de salida y pulsa <b>Registrar</b>. Bancos baja y Saldo anticipos sube.'), step(4, 'Pulsa <b>Aplicar a compra</b>, selecciona una compra y aplica $ 50.000. La compra baja y el anticipo queda con $ 150.000.'), step(5, 'Anula un anticipo no aplicado con motivo y confirma que el dinero vuelve al banco. Intenta anular uno aplicado y confirma el bloqueo.'), step(6, 'En el cierre compara saldos iniciales y finales de las cuentas bancarias, cartera, compras, anticipos y recibos. Guarda los consecutivos usados.'), Spacer(1, 6 * mm), card('Cierre completo del lote', 'No deben quedar errores en consola ni en el log de la API. Los totales de cartera y proveedores deben cuadrar con Bancos. Los decimales deben conservarse en pantalla, recibos y PDF.', LIGHT_GREEN, GREEN)]
doc.build(story)
print(OUT.resolve())
