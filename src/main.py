from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import get_settings
from database.models import Base  # noqa: F401 — register metadata
from database.seed import seed_reference_data
from database.session import SessionLocal, engine
from src.api.analytics import router as analytics_router
from src.api.auth import router as auth_router
from src.api.complaints import router as complaints_router
from src.api.config_routes import router as config_router
from src.api.knowledge import router as knowledge_router
from src.api.prompts import router as prompts_router
from src.api.users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_reference_data(db)
    finally:
        db.close()
    yield


settings = get_settings()
app = FastAPI(
    title="SupportNova API",
    description="Generative AI complaint intelligence with an independent Python ground-truth pipeline.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(complaints_router)
app.include_router(knowledge_router)
app.include_router(config_router)
app.include_router(analytics_router)
app.include_router(prompts_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "supportnova", "organization": settings.organization_name}
