#!/usr/bin/env python3
"""seekFile - a small local web UI on top of Everything's HTTP server.

Everything does the indexing and matching; this process only builds queries,
normalises the JSON it returns, and offers local file actions.

Query rules below are not guesses - each one was verified against
Everything 1.4.1.1032's HTTP server (see README.md for the probe results):

  * inline `regex:<pattern>` with the global regex flag OFF keeps `ext:`,
    `path:`, `folder:` and the other macros working. The global `regex=1`
    flag silently disables every macro.
  * `path=1` switches the regex to match the full path instead of the name.
  * `case=1` is honoured together with an inline `regex:`.
  * `path:` needs quoting when the path contains a space ("C:\\Program Files"
    matched 2769 rows unquoted vs 1 row bare).
  * `asc` is ignored; the real direction parameter is `ascending` (0 = desc).
  * the server only returns name/path/size/date_modified; every other column
    parameter is ignored, so the extension is derived here.
  * `path=` as a scope parameter is ignored - scoping must use `path:` syntax.
  * an invalid regex returns zero results with no error, so it is validated
    locally before the request is sent.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------

EVERYTHING_BASE = os.environ.get("SEEKFILE_EVERYTHING", "http://127.0.0.1:9020/")
HOST = "127.0.0.1"
# Keep this in step with run.sh, which also defaults to 9999.
PORT = int(os.environ.get("SEEKFILE_PORT", "9999"))
TIMEOUT = 30
HARD_LIMIT = 2000

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"

# Windows FILETIME counts 100ns ticks from 1601-01-01.
FILETIME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)

# --------------------------------------------------------------------------
# categories - expanded into Everything macros, never applied in Python
# --------------------------------------------------------------------------

CATEGORIES = [
    {"id": "all", "label": "全部", "expr": None},
    {"id": "folder", "label": "文件夹", "expr": "folder:"},
    {"id": "image", "label": "图片",
     "expr": "ext:jpg;jpeg;jpe;png;gif;bmp;webp;svg;ico;tif;tiff;heic;heif;avif;psd;raw;cr2;nef;dng"},
    {"id": "doc", "label": "文档",
     "expr": "ext:doc;docx;docm;dot;dotx;pdf;txt;md;markdown;rtf;odt;ods;odp;"
             "xls;xlsx;xlsm;csv;ppt;pptx;pptm;epub;mobi;tex;wps;et;dps"},
    {"id": "video", "label": "视频",
     "expr": "ext:mp4;mkv;avi;mov;wmv;flv;webm;m4v;mpg;mpeg;ts;m2ts;rmvb;3gp;vob"},
    {"id": "audio", "label": "音频",
     "expr": "ext:mp3;flac;wav;aac;m4a;ogg;oga;opus;wma;ape;aiff;mid;midi"},
    {"id": "archive", "label": "压缩包",
     "expr": "ext:zip;rar;7z;tar;gz;tgz;bz2;xz;zst;cab;iso;jar;war;apk;dmg"},
    {"id": "code", "label": "代码",
     "expr": "ext:java;kt;kts;scala;groovy;js;mjs;cjs;ts;tsx;jsx;vue;svelte;py;pyw;go;rs;"
             "c;h;cc;cpp;cxx;hpp;cs;php;rb;swift;m;mm;lua;pl;r;sql;sh;bash;zsh;ps1;psm1;bat;cmd;"
             "xml;html;htm;css;scss;less;json;json5;yaml;yml;toml;ini;conf;properties;env;gradle;"
             "dockerfile;makefile;cmake;proto;graphql;md"},
    {"id": "exe", "label": "程序",
     "expr": "ext:exe;msi;msix;appx;dll;sys;com;scr;lnk;jar;apk;deb;rpm"},
]
CATEGORY_BY_ID = {c["id"]: c for c in CATEGORIES}

SORTS = {
    "name": "名称",
    "path": "路径",
    "size": "大小",
    "extension": "类型",
    "date_modified": "修改时间",
    "date_created": "创建时间",
    "date_accessed": "访问时间",
    "run_count": "打开次数",
}

# Extensions that execute code when opened - the UI asks before launching these.
RISKY_EXTS = {"exe", "msi", "msix", "appx", "bat", "cmd", "com", "scr",
              "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "reg", "lnk"}

# --------------------------------------------------------------------------
# query building
# --------------------------------------------------------------------------

_WS = re.compile(r"\s")


def quote_path(path: str) -> str:
    """Quote a path for Everything's `path:` macro.

    Trailing separators are dropped first: inside quotes a trailing backslash
    would escape the closing quote and silently break the whole query.
    """
    cleaned = path.strip().rstrip("\\/") or path.strip()
    cleaned = cleaned.replace('"', "")
    if _WS.search(cleaned):
        return '"%s"' % cleaned
    return cleaned


def build_search(query: str, category: str, scope: str,
                 regex: bool, match_path: bool) -> tuple[str, bool]:
    """Assemble the Everything search string.

    Returns (search_string, path_match_flag).
    """
    parts = []

    if scope:
        parts.append("path:%s" % quote_path(scope))

    cat = CATEGORY_BY_ID.get(category)
    if cat and cat["expr"]:
        parts.append(cat["expr"])

    if query:
        if regex:
            pattern = query
            # `regex:` consumes a single term, so whitespace needs quoting.
            if _WS.search(pattern):
                pattern = '"%s"' % pattern.replace('"', '\\"')
            parts.append("regex:%s" % pattern)
        else:
            parts.append(query)

    return " ".join(parts), bool(regex and match_path)


def validate_regex(pattern: str) -> str | None:
    """Everything reports nothing for a bad pattern, so check it here."""
    try:
        re.compile(pattern)
    except re.error as exc:
        return str(exc)
    return None

# --------------------------------------------------------------------------
# talking to Everything
# --------------------------------------------------------------------------


class EverythingError(RuntimeError):
    pass


def everything_search(search: str, *, path_match: bool, case: bool, sort: str,
                      descending: bool, offset: int, limit: int) -> dict:
    params = {
        "search": search,
        "json": 1,
        "count": limit,
        "offset": offset,
        "path_column": 1,
        "size_column": 1,
        "date_modified_column": 1,
        # `ascending` is the parameter that actually works; `asc` is ignored.
        "ascending": 0 if descending else 1,
    }
    if sort in SORTS:
        params["sort"] = sort
    if case:
        params["case"] = 1
    if path_match:
        # Makes the inline regex match the full path rather than the name.
        params["path"] = 1

    url = EVERYTHING_BASE + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as resp:
            payload = resp.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        raise EverythingError(
            "无法连接 Everything 的 HTTP 服务 (%s)：%s" % (EVERYTHING_BASE, exc)
        ) from exc
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise EverythingError("Everything 返回了非 JSON 内容：%s" % payload[:200]) from exc


def filetime_to_iso(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        ticks = int(raw)
    except ValueError:
        return None
    if ticks <= 0:
        return None
    try:
        stamp = FILETIME_EPOCH + timedelta(microseconds=ticks / 10)
    except (OverflowError, ValueError):
        return None
    # Everything reports local wall-clock times, so drop the tz marker.
    return stamp.replace(tzinfo=None).isoformat(timespec="seconds")


def extension_of(name: str) -> str:
    idx = name.rfind(".")
    if idx <= 0 or idx == len(name) - 1:
        return ""
    return name[idx + 1:].lower()


def normalise(row: dict) -> dict:
    name = row.get("name") or ""
    parent = row.get("path") or ""
    is_folder = (row.get("type") or "").lower() == "folder"
    full = os.path.join(parent, name) if parent else name
    size = row.get("size") or ""
    try:
        size = int(size)
    except ValueError:
        size = None
    return {
        "name": name,
        "dir": parent,
        "full_path": full,
        "is_folder": is_folder,
        "ext": "" if is_folder else extension_of(name),
        "size": size,
        "mtime": filetime_to_iso(row.get("date_modified")),
    }

# --------------------------------------------------------------------------
# local actions
# --------------------------------------------------------------------------


def open_path(path: str) -> None:
    os.startfile(path)  # noqa: S606 - intentional, local single-user tool


def reveal_path(path: str) -> None:
    """Open the containing folder in Explorer with the item highlighted.

    Files and folders behave identically: the parent folder opens and the item
    is selected. This is the Windows "open file location" behaviour, and it
    keeps the primary action the same no matter what the hit is.
    """
    subprocess.Popen(["explorer.exe", "/select,%s" % path])


def available_scopes() -> list[dict]:
    home = Path.home()
    candidates = [
        ("桌面", home / "Desktop"),
        ("下载", home / "Downloads"),
        ("文档", home / "Documents"),
        ("图片", home / "Pictures"),
        ("视频", home / "Videos"),
        ("音乐", home / "Music"),
    ]
    scopes = [{"label": s, "path": str(p)} for s, p in candidates if p.is_dir()]
    for letter in "CDEFGH":
        drive = f"{letter}:\\"
        if os.path.exists(drive):
            scopes.append({"label": f"{letter}: 盘", "path": drive})
    return scopes

# --------------------------------------------------------------------------
# HTTP layer
# --------------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    server_version = "seekFile"
    protocol_version = "HTTP/1.1"

    # ---- helpers ---------------------------------------------------------

    def log_message(self, fmt, *args):  # keep the console readable
        if os.environ.get("SEEKFILE_VERBOSE"):
            super().log_message(fmt, *args)

    def _local_request(self) -> bool:
        """Reject requests that did not come from this machine's own UI.

        Guards against a random web page poking the API (and against DNS
        rebinding, where the Host header carries the attacker's name).
        """
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        if host not in {"127.0.0.1", "localhost", "[::1]", "::1"}:
            return False
        origin = self.headers.get("Origin")
        if origin:
            allowed = {f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"}
            if origin not in allowed:
                return False
        return True

    def _send(self, status: int, body: bytes, ctype: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    # ---- routing ---------------------------------------------------------

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if route in ("/", "/index.html"):
            return self._serve_static("index.html", "text/html; charset=utf-8")
        if not self._local_request():
            return self._json({"error": "forbidden"}, 403)
        if route == "/api/search":
            return self._api_search(params)
        if route == "/api/health":
            return self._api_health()
        if route == "/api/scopes":
            return self._json({"scopes": available_scopes()})
        return self._json({"error": "not found"}, 404)

    def do_POST(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if not self._local_request():
            return self._json({"error": "forbidden"}, 403)
        body = self._read_json_body()
        if parsed.path == "/api/open":
            return self._api_action(body, reveal=False)
        if parsed.path == "/api/reveal":
            return self._api_action(body, reveal=True)
        return self._json({"error": "not found"}, 404)

    # ---- static ----------------------------------------------------------

    def _serve_static(self, name: str, ctype: str) -> None:
        target = WEB_DIR / name
        if not target.is_file():
            return self._send(404, b"missing %s" % name.encode(), "text/plain")
        self._send(200, target.read_bytes(), ctype)

    # ---- api -------------------------------------------------------------

    def _api_health(self) -> None:
        started = time.perf_counter()
        try:
            everything_search("", path_match=False, case=False, sort="name",
                              descending=False, offset=0, limit=1)
        except EverythingError as exc:
            return self._json({"ok": False, "error": str(exc)})
        return self._json({
            "ok": True,
            "latency_ms": round((time.perf_counter() - started) * 1000, 1),
            "endpoint": EVERYTHING_BASE,
        })

    def _api_search(self, params) -> None:
        def first(key, default=""):
            values = params.get(key)
            return values[0] if values else default

        query = first("q")
        category = first("category", "all")
        scope = first("scope")
        regex = first("regex") == "1"
        match_path = first("match_path") == "1"
        case = first("case") == "1"
        sort = first("sort", "date_modified")
        descending = first("desc", "1") == "1"

        try:
            offset = max(0, int(first("offset", "0")))
        except ValueError:
            offset = 0
        try:
            limit = int(first("limit", "200"))
        except ValueError:
            limit = 200
        limit = max(1, min(limit, HARD_LIMIT))

        if regex and query:
            problem = validate_regex(query)
            if problem:
                return self._json({
                    "error": "正则表达式无效：%s" % problem,
                    "results": [], "total": 0,
                }, 400)

        search, path_match = build_search(query, category, scope,
                                          regex, match_path)

        started = time.perf_counter()
        try:
            data = everything_search(search, path_match=path_match, case=case,
                                     sort=sort, descending=descending,
                                     offset=offset, limit=limit)
        except EverythingError as exc:
            return self._json({"error": str(exc), "results": [], "total": 0}, 502)

        rows = [normalise(r) for r in data.get("results", [])]
        return self._json({
            "results": rows,
            "total": int(data.get("totalResults") or 0),
            "returned": len(rows),
            "offset": offset,
            "limit": limit,
            "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
            "everything_query": search,
            "path_match": path_match,
        })

    def _api_action(self, body: dict, *, reveal: bool) -> None:
        path = (body or {}).get("path") or ""
        if not path:
            return self._json({"ok": False, "error": "缺少 path 参数"}, 400)
        if not os.path.exists(path):
            return self._json({"ok": False, "error": "路径不存在：%s" % path}, 404)
        try:
            if reveal:
                reveal_path(path)
            else:
                open_path(path)
        except OSError as exc:
            return self._json({"ok": False, "error": str(exc)}, 500)
        return self._json({"ok": True})


def main() -> int:
    if not (WEB_DIR / "index.html").is_file():
        print("找不到界面文件：%s" % (WEB_DIR / "index.html"), flush=True)
        return 1
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print("seekFile 已启动")
    print("  界面   : %s" % url)
    print("  后端   : %s" % EVERYTHING_BASE)
    print("  停止   : Ctrl+C")
    print(flush=True)

    if not os.environ.get("SEEKFILE_NO_BROWSER"):
        try:
            webbrowser.open(url)
        except Exception:  # browser is a convenience, never a hard requirement
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
