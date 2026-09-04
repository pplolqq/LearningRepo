#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <wchar.h>

/* MinGW's shellapi.h does not export DROPFILES; define it ourselves. */
typedef struct _DROPFILES {
    DWORD pFiles;  /* offset of the file list from the start of this struct */
    POINT pt;      /* drop point (client coordinates) */
    BOOL  fNC;     /* TRUE if drop point is in the non-client area */
    BOOL  fWide;   /* TRUE if the file list uses wide characters */
} DROPFILES;

int wmain(int argc, wchar_t *argv[])
{
    if (argc < 2) {
        fwprintf(stderr, L"Usage: cfclip.exe <file>\n");
        return 1;
    }

    const wchar_t *input = argv[1];

    /* Resolve to a full path (relative paths are based on cwd). */
    wchar_t full_path[MAX_PATH];
    DWORD len = GetFullPathNameW(input, MAX_PATH, full_path, NULL);
    if (len == 0) {
        fwprintf(stderr, L"cfclip: failed to resolve path: %ls\n", input);
        return 1;
    }
    if (len >= MAX_PATH) {
        fwprintf(stderr, L"cfclip: path too long\n");
        return 1;
    }

    /* Make sure the file exists. */
    DWORD attrs = GetFileAttributesW(full_path);
    if (attrs == INVALID_FILE_ATTRIBUTES || (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
        fwprintf(stderr, L"cfclip: file not found: %ls\n", full_path);
        return 1;
    }

    /* Build CF_HDROP payload: DROPFILES header + double-NUL-terminated
     * wide-char file list. */
    size_t path_bytes = (wcslen(full_path) + 1) * sizeof(wchar_t); /* include NUL */
    size_t total_bytes = sizeof(DROPFILES) + path_bytes + sizeof(wchar_t); /* final NUL */

    HGLOBAL hGlobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_bytes);
    if (hGlobal == NULL) {
        fwprintf(stderr, L"cfclip: GlobalAlloc failed\n");
        return 1;
    }

    DROPFILES *drop = (DROPFILES *)GlobalLock(hGlobal);
    if (drop == NULL) {
        GlobalFree(hGlobal);
        fwprintf(stderr, L"cfclip: GlobalLock failed\n");
        return 1;
    }

    drop->pFiles = sizeof(DROPFILES);
    drop->pt.x = 0;
    drop->pt.y = 0;
    drop->fNC = FALSE;
    drop->fWide = TRUE;

    wchar_t *file_list = (wchar_t *)((BYTE *)drop + sizeof(DROPFILES));
    memcpy(file_list, full_path, path_bytes);
    file_list[wcslen(full_path) + 1] = L'\0'; /* second NUL terminates the list */

    GlobalUnlock(hGlobal);

    /* Put it on the clipboard. */
    if (!OpenClipboard(NULL)) {
        GlobalFree(hGlobal);
        fwprintf(stderr, L"cfclip: OpenClipboard failed\n");
        return 1;
    }

    if (!EmptyClipboard()) {
        CloseClipboard();
        GlobalFree(hGlobal);
        fwprintf(stderr, L"cfclip: EmptyClipboard failed\n");
        return 1;
    }

    if (SetClipboardData(CF_HDROP, hGlobal) == NULL) {
        CloseClipboard();
        GlobalFree(hGlobal);
        fwprintf(stderr, L"cfclip: SetClipboardData failed\n");
        return 1;
    }

    CloseClipboard();

    fwprintf(stdout, L"Copied to clipboard: %ls\n", full_path);
    return 0;
}
