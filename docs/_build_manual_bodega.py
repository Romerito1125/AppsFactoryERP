from pathlib import Path
from datetime import date

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Manual_Administracion_de_Bodega_Mundo_Tienda.docx"
ASSET_DIR = ROOT / "docs" / "manual_bodega_assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)


NAVY = "154C70"
BLUE = "2C7898"
PALE_BLUE = "EAF4F8"
PALE_GREEN = "EAF7EF"
PALE_ORANGE = "FFF4E3"
PALE_RED = "FDEDEC"
TEXT = "1F2933"
MUTED = "5B6872"
BORDER = "D6E0E5"


def font(size=10, bold=False, color=TEXT, name="Aptos"):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", size=size)
    except OSError:
        return ImageFont.load_default()


def make_ui_reference(path: Path):
    w, h = 1600, 850
    im = Image.new("RGB", (w, h), "#F3F7F9")
    d = ImageDraw.Draw(im)
    f_small = font(22)
    f_body = font(25)
    f_bold = font(27, True)
    f_title = font(36, True)
    f_num = font(28, True)

    d.rectangle((0, 0, w, 84), fill="#155274")
    d.text((42, 22), "Mundo Tienda ERP", fill="white", font=f_title)
    d.text((42, 53), "OPERACIÓN DE BODEGA", fill="#CDE8F0", font=f_small)
    d.rounded_rectangle((1180, 18, 1555, 66), radius=10, fill="#F4FAFC", outline="#B9D2DD", width=2)
    d.text((1205, 29), "Bodega Principal", fill=f"#{NAVY}", font=f_body)

    d.text((42, 115), "Administración de bodega", fill=f"#{TEXT}", font=f_title)
    d.text((42, 160), "Cotizaciones, pedidos de la app y existencias", fill=f"#{MUTED}", font=f_body)

    tabs = [("1", "Resumen"), ("2", "Cotizaciones"), ("3", "Pedidos de la app"), ("4", "Existencias")]
    x = 42
    for n, label in tabs:
        tw = 250 if label != "Pedidos de la app" else 300
        fill = "#DCEEF5" if n == "1" else "#FFFFFF"
        d.rounded_rectangle((x, 205, x + tw, 266), radius=9, fill=fill, outline="#BCD0D9", width=2)
        d.ellipse((x + 17, 220, x + 52, 255), fill=f"#{BLUE}")
        d.text((x + 28, 222), n, fill="white", font=f_num)
        d.text((x + 70, 222), label, fill=f"#{NAVY}", font=f_bold)
        x += tw + 15

    kpi_y = 300
    kpis = [("Cotizaciones pendientes", "2", "#FFF1D6"), ("Alertas de pedidos", "1", "#E6F3F9"), ("Productos bajo mínimo", "3", "#FCE4E3"), ("Bodega asignada", "Bodega Principal", "#E7F6EC")]
    x = 42
    for label, value, fill in kpis:
        kw = 350
        d.rounded_rectangle((x, kpi_y, x + kw, kpi_y + 110), radius=10, fill=fill, outline="#D0DCE2", width=2)
        d.text((x + 22, kpi_y + 18), label, fill=f"#{MUTED}", font=f_body)
        d.text((x + 22, kpi_y + 58), value, fill=f"#{NAVY}", font=f_bold)
        x += kw + 14

    d.rounded_rectangle((42, 450, 790, 790), radius=10, fill="white", outline="#C9D7DE", width=2)
    d.text((68, 478), "Cotizaciones de proveedor pendientes", fill=f"#{NAVY}", font=f_bold)
    d.text((68, 520), "Documentos programados para recepción", fill=f"#{MUTED}", font=f_small)
    rows = [("COT-PROV-DEMO-002", "Proveedor 1", "ORDENADA"), ("COT-PROV-DEMO-001", "Proveedor 1", "RECIBIDA")]
    y = 585
    for code, provider, status in rows:
        d.line((68, y - 18, 760, y - 18), fill="#E1E8EC", width=2)
        d.text((68, y), code, fill=f"#{TEXT}", font=f_bold)
        d.text((68, y + 38), provider, fill=f"#{MUTED}", font=f_small)
        d.rounded_rectangle((495, y + 2, 748, y + 44), radius=8, fill="#EAF4F8", outline="#BBD4DE", width=1)
        d.text((516, y + 10), "Ver cotización y PDF", fill=f"#{NAVY}", font=f_small)
        y += 95

    d.rounded_rectangle((820, 450, 1558, 790), radius=10, fill="white", outline="#C9D7DE", width=2)
    d.text((846, 478), "Notificaciones y pedidos de la app", fill=f"#{NAVY}", font=f_bold)
    d.text((846, 520), "Solo tareas que requieren acción de bodega", fill=f"#{MUTED}", font=f_small)
    for idx, (title, desc) in enumerate([("APP-DEMO-001", "Pendiente · 2 productos"), ("APP-DEMO-002", "En preparación · 1 producto")]):
        yy = 595 + idx * 85
        d.ellipse((850, yy, 884, yy + 34), fill=f"#{BLUE}")
        d.text((861, yy + 4), "!", fill="white", font=f_bold)
        d.text((905, yy - 2), title, fill=f"#{TEXT}", font=f_bold)
        d.text((905, yy + 35), desc, fill=f"#{MUTED}", font=f_small)

    # Numbered legend on the visual itself.
    d.rounded_rectangle((1130, 105, 1555, 178), radius=10, fill="#FFF9E9", outline="#E8D29B", width=2)
    d.text((1152, 122), "Use las pestañas para evitar", fill="#7C5C12", font=f_small)
    d.text((1152, 148), "desplazamientos innecesarios", fill="#7C5C12", font=f_small)
    im.save(path, quality=94)


