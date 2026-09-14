"""End-to-end checks against the running seekFile server (port 9021)."""
import http.client
import json
import os
import urllib.parse

HOST = "127.0.0.1"
# Matches run.sh's default port; override with SEEKFILE_PORT when testing.
PORT = int(os.environ.get("SEEKFILE_PORT", "9999"))
passed = failed = 0


def get(path, headers=None):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=40)
    conn.request("GET", path, headers=headers or {})
    r = conn.getresponse()
    body = r.read().decode("utf-8", "replace")
    conn.close()
    try:
        return r.status, json.loads(body)
    except json.JSONDecodeError:
        return r.status, body


def api(**params):
    return get("/api/search?" + urllib.parse.urlencode(params))


def check(label, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {label}  {detail}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


print("=" * 86)
print("1. plain text search")
s, d = api(q="readme", limit=5, sort="name", desc=0)
check("returns results", s == 200 and len(d.get("results", [])) > 0,
      f"total={d.get('total')}")
check("row shape complete",
      all({"name", "dir", "full_path", "ext", "size", "mtime", "is_folder"} <= set(r)
          for r in d["results"]))
check("mtime converted to ISO", d["results"][0]["mtime"] is None
      or d["results"][0]["mtime"][:2] in ("19", "20"),
      f"mtime={d['results'][0]['mtime']}")
check("full_path joined correctly",
      all(r["full_path"].endswith(r["name"]) for r in d["results"]))

print()
print("=" * 86)
print("2. regex on file name")
s, d = api(q=r"^readme.*\.md$", regex=1, limit=5)
check("regex matched", s == 200 and d.get("total", 0) > 0, f"total={d.get('total')}")
check("every hit really matches",
      all(r["name"].lower().startswith("readme") and r["name"].lower().endswith(".md")
          for r in d["results"]))
check("query echoed", d.get("everything_query", "").startswith("regex:"),
      d.get("everything_query"))

print()
print("=" * 86)
print("3. regex on full path (match_path)")
s, d = api(q=r"^c:.*\\Desktop\\.*\.md$", regex=1, match_path=1, limit=5)
check("path regex matched", s == 200 and d.get("total", 0) > 0, f"total={d.get('total')}")
check("all hits live under Desktop",
      all("\\desktop\\" in r["full_path"].lower() for r in d["results"]),
      d["results"][0]["full_path"][:70] if d.get("results") else "")

print()
print("=" * 86)
print("4. categories")
for cat in ("image", "folder", "archive", "code"):
    s, d = api(category=cat, limit=5)
    ok = s == 200 and d.get("total", 0) > 0
    if ok and cat == "folder":
        ok = all(r["is_folder"] for r in d["results"])
    if ok and cat == "archive":
        allowed = {"zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst",
                   "cab", "iso", "jar", "war", "apk", "dmg"}
        ok = all(r["ext"] in allowed for r in d["results"])
        if not ok:
            first = sorted({r["ext"] for r in d["results"]} - allowed)
            print(f"        unexpected extensions: {first}")
    first = d["results"][0]["name"][:40] if d.get("results") else "-"
    check(f"category={cat}", ok, f"total={d.get('total')} first={first}")

print()
print("=" * 86)
print("5. category + regex + scope combined")
s, d = api(q=r"\.png$", regex=1, category="image",
            scope=r"C:\Users\zrj21\Pictures", limit=5)
check("combined query works", s == 200 and d.get("total", 0) > 0, f"total={d.get('total')}")
check("all under scope", all("\\pictures\\" in r["full_path"].lower() for r in d["results"]),
      d.get("everything_query"))
check("query has all three parts",
      "ext:" in d.get("everything_query", "") and "regex:" in d.get("everything_query", "")
      and "path:" in d.get("everything_query", ""), d.get("everything_query"))

print()
print("=" * 86)
print("6. scope with a space in the path")
s, d = api(q="md", scope=r"C:\Program Files", limit=3)
check("space path scoped", s == 200 and d.get("total", 0) > 0, f"total={d.get('total')}")
check("quoted in query", '"' in d.get("everything_query", ""), d.get("everything_query"))

print()
print("=" * 86)
print("6b. scope variants (drive root, trailing separator, deep path)")
for scope in ["C:\\", "C:\\Users", "C:\\Users\\zrj21\\Desktop", "C:\\Program Files"]:
    s, d = api(q="md", scope=scope, limit=3)
    ok = s == 200 and d.get("total", 0) > 0
    detail = f"total={d.get('total')} query={d.get('everything_query')}"
    if ok:
        prefix = scope.rstrip("\\").lower()
        ok = all(r["full_path"].lower().startswith(prefix) for r in d["results"])
        detail += " | all under scope" if ok else f" | LEAK {d['results'][0]['full_path']}"
    check(f"scope={scope!r}", ok, detail)

print()
print("=" * 86)
print("7. sorting direction really changes order")
s, up = api(q="ext:iso", sort="size", desc=0, limit=5)
s, down = api(q="ext:iso", sort="size", desc=1, limit=5)
su = [r["size"] for r in up["results"] if r["size"]]
sd = [r["size"] for r in down["results"] if r["size"]]
check("ascending is ascending", all(su[i] <= su[i + 1] for i in range(len(su) - 1)), str(su))
check("descending is descending", all(sd[i] >= sd[i + 1] for i in range(len(sd) - 1)), str(sd))

print()
print("=" * 86)
print("8. paging")
s, a = api(q="a", limit=4, offset=0, sort="name", desc=0)
s, b = api(q="a", limit=4, offset=0, sort="name", desc=0)
s, c = api(q="a", limit=4, offset=4, sort="name", desc=0)


def names(d):
    return [r["full_path"] for r in d["results"]]


check("same params are stable", names(a) == names(b))
check("offset advances", names(a) != names(c),
      f"{names(a)[0][-24:]} vs {names(c)[0][-24:]}")

print()
print("=" * 86)
print("9. bad regex is rejected with a message (Everything would return 0 silently)")
s, d = api(q="[unclosed", regex=1)
check("status 400", s == 400, f"status={s}")
check("has friendly error", "正则" in str(d.get("error", "")), str(d.get("error"))[:60])

print()
print("=" * 86)
print("10. security guards")
s, d = get("/api/search?q=a", headers={"Host": "evil.example.com"})
check("foreign Host rejected", s == 403, f"status={s}")
s, d = get("/api/search?q=a", headers={"Origin": "https://evil.example.com",
                                       "Host": f"127.0.0.1:{PORT}"})
check("foreign Origin rejected", s == 403, f"status={s}")
s, d = get("/api/search?q=a", headers={"Origin": f"http://127.0.0.1:{PORT}",
                                       "Host": f"127.0.0.1:{PORT}"})
check("own Origin accepted", s == 200, f"status={s}")
s, d = get("/api/search?q=a", headers={"Origin": "http://127.0.0.1:9021",
                                       "Host": f"127.0.0.1:{PORT}"})
check("origin from another port rejected", s == 403, f"status={s}")
s, d = get("/../server.py")
check("path traversal not served", s in (403, 404), f"status={s}")

print()
print("=" * 86)
print("11. action endpoint validates the path")
conn = http.client.HTTPConnection(HOST, PORT, timeout=20)
conn.request("POST", "/api/open",
             json.dumps({"path": r"C:\definitely\not\here.txt"}),
             {"Content-Type": "application/json"})
r = conn.getresponse()
check("missing path -> 404", r.status == 404, f"status={r.status}")
r.read()
conn.close()

print()
print("=" * 86)
print("12. reveal_path always uses explorer /select (unit test, no server needed)")
import run_seek_file as seekfile  # noqa: E402

launched = []


class _FakePopen:
    def __init__(self, args, *a, **kw):
        launched.append(args)


_real_popen = seekfile.subprocess.Popen
seekfile.subprocess.Popen = _FakePopen
try:
    seekfile.reveal_path("C:\\Users\\zrj21\\Desktop\\note.txt")
    seekfile.reveal_path("C:\\Users\\zrj21\\Desktop\\some_folder")
finally:
    seekfile.subprocess.Popen = _real_popen

check("file -> /select", launched[0] == ["explorer.exe", "/select,C:\\Users\\zrj21\\Desktop\\note.txt"],
      str(launched[0]))
check("folder -> /select (same behaviour)", launched[1] == ["explorer.exe", "/select,C:\\Users\\zrj21\\Desktop\\some_folder"],
      str(launched[1]))
check("no bare folder open", all(a[1].startswith("/select,") for a in launched))

print()
print("=" * 86)
print(f"RESULT: {passed} passed, {failed} failed")
