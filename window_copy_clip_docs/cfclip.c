#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <wchar.h>
#include <stdlib.h>

/* MinGW's shellapi.h does not export DROPFILES; define it ourselves. */
typedef struct _DROPFILES {
    DWORD pFiles;  /* offset of the file list from the start of this struct */
    POINT pt;      /* drop point (client coordinates) */
    BOOL  fNC;     /* TRUE if drop point is in the non-client area */
    BOOL  fWide;   /* TRUE if the file list uses wide characters */
} DROPFILES;

/* Free a NULL-terminated array of resolved path strings. */
static void free_paths(wchar_t **paths, int count)
{
    if (paths == NULL)
        return;
    for (int i = 0; i < count; i++)
        free(paths[i]);
    free(paths);
}

int wmain(int argc, wchar_t *argv[])
{
    if (argc < 2) {
        fwprintf(stderr, L"Usage: cfclip.exe <file> [file...]\n");
        return 1;
    }

    int nfiles = argc - 1;

    /* Resolve and validate every path BEFORE touching the clipboard, so a bad
     * argument never leaves a half-filled file list behind. */
    wchar_t **paths = (wchar_t **)calloc((size_t)nfiles, sizeof(wchar_t *));
    if (paths == NULL) {
        fwprintf(stderr, L"cfclip: out of memory\n");
        return 1;
    }

    size_t list_chars = 1; /* characters in the list, incl. terminators + final NUL */
    int resolved = 0;

    for (int i = 0; i < nfiles; i++) {
        const wchar_t *input = argv[i + 1];

        wchar_t full_path[MAX_PATH];
        DWORD len = GetFullPathNameW(input, MAX_PATH, full_path, NULL);
        if (len == 0) {
            fwprintf(stderr, L"cfclip: failed to resolve path: %ls\n", input);
            free_paths(paths, resolved);
            return 1;
        }
        if (len >= MAX_PATH) {
            fwprintf(stderr, L"cfclip: path too long: %ls\n", input);
            free_paths(paths, resolved);
            return 1;
        }

        DWORD attrs = GetFileAttributesW(full_path);
        if (attrs == INVALID_FILE_ATTRIBUTES) {
            fwprintf(stderr, L"cfclip: file not found: %ls\n", full_path);
            free_paths(paths, resolved);
            return 1;
        }
        if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
            fwprintf(stderr, L"cfclip: is a directory: %ls\n", full_path);
            free_paths(paths, resolved);
            return 1;
        }

        size_t n = wcslen(full_path) + 1; /* include the string's NUL */
        paths[i] = (wchar_t *)malloc(n * sizeof(wchar_t));
        if (paths[i] == NULL) {
            fwprintf(stderr, L"cfclip: out of memory\n");
            free_paths(paths, resolved);
            return 1;
        }
        memcpy(paths[i], full_path, n * sizeof(wchar_t));
        resolved++;
        list_chars += n;
    }

    /* Build CF_HDROP payload: DROPFILES header + NUL-separated wide-char file
     * list + one extra NUL to terminate the whole list. */
    size_t total_bytes = sizeof(DROPFILES) + list_chars * sizeof(wchar_t);

    HGLOBAL hGlobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_bytes);
    if (hGlobal == NULL) {
        free_paths(paths, resolved);
        fwprintf(stderr, L"cfclip: GlobalAlloc failed\n");
        return 1;
    }

    DROPFILES *drop = (DROPFILES *)GlobalLock(hGlobal);
    if (drop == NULL) {
        GlobalFree(hGlobal);
        free_paths(paths, resolved);
        fwprintf(stderr, L"cfclip: GlobalLock failed\n");
        return 1;
    }

    drop->pFiles = sizeof(DROPFILES);
    drop->pt.x = 0;
    drop->pt.y = 0;
    drop->fNC = FALSE;
    drop->fWide = TRUE;

    wchar_t *file_list = (wchar_t *)((BYTE *)drop + sizeof(DROPFILES));
    wchar_t *p = file_list;
    for (int i = 0; i < resolved; i++) {
        size_t n = wcslen(paths[i]) + 1;
        memcpy(p, paths[i], n * sizeof(wchar_t)); /* copies the string's NUL too */
        p += n;
    }
    *p = L'\0'; /* double NUL: this empty string ends the file list */

    GlobalUnlock(hGlobal);
    free_paths(paths, resolved); /* strings are copied into the payload now */

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

    for (int i = 0; i < nfiles; i++)
        fwprintf(stdout, L"Copied to clipboard: %ls\n", argv[i + 1]);
    fwprintf(stdout, L"Total: %d file(s)\n", nfiles);
    return 0;
}
