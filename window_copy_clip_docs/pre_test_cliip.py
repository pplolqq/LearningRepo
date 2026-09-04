#!/bin/env python
import struct
import os
import sys

import win32clipboard
import ctypes
from ctypes import wintypes

# --- Windows API for proper path resolution ---
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
kernel32.GetFullPathNameW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD,
    wintypes.LPWSTR, ctypes.POINTER(wintypes.LPWSTR)
]
kernel32.GetFullPathNameW.restype = wintypes.DWORD


def to_windows_path(path):
    """Resolve to absolute Windows path using GetFullPathNameW."""
    # Git Bash /c/xxx style
    print(path)

    if path.startswith("/") and len(path) >= 3 and path[2] == "/":
        path = f"{path[1].upper()}:/{path[3:]}"

    print(path)
    path = os.path.expanduser(path)
    # Use GetFullPathNameW for native Windows path resolution
    buf = ctypes.create_unicode_buffer(260)
    length = kernel32.GetFullPathNameW(path, 260, buf, None)
    if length == 0 or length >= 260:
        # Fallback to os.path.abspath
        return os.path.abspath(path).replace("/", "\\")
    print(path)
    return buf.value


def build_cf_hdrop(file_path):
    """
    Build CF_HDROP payload:
    DROPFILES (20 bytes) + UTF-16LE path + double null terminator

    DROPFILES layout:
        DWORD pFiles;   // 4  → offset to file list = 20
        POINT pt;       // 8  → x=0, y=0
        BOOL  fNC;      // 4  → 0
        BOOL  fWide;    // 4  → 1 (UTF-16)
        ─────────────
        total = 20 bytes
    """
    # 5 fields, little-endian: pFiles, pt.x, pt.y, fNC, fWide
    header = struct.pack("<iiiii", 20, 0, 0, 0, 1)

    # File list: path as UTF-16LE + null terminator + list terminator (double null)
    path_w = file_path.encode("utf-16le")
    terminator = b"\x00\x00"

    return header + path_w + terminator + terminator


def set_clipboard_file(path):
    data = build_cf_hdrop(path)

    win32clipboard.OpenClipboard()
    try:
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardData(win32clipboard.CF_HDROP, data)
    finally:
        win32clipboard.CloseClipboard()


if __name__ == "__main__":
    if len(sys.argv) <= 1:
        print("usage: cpl.py <file>")
        sys.exit(1)

    abs_path = to_windows_path(sys.argv[-1])

    if not os.path.isfile(abs_path):
        print(f"FILE NOT FOUND: {abs_path}", file=sys.stderr)
        sys.exit(1)

    set_clipboard_file(abs_path)
    print(f"OK: {abs_path}")