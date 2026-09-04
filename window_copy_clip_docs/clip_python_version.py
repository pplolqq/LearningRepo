#!/usr/bin/env python
"""cfclip.py - copy a single file to clipboard via CF_HDROP"""

import sys
import os
import struct

import win32clipboard
import ctypes
from ctypes import wintypes

# --- Windows API ---
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32 = ctypes.WinDLL("user32", use_last_error=True)

kernel32.GetFullPathNameW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD,
    wintypes.LPWSTR, ctypes.POINTER(wintypes.LPWSTR)
]
kernel32.GetFullPathNameW.restype = wintypes.DWORD

kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
kernel32.GlobalAlloc.restype = wintypes.HGLOBAL

kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalLock.restype = ctypes.c_void_p

kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalUnlock.restype = wintypes.BOOL

kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalFree.restype = wintypes.HGLOBAL

GMEM_MOVEABLE = 0x0002
GMEM_ZEROINIT = 0x0040


def resolve_path(path):
    """Convert input path to absolute Windows path."""
    # Git Bash /c/xxx style
    if path.startswith("/") and len(path) >= 3 and path[2] == "/":
        path = f"{path[1].upper()}:/{path[3:]}"
    
    path = os.path.expanduser(path)
    
    # Use GetFullPathNameW for proper resolution
    buf = ctypes.create_unicode_buffer(260)
    length = kernel32.GetFullPathNameW(path, 260, buf, None)
    if length == 0 or length >= 260:
        raise OSError(f"GetFullPathNameW failed for: {path}")
    
    return buf.value


def build_cf_hdrop(file_path):
    """
    Build CF_HDROP payload matching the C version exactly:
    DROPFILES (20 bytes) + UTF-16LE path + double null
    """
    # DROPFILES structure: pFiles(4) + pt.x(4) + pt.y(4) + fNC(4) + fWide(4) = 20 bytes
    pFiles = 20
    pt_x = 0
    pt_y = 0
    fNC = 0
    fWide = 1  # TRUE = UTF-16
    
    header = struct.pack("<iiiii", pFiles, pt_x, pt_y, fNC, fWide)
    
    # Path as UTF-16LE with null terminator
    path_w = file_path.encode("utf-16le")
    # Add null terminator (2 bytes of zero)
    path_w += b"\x00\x00"
    # Add second null terminator (end of list)
    path_w += b"\x00\x00"
    return header + path_w

def set_clipboard_file(file_path):
    """Write CF_HDROP to clipboard using SetClipboardData."""
    abs_path = resolve_path(file_path)
    
    # Verify file exists
    if not os.path.isfile(abs_path):
        print(f"FILE NOT FOUND: {abs_path}", file=sys.stderr)
        sys.exit(1)
    
    # Build payload
    payload = build_cf_hdrop(abs_path)
    
    # Allocate global memory
    hglobal = kernel32.GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, len(payload))
    if not hglobal:
        print("GlobalAlloc failed", file=sys.stderr)
        sys.exit(2)
    
    # Lock and copy data
    ptr = kernel32.GlobalLock(hglobal)
    if not ptr:
        kernel32.GlobalFree(hglobal)
        print("GlobalLock failed", file=sys.stderr)
        sys.exit(2)
    
    ctypes.memmove(ptr, payload, len(payload))
    kernel32.GlobalUnlock(hglobal)
    
    # Set clipboard
    win32clipboard.OpenClipboard()
    try:
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardData(win32clipboard.CF_HDROP, hglobal)
        # Note: SetClipboardData takes ownership of hglobal, don't free it
    finally:
        win32clipboard.CloseClipboard()
    
    print(f"OK: {abs_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python cfclip.py <file>", file=sys.stderr)
        sys.exit(1)
    
    set_clipboard_file(sys.argv[1])