def make_flow_reference(path: Path):
    w, h = 1600, 560
    im = Image.new("RGB", (w, h), "#F3F7F9")
    d = ImageDraw.Draw(im)
    f_title = font(30, True)
    f_head = font(24, True)
    f = font(21)
    d.text((32, 25), "Flujo operativo de bodega", fill=f"#{TEXT}", font=f_title)
    cards = [
        ("1", "Abrir la cotización", "Cotizaciones  >  Ver detalle", "#EAF4F8"),
        ("2", "Revisar el documento", "Proveedor, productos, cantidades y PDF", "#FFF4E3"),
        ("3", "Confirmar recepción", "Solo cuando el estado sea ORDENADA", "#EAF7EF"),
        ("4", "Validar existencias", "Existencias  >  revisar cantidad y estado", "#FDEDEC"),
    ]
    x = 32
    for n, title, body, fill in cards:
        d.rounded_rectangle((x, 95, x + 360, 395), radius=12, fill=fill, outline="#C8D6DD", width=2)
        d.ellipse((x + 24, 120, x + 74, 170), fill=f"#{BLUE}")
        d.text((x + 40, 126), n, fill="white", font=f_head)
        d.text((x + 24, 210), title, fill=f"#{NAVY}", font=f_head)
        for i, line in enumerate(body.split("  >  ")):
            d.text((x + 24, 270 + i * 35), line, fill=f"#{MUTED}", font=f)
        if x < 1100:
            d.text((x + 375, 220), "→", fill=f"#{BLUE}", font=f_title)
        x += 390
    d.rounded_rectangle((32, 440, 1568, 510), radius=9, fill="#FFFFFF", outline="#C8D6DD", width=2)
    d.text((55, 462), "Al confirmar la recepción, el sistema actualiza la existencia de la bodega y registra la operación.", fill=f"#{NAVY}", font=f)
    im.save(path, quality=94)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=BORDER, size="6"):
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = qn(f"w:{edge}")
        element = borders.find(tag)
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_keep_with_next(paragraph):
    ppr = paragraph._p.get_or_add_pPr()
    keep = OxmlElement("w:keepNext")
    ppr.append(keep)


def add_text(doc, text, bold=False, color=TEXT, size=10, align=None, space_after=5, italic=False):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.08
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    r.font.name = "Aptos"
    r.font.size = Pt(size)
    r.font.color.rgb = RGBColor.from_string(color)
    return p


def add_bullet(doc, text, level=0):
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.05
    r = p.add_run(text)
    r.font.name = "Aptos"
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor.from_string(TEXT)
    return p


