from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from database.models import Customer, Order, User, UserRole
from database.session import get_db
from security.auth import CurrentUser
from src.services.access import customer_for
from src.api.schemas import InvoiceOut, OrderOut
from src.services.invoice_generator import generate_invoice_pdf, generate_invoice_image

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


def _serialize_order(o: Order) -> dict[str, Any]:
    created_iso = o.created_at.isoformat() if hasattr(o.created_at, "isoformat") else str(o.created_at)
    return {
        "id": o.id,
        "_id": str(o.id),
        "orderNumber": o.order_number,
        "order_number": o.order_number,
        "customerId": o.customer_id,
        "customer_id": o.customer_id,
        "items": o.items or [],
        "totalAmount": float(o.total_amount),
        "total_amount": float(o.total_amount),
        "quantity": int(o.quantity),
        "orderSummary": o.order_summary,
        "order_summary": o.order_summary,
        "paymentStatus": o.payment_status,
        "payment_status": o.payment_status,
        "paymentMethod": o.payment_method,
        "payment_method": o.payment_method,
        "shippingAddress": o.shipping_address or "",
        "shipping_address": o.shipping_address or "",
        "createdAt": created_iso,
        "created_at": created_iso,
    }


def _resolve_order_and_check_access(id_or_number: str, user: User, db: Session) -> Order:
    if id_or_number.isdigit():
        order = db.query(Order).filter(Order.id == int(id_or_number)).first()
    else:
        order = db.query(Order).filter(Order.order_number == id_or_number.strip()).first()

    if not order:
        raise HTTPException(status_code=404, detail=f"Order '{id_or_number}' not found")

    if user.role == UserRole.customer:
        cust = customer_for(db, user)
        if not cust or order.customer_id != cust.id:
            raise HTTPException(status_code=403, detail="You do not have permission to view this order")

    return order


@router.get("", response_model=list[OrderOut])
@router.get("/", response_model=list[OrderOut])
def list_orders(user: CurrentUser, db: Session = Depends(get_db)):
    if user.role == UserRole.customer:
        cust = customer_for(db, user)
        if not cust:
            return []
        orders = db.query(Order).filter(Order.customer_id == cust.id).order_by(Order.id.desc()).all()
    else:
        orders = db.query(Order).order_by(Order.id.desc()).all()

    return [_serialize_order(o) for o in orders]


@router.get("/{id_or_number}", response_model=OrderOut)
def get_order(id_or_number: str, user: CurrentUser, db: Session = Depends(get_db)):
    order = _resolve_order_and_check_access(id_or_number, user, db)
    return _serialize_order(order)


@router.get("/{id_or_number}/invoice/pdf")
def get_order_invoice_pdf(id_or_number: str, user: CurrentUser, db: Session = Depends(get_db)):
    order = _resolve_order_and_check_access(id_or_number, user, db)
    cust = db.query(Customer).filter(Customer.id == order.customer_id).first()
    cust_data = {
        "name": cust.display_name if cust else user.full_name,
        "email": cust.email if cust else user.email,
    }
    date_str = (
        order.created_at.strftime("%B %d, %Y")
        if hasattr(order.created_at, "strftime")
        else str(order.created_at)[:10]
    )
    order_data = {
        "order_number": order.order_number,
        "purchase_date": date_str,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "shipping_address": order.shipping_address or "124 Innovation Way, Tech District, CA 94016",
        "items": order.items or [],
        "total_amount": float(order.total_amount),
        "quantity": int(order.quantity),
    }
    pdf_bytes = generate_invoice_pdf(order_data, cust_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{order.order_number}.pdf"'},
    )


@router.get("/{id_or_number}/invoice/image")
def get_order_invoice_image(id_or_number: str, user: CurrentUser, db: Session = Depends(get_db)):
    order = _resolve_order_and_check_access(id_or_number, user, db)
    cust = db.query(Customer).filter(Customer.id == order.customer_id).first()
    cust_data = {
        "name": cust.display_name if cust else user.full_name,
        "email": cust.email if cust else user.email,
    }
    date_str = (
        order.created_at.strftime("%B %d, %Y")
        if hasattr(order.created_at, "strftime")
        else str(order.created_at)[:10]
    )
    order_data = {
        "order_number": order.order_number,
        "purchase_date": date_str,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "shipping_address": order.shipping_address or "124 Innovation Way, Tech District, CA 94016",
        "items": order.items or [],
        "total_amount": float(order.total_amount),
        "quantity": int(order.quantity),
    }
    img_bytes = generate_invoice_image(order_data, cust_data)
    return Response(
        content=img_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{order.order_number}.png"'},
    )


