from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.models import Product
from database.session import get_db
from src.api.schemas import ProductOut

router = APIRouter(prefix="/api/v1/products", tags=["products"])


def _serialize_product(p: Product) -> dict[str, Any]:
    return {
        "id": p.id,
        "_id": str(p.id),
        "productNumber": p.product_number,
        "product_number": p.product_number,
        "name": p.name,
        "title": p.title,
        "description": p.description,
        "price": float(p.price),
        "category": p.category,
        "image": p.image,
        "specs": p.specs or {},
        "is_active": p.is_active,
    }


@router.get("", response_model=list[ProductOut])
@router.get("/", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    products = db.query(Product).filter(Product.is_active.is_(True)).order_by(Product.id.asc()).all()
    return [_serialize_product(p) for p in products]


@router.get("/{id_or_number}", response_model=ProductOut)
def get_product(id_or_number: str, db: Session = Depends(get_db)):
    if id_or_number.isdigit():
        p = db.query(Product).filter(Product.id == int(id_or_number)).first()
    else:
        p = db.query(Product).filter(Product.product_number == id_or_number.strip()).first()

    if not p:
        raise HTTPException(status_code=404, detail=f"Product '{id_or_number}' not found")
    return _serialize_product(p)
