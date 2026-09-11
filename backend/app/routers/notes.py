"""笔记 CRUD 与 Markdown 导入接口。"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..md_convert import (
    EMPTY_DOC,
    extract_plain_text,
    guess_title,
    markdown_to_tiptap,
    normalize_content,
)
from ..models import DEFAULT_TITLE, Folder, Note
from ..schemas import (
    ImportError,
    NoteCreate,
    NoteImportRequest,
    NoteImportResponse,
    NoteListItem,
    NoteRead,
    NoteUpdate,
)

router = APIRouter(prefix="/notes", tags=["notes"])

PLAIN_TEXT_LIMIT = 500


def _load_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return dict(EMPTY_DOC)
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return dict(EMPTY_DOC)
    if not isinstance(data, dict) or data.get("type") != "doc":
        return dict(EMPTY_DOC)
    return data


def _to_read(note: Note) -> NoteRead:
    return NoteRead(
        id=note.id,
        title=note.title,
        folder_id=note.folder_id,
        content=_load_json(note.content_json),
        raw_md=note.raw_md,
        plain_text=note.plain_text or "",
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _to_list_item(note: Note) -> NoteListItem:
    return NoteListItem(
        id=note.id,
        title=note.title,
        folder_id=note.folder_id,
        plain_text=(note.plain_text or "")[:PLAIN_TEXT_LIMIT],
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _require_folder(db: Session, folder_id: int | None) -> None:
    if folder_id is not None and db.get(Folder, folder_id) is None:
        raise HTTPException(status_code=400, detail="文件夹不存在")


def _apply_content(note: Note, content: dict[str, Any]) -> None:
    normalized = normalize_content(content)
    note.content_json = json.dumps(normalized, ensure_ascii=False)
    note.plain_text = extract_plain_text(normalized)


@router.get("", response_model=list[NoteListItem], summary="笔记列表")
def list_notes(
    folder_id: int | None = Query(default=None),
    unfiled: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[NoteListItem]:
    stmt = select(Note)
    if folder_id is not None:
        stmt = stmt.where(Note.folder_id == folder_id)
    elif unfiled:
        stmt = stmt.where(Note.folder_id.is_(None))
    stmt = stmt.order_by(Note.updated_at.desc(), Note.id.desc()).limit(limit).offset(offset)
    return [_to_list_item(n) for n in db.execute(stmt).scalars().all()]


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED, summary="新建笔记")
def create_note(payload: NoteCreate, db: Session = Depends(get_db)) -> NoteRead:
    _require_folder(db, payload.folder_id)
    note = Note(
        title=(payload.title or "").strip() or DEFAULT_TITLE,
        folder_id=payload.folder_id,
        content_json=json.dumps(EMPTY_DOC, ensure_ascii=False),
        plain_text="",
    )
    if payload.content is not None:
        _apply_content(note, payload.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return _to_read(note)


@router.post("/import", response_model=NoteImportResponse, summary="导入 .md 文件")
def import_notes(payload: NoteImportRequest, db: Session = Depends(get_db)) -> NoteImportResponse:
    _require_folder(db, payload.folder_id)
    created: list[NoteRead] = []
    errors: list[ImportError] = []

    for item in payload.files:
        try:
            # 每个文件一个 SAVEPOINT，单个文件解析失败不会影响到其它文件
            with db.begin_nested():
                content = markdown_to_tiptap(item.content)
                note = Note(
                    title=guess_title(item.content, item.name) or DEFAULT_TITLE,
                    folder_id=payload.folder_id,
                    content_json=json.dumps(content, ensure_ascii=False),
                    plain_text=extract_plain_text(content),
                    raw_md=item.content,
                )
                db.add(note)
                db.flush()
            created.append(_to_read(note))
        except Exception as exc:  # pragma: no cover - 单个文件失败不影响其它文件
            errors.append(ImportError(name=item.name, message=f"导入失败：{exc}"))

    db.commit()
    return NoteImportResponse(created=created, errors=errors)


@router.get("/{note_id}", response_model=NoteRead, summary="笔记详情")
def get_note(note_id: int, db: Session = Depends(get_db)) -> NoteRead:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return _to_read(note)


@router.patch("/{note_id}", response_model=NoteRead, summary="更新笔记（自动保存走这里）")
def update_note(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)) -> NoteRead:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")

    data = payload.model_dump(exclude_unset=True)

    if "title" in data:
        note.title = (data["title"] or "").strip() or DEFAULT_TITLE
    if "folder_id" in data:
        _require_folder(db, data["folder_id"])
        note.folder_id = data["folder_id"]
    if "content" in data and data["content"] is not None:
        _apply_content(note, data["content"])

    db.commit()
    db.refresh(note)
    return _to_read(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除笔记")
def delete_note(note_id: int, db: Session = Depends(get_db)) -> Response:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    db.delete(note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
