"""文件夹（多级树）相关接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Folder, Note
from ..schemas import FolderCreate, FolderNode, FolderRead, FolderUpdate

router = APIRouter(prefix="/folders", tags=["folders"])


def _note_counts(db: Session) -> dict[int, int]:
    rows = db.execute(select(Note.folder_id, func.count(Note.id)).group_by(Note.folder_id)).all()
    return {int(fid): int(cnt) for fid, cnt in rows if fid is not None}


def _load_all(db: Session) -> list[Folder]:
    return list(db.execute(select(Folder).order_by(Folder.order_index, Folder.id)).scalars().all())


def _descendant_ids(folders: list[Folder], root_id: int) -> set[int]:
    children: dict[int | None, list[int]] = {}
    for folder in folders:
        children.setdefault(folder.parent_id, []).append(folder.id)
    found: set[int] = set()
    stack = [root_id]
    while stack:
        current = stack.pop()
        for child in children.get(current, []):
            if child not in found:
                found.add(child)
                stack.append(child)
    return found


@router.get("", response_model=list[FolderNode], summary="获取完整文件夹树")
def list_folders(db: Session = Depends(get_db)) -> list[FolderNode]:
    folders = _load_all(db)
    counts = _note_counts(db)
    nodes: dict[int, FolderNode] = {}
    for folder in folders:
        node = FolderNode(**FolderRead.model_validate(folder).model_dump(), children=[])
        node.note_count = counts.get(folder.id, 0)
        nodes[folder.id] = node

    roots: list[FolderNode] = []
    for folder in folders:
        node = nodes[folder.id]
        parent = nodes.get(folder.parent_id) if folder.parent_id else None
        if parent is not None:
            parent.children.append(node)
        else:
            roots.append(node)
    return roots


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED, summary="新建文件夹")
def create_folder(payload: FolderCreate, db: Session = Depends(get_db)) -> FolderRead:
    if payload.parent_id is not None and db.get(Folder, payload.parent_id) is None:
        raise HTTPException(status_code=400, detail="父文件夹不存在")
    siblings = db.execute(select(func.max(Folder.order_index)).where(Folder.parent_id == payload.parent_id)).scalar()
    folder = Folder(
        name=payload.name,
        parent_id=payload.parent_id,
        order_index=(siblings or 0) + 1,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return FolderRead.model_validate(folder)


@router.patch("/{folder_id}", response_model=FolderRead, summary="重命名 / 移动文件夹")
def update_folder(folder_id: int, payload: FolderUpdate, db: Session = Depends(get_db)) -> FolderRead:
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="文件夹不存在")

    data = payload.model_dump(exclude_unset=True)

    if "parent_id" in data:
        new_parent = data["parent_id"]
        if new_parent is not None:
            if new_parent == folder_id:
                raise HTTPException(status_code=400, detail="不能把文件夹移动到自己下面")
            if db.get(Folder, new_parent) is None:
                raise HTTPException(status_code=400, detail="父文件夹不存在")
            if new_parent in _descendant_ids(_load_all(db), folder_id):
                raise HTTPException(status_code=400, detail="不能把文件夹移动到自己的子文件夹下")
        folder.parent_id = new_parent

    if data.get("name") is not None:
        folder.name = data["name"]
    if data.get("order_index") is not None:
        folder.order_index = data["order_index"]

    db.commit()
    db.refresh(folder)
    result = FolderRead.model_validate(folder)
    result.note_count = _note_counts(db).get(folder.id, 0)
    return result


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除文件夹（级联删除子文件夹与笔记）")
def delete_folder(folder_id: int, db: Session = Depends(get_db)) -> Response:
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="文件夹不存在")
    db.delete(folder)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
