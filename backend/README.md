# noteTipTap 后端

FastAPI + SQLAlchemy 2 + SQLite。接口契约见 [`../docs/SPEC.md`](../docs/SPEC.md)。

## 首次准备

```bash
cd backend
./setup.sh          # 建 .venv + 装依赖（本机缺 ensurepip，脚本会自动引导 pip）
```

## 启动

```bash
cd backend
./.venv/bin/python run.py            # http://127.0.0.1:8000
./.venv/bin/python run.py --port 9000 --no-reload
```

- API 文档：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/api/health>

## 测试

```bash
cd backend
./.venv/bin/python tests/test_md_convert.py   # markdown → Tiptap JSON 转换（318 项断言）
./tests/smoke_api.sh                          # 接口冒烟（需先启动服务）
```

## 目录

```
backend/
├── app/
│   ├── main.py          FastAPI 入口 + CORS
│   ├── database.py      SQLite 连接（WAL + 外键级联开关）
│   ├── models.py        Folder / Note
│   ├── schemas.py       Pydantic 契约
│   ├── md_convert.py    markdown → Tiptap JSON（核心）
│   └── routers/         folders.py / notes.py
├── tests/               转换器单测 + 接口冒烟
├── data/notes.db        SQLite 数据文件（备份直接拷这个）
└── run.py               启动脚本
```

## 数据与备份

- 全部数据在 `backend/data/notes.db`（WAL 模式下还会有 `-wal` / `-shm` 两个伴随文件）。
- 备份：停服后拷贝整个 `data/` 目录即可。
- `Note.raw_md` 保存导入文件的 markdown 原文，即使解析降级也不会丢内容。
