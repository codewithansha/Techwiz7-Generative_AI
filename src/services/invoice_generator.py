import io
from datetime import datetime
from typing import Any
import fitz
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch


def generate_invoice_pdf(order_data: dict[str, Any], customer_data: dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0F172A'),
    )
    
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#64748B'),
    )

    proof_badge_style = ParagraphStyle(
        'ProofBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        alignment=2,  # right
        textColor=colors.HexColor('#4F46E5'),
    )

    label_style = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748B'),
    )

    value_style = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#0F172A'),
    )

    ord_num_style = ParagraphStyle(
        'OrderNumVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#4F46E5'),
    )

    paid_style = ParagraphStyle(
        'PaidStatus',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#166534'),
    )

    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor('#475569'),
    )

    td_item_style = ParagraphStyle(
        'TableItem',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor('#1E293B'),
    )

    td_sub_style = ParagraphStyle(
        'TableItemSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#64748B'),
    )

    td_normal_style = ParagraphStyle(
        'TableNormal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=13,
        alignment=1,  # Center
        textColor=colors.HexColor('#334155'),
    )

    td_price_style = ParagraphStyle(
        'TablePrice',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        alignment=2,  # Right
        textColor=colors.HexColor('#0F172A'),
    )

    elements = []

    # 1. Header (Brand and Official Purchase Proof Badge)
    header_data = [
        [
            Paragraph("<b>SupportNova</b><br/><font color='#64748B' size=10>SupportNova Intelligent Commerce</font>", title_style),
            Paragraph("<font color='#64748B' size=9>OFFICIAL PURCHASE PROOF</font><br/><b>Purchase Receipt</b>", proof_badge_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[340, 200])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
    ]))
    elements.append(header_table)
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0F172A'), spaceBefore=2, spaceAfter=18))

    # 2. Metadata Grid
    order_num = order_data.get('order_number', 'NC-000000')
    date_str = order_data.get('purchase_date', datetime.now().strftime("%B %d, %Y"))
    status_str = order_data.get('payment_status', 'PAID')
    payment_method = order_data.get('payment_method', 'Credit Card (SupportNovaPay •••• 4242)')
    customer_name = customer_data.get('name', 'Hassan Customer')
    customer_email = customer_data.get('email', 'customer@supportnova.example')
    shipping_addr = order_data.get('shipping_address', '124 Innovation Way, Tech District, CA 94016')

    meta_rows = [
        [
            Paragraph("ORDER NUMBER", label_style),
            Paragraph("PURCHASE DATE", label_style),
        ],
        [
            Paragraph(f"<b>{order_num}</b>", ord_num_style),
            Paragraph(date_str, value_style),
        ],
        [
            Paragraph("PAYMENT STATUS", label_style),
            Paragraph("PAYMENT METHOD", label_style),
        ],
        [
            Paragraph(f"<b>{status_str}</b>", paid_style),
            Paragraph(payment_method, value_style),
        ],
        [
            Paragraph("BILLED TO", label_style),
            Paragraph("SHIPPING DESTINATION", label_style),
        ],
        [
            Paragraph(f"{customer_name} &lt;{customer_email}&gt;", value_style),
            Paragraph(shipping_addr, value_style),
        ],
    ]
    meta_table = Table(meta_rows, colWidths=[270, 270])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#E2E8F0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#EDF2F7')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 18))

    # 3. Items Table
    items_header = [
        Paragraph("ITEM DESCRIPTION", th_style),
        Paragraph("QTY", ParagraphStyle('THC', parent=th_style, alignment=1)),
        Paragraph("UNIT PRICE", ParagraphStyle('THR', parent=th_style, alignment=2)),
        Paragraph("TOTAL", ParagraphStyle('THR2', parent=th_style, alignment=2)),
    ]
    table_data = [items_header]

    for item in order_data.get('items', []):
        p_name = item.get('productName', 'Product')
        p_ref = item.get('productNumber', '')
        qty = str(item.get('quantity', 1))
        unit_price = f"${float(item.get('unitPrice', 0)):.2f}"
        total_price = f"${float(item.get('totalPrice', item.get('unitPrice', 0))):.2f}"

        item_col = Paragraph(f"<b>{p_name}</b><br/><font color='#64748B' size=8.5>Ref: {p_ref}</font>", td_item_style)
        qty_col = Paragraph(qty, td_normal_style)
        unit_col = Paragraph(unit_price, td_price_style)
        tot_col = Paragraph(total_price, td_price_style)
        table_data.append([item_col, qty_col, unit_col, tot_col])

    items_table = Table(table_data, colWidths=[310, 50, 90, 90])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#CBD5E1')),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 14))

    # 4. Totals Block
    total_val = float(order_data.get('total_amount', 0))
    totals_data = [
        [Paragraph("Subtotal:", ParagraphStyle('SubL', parent=styles['Normal'], alignment=2, fontName='Helvetica', fontSize=10, textColor=colors.HexColor('#475569'))), Paragraph(f"${total_val:.2f}", td_price_style)],
        [Paragraph("Tax & Shipping:", ParagraphStyle('SubL2', parent=styles['Normal'], alignment=2, fontName='Helvetica', fontSize=10, textColor=colors.HexColor('#475569'))), Paragraph("$0.00", td_price_style)],
        [Paragraph("<b>TOTAL AMOUNT:</b>", ParagraphStyle('TotL', parent=styles['Normal'], alignment=2, fontName='Helvetica-Bold', fontSize=12, textColor=colors.HexColor('#0F172A'))), Paragraph(f"<b>${total_val:.2f}</b>", ParagraphStyle('TotV', parent=td_price_style, fontSize=12, textColor=colors.HexColor('#4F46E5')))],
    ]
    totals_table = Table(totals_data, colWidths=[420, 120])
    totals_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LINEBELOW', (0, 1), (-1, 1), 1, colors.HexColor('#0F172A')),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 24))

    # 5. Thank you and Support Message
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=8, spaceAfter=14))
    elements.append(Paragraph("<b>Thank you for your purchase with SupportNova!</b>", ParagraphStyle('TY', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, alignment=1, textColor=colors.HexColor('#1E293B'))))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        f"If you have questions or need assistance regarding this purchase, reference order number <b>{order_num}</b> in the SupportNova customer portal.",
        ParagraphStyle('HelpMsg', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, alignment=1, textColor=colors.HexColor('#64748B'))
    ))

    doc.build(elements)
    return buffer.getvalue()


def generate_invoice_image(order_data: dict[str, Any], customer_data: dict[str, Any], dpi: int = 180) -> bytes:
    pdf_bytes = generate_invoice_pdf(order_data, customer_data)
    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = pdf_doc.load_page(0)
    pix = page.get_pixmap(dpi=dpi)
    return pix.tobytes("png")