@router.get("/{id_or_number}/invoice")
def get_order_invoice(
    id_or_number: str,
    user: CurrentUser,
    download: bool = Query(False),
    format: str = Query("json"),
    db: Session = Depends(get_db),
):
    if format == "pdf":
        return get_order_invoice_pdf(id_or_number, user, db)
    if format in ("image", "png"):
        return get_order_invoice_image(id_or_number, user, db)

    order = _resolve_order_and_check_access(id_or_number, user, db)
    cust = db.query(Customer).filter(Customer.id == order.customer_id).first()
    cust_name = cust.display_name if cust else user.full_name
    cust_email = cust.email if cust else user.email

    date_str = (
        order.created_at.strftime("%B %d, %Y")
        if hasattr(order.created_at, "strftime")
        else str(order.created_at)[:10]
    )

    invoice_data = {
        "store_name": "SupportNova",
        "order_number": order.order_number,
        "purchase_date": date_str,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "customer_name": cust_name,
        "customer_email": cust_email,
        "shipping_address": order.shipping_address or "124 Innovation Way, Tech District, CA 94016",
        "items": order.items or [],
        "total_amount": float(order.total_amount),
        "quantity": int(order.quantity),
        "thank_you_message": "Thank you for your purchase with SupportNova! Grounded in policy, validated by design.",
    }

    if format == "html" or download:
        items_rows = "".join(
            f"""
            <tr>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #1e293b;">
                <strong>{item.get('productName', 'Product')}</strong>
                <div style="font-size: 12px; color: #64748b; font-family: monospace;">Ref: {item.get('productNumber', '')}</div>
              </td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: center; color: #334155;">{item.get('quantity', 1)}</td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right; color: #0f172a; font-weight: 600;">${float(item.get('unitPrice', 0)):.2f}</td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right; color: #0f172a; font-weight: 700;">${float(item.get('totalPrice', item.get('unitPrice', 0))):.2f}</td>
            </tr>
            """
            for item in order.items
        )

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice {order.order_number} · SupportNova</title>
  <style>
    @media print {{
      body {{ background: #fff !important; padding: 0 !important; }}
      .no-print {{ display: none !important; }}
      .invoice-box {{ box-shadow: none !important; border: 1px solid #cbd5e1 !important; }}
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 40px 20px;
      color: #0f172a;
    }}
    .invoice-box {{
      max-width: 680px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .brand h1 {{ margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; }}
    .brand p {{ margin: 4px 0 0; font-size: 13px; color: #64748b; font-weight: 500; }}
    .proof-badge {{
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 12px;
      text-align: right;
    }}
    .proof-badge small {{ display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }}
    .proof-badge span {{ font-size: 13px; font-weight: 700; color: #0f172a; }}
    .meta-grid {{
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      background: #f8fafc;
      padding: 18px 20px;
      border-radius: 8px;
      margin-bottom: 28px;
      border: 1px solid #edf2f7;
    }}
    .meta-item label {{ display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }}
    .meta-item p {{ margin: 0; font-size: 15px; font-weight: 600; color: #0f172a; }}
    .order-number {{ font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 16px !important; color: #6366f1 !important; font-weight: 800 !important; }}
    .status-paid {{ display: inline-block; background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 12px; }}
    table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; }}
    th {{ background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 2px solid #e2e8f0; }}
    .totals {{
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
      margin-bottom: 30px;
    }}
    .totals-box {{
      width: 240px;
      border-top: 2px solid #0f172a;
      padding-top: 12px;
    }}
    .total-row {{ display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }}
    .total-row.grand {{ font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; }}
    .footer {{
      text-align: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 24px;
      font-size: 13px;
      color: #64748b;
    }}
    .print-btn {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #4f46e5;
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      margin-bottom: 20px;
      text-decoration: none;
    }}
  </style>
</head>
<body>
  <div style="max-width: 680px; margin: 0 auto;" class="no-print">
    <button class="print-btn" onclick="window.print()">
      🖨️ Print or Save as PDF
    </button>
  </div>
  <div class="invoice-box">
    <div class="header">
      <div class="brand">
        <h1>SupportNova</h1>
        <p>SupportNova Intelligent Commerce</p>
      </div>
      <div class="proof-badge">
        <small>Official Proof</small>
        <span>Purchase Receipt</span>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <label>Order Number</label>
        <p class="order-number">{order.order_number}</p>
      </div>
      <div class="meta-item">
        <label>Purchase Date</label>
        <p>{date_str}</p>
      </div>
      <div class="meta-item">
        <label>Payment Status</label>
        <p><span class="status-paid">{order.payment_status}</span></p>
      </div>
      <div class="meta-item">
        <label>Payment Method</label>
        <p>{order.payment_method}</p>
      </div>
      <div class="meta-item">
        <label>Billed To</label>
        <p>{cust_name} &lt;{cust_email}&gt;</p>
      </div>
      <div class="meta-item">
        <label>Shipping Destination</label>
        <p style="font-size: 13px;">{order.shipping_address or 'Standard Delivery'}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item Description</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items_rows}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${float(order.total_amount):.2f}</span>
        </div>
        <div class="total-row">
          <span>Tax & Shipping</span>
          <span>$0.00</span>
        </div>
        <div class="total-row grand">
          <span>Total Amount</span>
          <span>${float(order.total_amount):.2f}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p style="font-weight: 600; color: #1e293b; margin: 0 0 6px;">Thank you for your purchase!</p>
      <p style="margin: 0; font-size: 12px;">If you have questions or need support for this order, reference order number <strong>{order.order_number}</strong> in the SupportNova customer portal.</p>
    </div>
  </div>
</body>
</html>
"""
        headers = {}
        if download:
            headers["Content-Disposition"] = f"attachment; filename=Invoice-{order.order_number}.html"
        return HTMLResponse(content=html, headers=headers)

    return InvoiceOut(**invoice_data)
