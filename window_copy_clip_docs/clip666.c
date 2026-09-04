#include <windows.h>
#include <wchar.h>

int wmain(void)
{
    static const wchar_t text[] = L"你好";
    size_t bytes = (wcslen(text) + 1) * sizeof(wchar_t);
    HGLOBAL hGlobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes);
    if (hGlobal == NULL)
        return 1;
    wchar_t *dst = (wchar_t *)GlobalLock(hGlobal);
    if (dst == NULL) {
        GlobalFree(hGlobal);
        return 1;
    }
    memcpy(dst, text, bytes);
    GlobalUnlock(hGlobal);
    if (!OpenClipboard(NULL)) {
        GlobalFree(hGlobal);
        return 1;
    }
    EmptyClipboard();
    if (SetClipboardData(CF_UNICODETEXT, hGlobal) == NULL) {
        CloseClipboard();
        GlobalFree(hGlobal);
        return 1;
    }
    CloseClipboard();
    return 0;
}
