"""FastAPI 应用入口。

启动：  python run.py            # 见 backend/run.py
或：    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, DB_PATH, engine
from .routers import folders, notes


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="noteTipTap API",
    description="本地自用 Markdown 笔记服务",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(folders.router, prefix="/api")
app.include_router(notes.router, prefix="/api")


@app.get("/api/health", tags=["meta"], summary="健康检查")
def health() -> dict[str, str]:
    return {"status": "ok", "db": str(DB_PATH)}
