import logging
from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from config.settings import get_settings
from database.models import Base  # noqa: F401 — register metadata
from database.migrations import upgrade as upgrade_schema
from database.seed import seed_reference_data
from src.services.analysis import backfill_attachments, backfill_classification
from database.session import SessionLocal, engine
from genai_pipeline.client import provider_chain
from src.api.analytics import router as analytics_router
from src.api.assistant import router as assistant_router
from src.api.evaluation import router as evaluation_router
from src.api.notifications import router as notifications_router
from src.api.auth import router as auth_router
from src.api.complaints import router as complaints_router
from src.api.config_routes import router as config_router
from src.api.knowledge import router as knowledge_router
from src.api.prompts import router as prompts_router
from src.api.users import router as users_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("supportnova")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env.lower() == "production" and settings.secret_key in {"dev-only-change-me", "change-this-to-a-long-random-string", "", "change-me"}:
        # A published default key would let anyone mint an administrator token.
        raise RuntimeError("Set SECRET_KEY before running with APP_ENV=production.")
    Base.metadata.create_all(bind=engine)
    upgrade_schema(engine)
    db = SessionLocal()
    try:
        seed_reference_data(db)
        backfill_classification(db)
        backfill_attachments(db)
    finally:
        db.close()
    yield


settings = get_settings()
app = FastAPI(
    title="SupportNova API",
    description="Generative AI complaint intelligence with an independent Python ground-truth pipeline.",
    version="1.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "Content-Disposition"],
)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(complaints_router)
app.include_router(knowledge_router)
app.include_router(config_router)
app.include_router(analytics_router)
app.include_router(prompts_router)
app.include_router(assistant_router)
app.include_router(evaluation_router)
app.include_router(notifications_router)


@app.exception_handler(OperationalError)
async def database_unavailable(_: Request, exc: OperationalError):
    logger.error("Database unavailable: %s", exc.orig)
    return JSONResponse(status_code=503, content={"detail": "Database is unavailable. Try again shortly."})


@app.exception_handler(SQLAlchemyError)
async def database_error(_: Request, exc: SQLAlchemyError):
    logger.exception("Database error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "A database error occurred; the change was not saved."})


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception):
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Unexpected server error. It has been logged."})


@app.get("/health")
def health():
    database = "ok"
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
    except SQLAlchemyError:
        database = "unavailable"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "service": "supportnova",
        "organization": settings.organization_name,
        "database": database,
        "genai_configured": bool(provider_chain(settings)),
    }


# ---- single-service deployment: serve the built React app from the same origin ----
_dist = Path(settings.frontend_dist) if settings.frontend_dist else None
if _dist and (_dist / "index.html").is_file():
    if (_dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (_dist / full_path).resolve()
        if full_path and candidate.is_file() and _dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
