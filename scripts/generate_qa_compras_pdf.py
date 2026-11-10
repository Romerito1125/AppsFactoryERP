from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path('output/pdf/guia-pruebas-compras.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)
NAVY = colors.HexColor('#173b63')
BLUE = colors.HexColor('#2f74b5')
INK = colors.HexColor('#152334')
MUTED = colors.HexColor('#5e7184')
LINE = colors.HexColor('#d4dee8')

base = getSampleStyleSheet()
TITLE = ParagraphStyle('T', parent=base['Title'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=NAVY, alignment=0, spaceAfter=2)
SUB = ParagraphStyle('S', parent=base['Normal'], fontSize=9, leading=12, textColor=MUTED, spaceAfter=6)
H = ParagraphStyle('H', parent=base['Heading2'], fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=BLUE, spaceBefore=7, spaceAfter=3)
STEP = ParagraphStyle('ST', parent=base['BodyText'], fontSize=9, leading=12.5, leftIndent=13, firstLineIndent=-13, textColor=INK, spaceAfter=2)
CELL = ParagraphStyle('C', parent=base['Normal'], fontSize=8.5, leading=11, textColor=INK)
HEAD = ParagraphStyle('HC', parent=CELL, fontName='Helvetica-Bold', textColor=colors.white)


def p(text, style=STEP):
    return Paragraph(text, style)


def steps(items):
    return [p(f'{n}. {t}') for n, t in enumerate(items, 1)]


def grid(rows, widths):
    data = [[p(c, HEAD) for c in rows[0]]] + [[p(c, CELL) for c in r] for r in rows[1:]]
    t = Table(data, colWidths=widths, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('GRID', (0, 0), (-1, -1), 0.4, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return t


def footer(canvas, doc):
    canvas.saveState()
    w, _ = A4
    canvas.setFillColor(MUTED)
    canvas.setFont('Helvetica', 7.5)
    canvas.drawString(16 * mm, 9 * mm, 'Guía QA - Compras · Datos de DATOS_QA_PRUEBAS.json · Sin contraseñas en este documento')
    canvas.drawRightString(w - 16 * mm, 9 * mm, 'Actualizada 09/11/2026')
    canvas.restoreState()


doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=12 * mm, bottomMargin=14 * mm,
                        title='Guía de prueba - Compras', author='Mundo Tienda QA')

story = [
    p('Flujo de prueba: compra con retención', TITLE),
    p('Un solo recorrido de punta a punta: crear la compra, revisar el Total operación, recibir, pagar y revisar el PDF. Tiempo estimado: 10 minutos.', SUB),

    p('Datos QA', H),
    grid([
        ['Qué', 'Nombre en pantalla'],
        ['Proveedor con retención (2,5 %)', 'QA Proveedor con retencion'],
        ['Depósito', 'QA Bodega Norte'],
        ['Producto (IVA 19 %)', 'QA Gaseosa IVA 19'],
        ['Cuenta de pago', 'QA Caja efectivo'],
    ], [85 * mm, 91 * mm]),

    p('Pasos', H),
    *steps([
        'Abre Compras y pulsa <b>F4</b> (Nueva compra).',
        'Haz clic en <b>Proveedor</b>: debe abrir la ventana de búsqueda. Elige <b>QA Proveedor con retencion</b>. No escribas números a mano.',
        'Elige <b>Depósito</b> = QA Bodega Norte y escribe el <b>Documento compra</b> FP-QA-0001.',
        'Pulsa <b>F5 Productos</b>, agrega <b>QA Gaseosa IVA 19</b>, cantidad <b>100</b>, costo <b>2.000</b>. Renglones: <b>$ 200.000</b>.',
        'Pulsa <b>Guardar compra</b>. En el Total operación escribe <b>Primer descuento</b> 10 y <b>Flete</b> 5.000.',
        'Revisa la retención: <b>Base imponible</b> $ 151.260, retención 2,5 % = <b>$ 3.782</b>, <b>Total a pagar</b> $ 181.218.',
        'Escribe <b>Orden de compra</b> OC-QA-01 y pulsa <b>F3 Aceptar</b>. Queda en Órdenes con saldo pendiente $ 181.218.',
        'En Órdenes abre la compra con doble clic, pulsa <b>Ordenar</b> y luego <b>Recibir</b>. El stock de QA Gaseosa IVA 19 en QA Bodega Norte sube 100.',
        'Abre la compra y registra un pago: <b>Efectivo</b> 50.000 con <b>Caja / cuenta del pago</b> = QA Caja efectivo, y <b>F3</b>. El saldo pendiente baja a <b>$ 131.218</b>.',
        'Intenta pagar 999.999.999: debe aparecer <i>Lo pagado supera el total a pagar</i> y nada cambia.',
        'Pulsa <b>Ver PDF</b> y luego <b>Descargar PDF</b>: debe mostrar total, descuento, flete, retención y total a pagar iguales a los del paso 6.',
    ]),

    p('Resultado esperado', H),
    grid([
        ['Campo', 'Valor esperado'],
        ['Renglones', '$ 200.000'],
        ['Total neto (con 10 % y flete)', '$ 185.000'],
        ['Base imponible / retención 2,5 %', '$ 151.260 / $ 3.782'],
        ['Total a pagar', '$ 181.218'],
        ['Saldo tras pagar $ 50.000', '$ 131.218'],
        ['Stock Norte', 'Sube 100 al recibir'],
    ], [85 * mm, 91 * mm]),

    Spacer(1, 3 * mm),
    p('<b>Si no coincide:</b> revisa que el proveedor tenga 2,5 % de retención, que la cantidad sea 100 y el costo 2.000, y que el producto esté en QA Bodega Norte.', SUB),
]

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT.resolve())
