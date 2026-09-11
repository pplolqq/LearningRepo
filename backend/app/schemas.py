"""Pydantic 模型（对外 API 契约，见 docs/SPEC.md §4）。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": [{"type": "paragraph"}]}


class TimestampMixin(BaseModel):
    """SQLite 不保存时区，读出来是 naive UTC，这里统一序列化成带 Z 的 ISO8601。"""

    @field_serializer("created_at", "updated_at", when_used="json", check_fields=False)
    def _serialize_dt(self, value: datetime) -> str:  # noqa: D102
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------------- folders


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: int | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("文件夹名不能为空")
        return v


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    parent_id: int | None = None
    order_index: int | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("文件夹名不能为空")
        return v


class FolderRead(TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    parent_id: int | None
    order_index: int
    created_at: datetime
    updated_at: datetime
    note_count: int = 0


class FolderNode(FolderRead):
    children: list["FolderNode"] = Field(default_factory=list)


# ----------------------------------------------------------------------------- notes


class NoteCreate(BaseModel):
    title: str | None = None
    folder_id: int | None = None
    content: dict[str, Any] | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    folder_id: int | None = None
    content: dict[str, Any] | None = None


class NoteListItem(TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    folder_id: int | None
    plain_text: str
    created_at: datetime
    updated_at: datetime


class NoteRead(TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    folder_id: int | None
    content: dict[str, Any]
    raw_md: str | None
    plain_text: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------- import


class ImportFile(BaseModel):
    name: str
    content: str


class NoteImportRequest(BaseModel):
    folder_id: int | None = None
    files: list[ImportFile] = Field(default_factory=list)


class ImportError(BaseModel):
    name: str
    message: str


class NoteImportResponse(BaseModel):
    created: list[NoteRead] = Field(default_factory=list)
    errors: list[ImportError] = Field(default_factory=list)


FolderNode.model_rebuild()
