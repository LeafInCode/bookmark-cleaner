#!/usr/bin/env python3
"""把 template.html 里的本地图片引用替换为 base64 dataURL，产出单文件 export.html。
用法: python3 build_static.py [--copy-win]
"""
import base64
import re
import shutil
import sys
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"
ASSETS = STATIC / "assets"
TEMPLATE = STATIC / "template.html"
OUT = STATIC / "export.html"
WIN_DEST = Path("/mnt/c/Users/ye_zh/Pictures/store-final/export.html")

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml"}


def to_data_url(rel: str) -> str:
    p = STATIC / rel
    mime = MIME[p.suffix.lower()]
    b64 = base64.b64encode(p.read_bytes()).decode()
    return f"data:{mime};base64,{b64}"


def main() -> None:
    html = TEMPLATE.read_text(encoding="utf-8")
    refs = set(re.findall(r'["\'](assets/[^"\']+)["\']', html))
    for rel in sorted(refs):
        html = html.replace(rel, to_data_url(rel))
    OUT.write_text(html, encoding="utf-8")
    size_kb = OUT.stat().st_size // 1024
    print(f"打包完成: {OUT} ({size_kb} KB, 内联 {len(refs)} 张图)")

    if "--copy-win" in sys.argv:
        shutil.copy2(OUT, WIN_DEST)
        print(f"已复制到 Windows: {WIN_DEST} (WSL 路径可直接被 Windows 访问)")


if __name__ == "__main__":
    main()