def add_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    p.paragraph_format.space_before = Pt(13 if level == 1 else 8)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    for r in p.runs:
        r.font.name = "Aptos Display"
        r.font.color.rgb = RGBColor(0, 0, 0)
        r.font.bold = True
        r.font.size = Pt(16 if level == 1 else 12)
    return p


def add_table(doc, headers, rows, widths=None, header_fill=NAVY):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    set_table_borders(table)
    hdr = table.rows[0]
    set_repeat_table_header(hdr)
    for i, label in enumerate(headers):
        cell = hdr.cells[i]
        set_cell_shading(cell, header_fill)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(label)
        r.font.name = "Aptos"
        r.font.size = Pt(9)
        r.font.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)
    for ridx, row in enumerate(rows):
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cell = cells[i]
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if ridx % 2 == 1:
                set_cell_shading(cell, "F5F8FA")
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.05
            r = p.add_run(str(value))
            r.font.name = "Aptos"
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor.from_string(TEXT)
    if widths:
        for row in table.rows:
            for idx, width in enumerate(widths):
                row.cells[idx].width = Inches(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("Página ")
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor.from_string(MUTED)
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    paragraph._p.append(fld)


def build():
    ui_path = ASSET_DIR / "referencia_pantalla_bodega.png"
    flow_path = ASSET_DIR / "flujo_operativo_bodega.png"
    make_ui_reference(ui_path)
    make_flow_reference(flow_path)

    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Inches(0.62)
    sec.bottom_margin = Inches(0.58)
    sec.left_margin = Inches(0.72)
    sec.right_margin = Inches(0.72)
    sec.header_distance = Inches(0.25)
    sec.footer_distance = Inches(0.28)

    styles = doc.styles
    styles["Normal"].font.name = "Aptos"
    styles["Normal"].font.size = Pt(10)
    styles["Normal"].font.color.rgb = RGBColor.from_string(TEXT)
    styles["Normal"].paragraph_format.space_after = Pt(5)
    styles["Normal"].paragraph_format.line_spacing = 1.08
    for style_name, size in (("Title", 25), ("Heading 1", 16), ("Heading 2", 12)):
        st = styles[style_name]
        st.font.name = "Aptos Display"
        st.font.color.rgb = RGBColor(0, 0, 0)
        st.font.bold = True
        st.font.size = Pt(size)

    header = sec.header.paragraphs[0]
    header.text = "Mundo Tienda ERP  |  Manual de uso de Administración de Bodega"
    header.alignment = WD_ALIGN_PARAGRAPH.LEFT
    for r in header.runs:
        r.font.name = "Aptos"
        r.font.size = Pt(8)
        r.font.color.rgb = RGBColor.from_string(MUTED)
    add_page_number(sec.footer.paragraphs[0])

    # Cover and scope
    p = doc.add_paragraph(style="Title")
    p.paragraph_format.space_after = Pt(4)
    p.add_run("Manual de uso de Administración de Bodega")
    add_text(doc, "Mundo Tienda ERP", bold=True, color=BLUE, size=12, space_after=12)
    add_text(doc, "Guía breve para revisar cotizaciones de proveedores, atender pedidos de la app y consultar existencias de la bodega asignada.", size=12, color=TEXT, space_after=12)
    add_text(doc, f"Versión de la guía: {date.today().strftime('%d/%m/%Y')}", size=9, color=MUTED, space_after=10)
    add_text(doc, "Alcance", bold=True, size=11, space_after=3)
    add_text(doc, "Este manual corresponde al nuevo sistema. El usuario con rol BODEGA trabaja únicamente con la bodega que le fue asignada; las funciones administrativas generales permanecen fuera de este módulo.", size=10, space_after=7)
    add_text(doc, "Objetivo", bold=True, size=11, space_after=3)
    add_text(doc, "Completar cada tarea de bodega desde una vista compacta, con el documento y la información operativa disponibles antes de confirmar una recepción o cambiar el estado de un pedido.", size=10, space_after=10)

    add_heading(doc, "1. Acceso y orientación", 1)
    add_text(doc, "Inicie sesión con un usuario al que el administrador haya asignado el rol BODEGA y una bodega. Al entrar, el encabezado muestra la bodega asignada y el usuario activo. Use Actualizar para volver a consultar la información del sistema.", size=10)
    add_table(doc, ["Elemento", "Qué revisar"], [
        ("Bodega asignada", "Confirme que el nombre corresponda al depósito donde está trabajando."),
        ("Usuario", "Verifique que la sesión pertenezca al bodeguero correcto."),
        ("Actualizar", "Vuelve a cargar cotizaciones, pedidos, notificaciones y existencias."),
        ("Notificaciones", "Muestra únicamente tareas operativas relacionadas con bodega."),
    ], widths=[1.55, 5.75])

    add_heading(doc, "2. Pantalla principal y pestañas", 1)
    add_text(doc, "La pantalla está organizada en cuatro pestañas para evitar múltiples desplazamientos. Seleccione una pestaña según la tarea que vaya a realizar.", size=10)
    pic = doc.add_paragraph()
    pic.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pic.add_run().add_picture(str(ui_path), width=Inches(6.9))
    cap = add_text(doc, "Referencia visual de la pantalla actual. La numeración muestra el orden recomendado de navegación.", italic=True, color=MUTED, size=8.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)
    add_table(doc, ["Pestaña", "Uso"], [
        ("Resumen", "Vista rápida de cotizaciones pendientes, alertas, pedidos y bodega asignada."),
        ("Cotizaciones", "Historial de cotizaciones de proveedor con filtros por estado y detalle."),
        ("Pedidos de la app", "Consulta la información del pedido y actualiza su estado operativo."),
        ("Existencias", "Consulta cantidades, mínimos y productos que requieren revisión."),
    ], widths=[1.8, 5.5])

    add_heading(doc, "3. Revisar una cotización de proveedor", 1)
    add_text(doc, "La cotización que recibe la bodega debe ser la misma que creó el administrativo. Antes de recibir mercancía, revise el documento y confirme que los productos, cantidades, costos y bodega destino sean correctos.", size=10)
    for item in [
        "Abra Cotizaciones y seleccione Ver detalle en el documento que corresponda.",
        "Compruebe proveedor, referencia, bodega destino, fecha esperada, productos, cantidades, costo unitario y total.",
        "Use Ver / imprimir PDF de cotización para consultar o compartir el documento completo.",
        "Cuando la mercancía haya llegado y el documento esté en estado Ordenada, seleccione Confirmar recepción.",
        "Después de confirmar, entre a Existencias y valide que la cantidad de la bodega se haya actualizado.",
    ]:
        add_bullet(doc, item)
    add_text(doc, "Importante: Confirmar recepción cambia el estado del documento a recibido y actualiza la existencia de los productos en la bodega asignada. No confirme si la mercancía todavía no ha llegado o si hay diferencias que deban ser revisadas.", bold=True, color=NAVY, size=10, space_after=8)
    add_table(doc, ["Estado", "Significado", "Acción"], [
        ("Borrador", "Documento en preparación.", "Consultar; no recibir."),
        ("Ordenada", "Cotización enviada o aprobada para recepción.", "Revisar y confirmar solo al recibir."),
        ("Recibida", "La recepción ya fue confirmada.", "Consultar el detalle y validar existencias."),
        ("Anulada", "Documento sin vigencia operativa.", "No recibir; contactar al administrativo."),
    ], widths=[1.25, 3.15, 2.9])

    add_heading(doc, "4. Consultar y actualizar pedidos de la app", 1)
    add_text(doc, "La pestaña Pedidos de la app reúne los pedidos que requieren seguimiento en la bodega. Abra Ver información y editar estado para revisar el cliente, teléfono, dirección, observaciones, productos, cantidades, precios y total.", size=10)
    add_table(doc, ["Estado", "Cuándo usarlo"], [
        ("Pendiente", "El pedido llegó y todavía no se ha comenzado a preparar."),
        ("En preparación", "La bodega está armando el pedido."),
        ("En camino", "El pedido ya salió de la bodega para ser entregado."),
        ("Entregado", "El cliente recibió el pedido."),
        ("Cancelado", "El pedido no continuará y debe quedar registrado como cancelado."),
    ], widths=[1.8, 5.5])
    add_text(doc, "Actualice el estado solo cuando la operación haya ocurrido. El cambio se guarda en el sistema y queda disponible para el seguimiento del pedido.", bold=True, color=NAVY, size=10, space_after=8)
    flow = doc.add_paragraph()
    flow.alignment = WD_ALIGN_PARAGRAPH.CENTER
    flow.add_run().add_picture(str(flow_path), width=Inches(6.9))
    add_text(doc, "Flujo recomendado para una operación de bodega.", italic=True, color=MUTED, size=8.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)

    add_heading(doc, "5. Consultar existencias", 1)
    add_text(doc, "En Existencias se muestran los productos de la bodega asignada con su cantidad actual, mínimo y estado.", size=10)
    add_table(doc, ["Estado", "Interpretación"], [
        ("Disponible", "La existencia está por encima del mínimo configurado."),
        ("Revisar", "La existencia es igual o menor al mínimo; verifique faltantes o reposición."),
    ], widths=[1.8, 5.5])
    add_text(doc, "La tabla es de consulta operativa. Los productos, precios y mínimos se administran fuera de este módulo por los perfiles autorizados.", size=10, space_after=8)

    add_heading(doc, "6. Notificaciones de bodega", 1)
    add_text(doc, "Las notificaciones del bodeguero deben corresponder únicamente a tareas de bodega, como una cotización enviada a su operación o un pedido de la app pendiente. Al abrir una alerta, el sistema debe llevarlo a la pestaña donde puede revisar o resolver la tarea.", size=10)
    add_bullet(doc, "Si la alerta corresponde a una cotización, revise el detalle y el PDF antes de recibir.")
    add_bullet(doc, "Si la alerta corresponde a un pedido, abra la información completa y actualice su estado.")
    add_bullet(doc, "Si no aparecen datos, use Actualizar y confirme que la bodega asignada sea correcta.")

    add_heading(doc, "7. Prueba funcional rápida", 1)
    add_text(doc, "Use esta lista para verificar que el módulo está funcionando de extremo a extremo:", size=10)
    add_table(doc, ["Prueba", "Resultado esperado"], [
        ("Ingreso como BODEGA", "Se muestra la bodega asignada y no otra."),
        ("Cotizaciones", "Se puede abrir el detalle, ver el PDF y filtrar el historial."),
        ("Recepción", "Al confirmar una cotización ordenada, pasa a Recibida y cambian las existencias."),
        ("Pedido de la app", "Se ven cliente, dirección, productos y total; el estado se puede actualizar."),
        ("Notificación", "Al abrirla lleva a Cotizaciones o Pedidos de la app, según corresponda."),
        ("Existencias", "Los valores reflejan la bodega asignada y marcan los productos bajo mínimo."),
    ], widths=[2.05, 5.25])

    add_heading(doc, "8. Solución de problemas", 1)
    add_table(doc, ["Situación", "Qué hacer"], [
        ("No aparecen cotizaciones", "Pulse Actualizar; confirme bodega y revise el filtro del historial."),
        ("No aparece Confirmar recepción", "El documento puede estar recibido, borrador o anulado; solo se confirma una cotización Ordenada."),
        ("El PDF no muestra el detalle", "Abra Ver detalle desde la cotización que creó el administrativo y vuelva a abrir el PDF."),
        ("No se actualiza el pedido", "Revise la conexión, actualice la pantalla y vuelva a guardar el estado."),
        ("La existencia no coincide", "No repita la recepción; valide el estado del documento y reporte la diferencia al administrador."),
    ], widths=[2.25, 5.05])

    add_text(doc, "Fin del manual", bold=True, color=BLUE, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
    doc.core_properties.title = "Manual de uso de Administración de Bodega"
    doc.core_properties.subject = "Guía operativa del módulo de bodega de Mundo Tienda ERP"
    doc.core_properties.author = "Mundo Tienda ERP"
    doc.core_properties.comments = "Manual generado para el nuevo sistema de Administración de Bodega."
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    build()
