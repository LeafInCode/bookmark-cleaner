#!/usr/bin/env python3
"""英文版宣传图 v2：完全继承中文版 template 设计，仅替换文案（字号按英文宽度重算）。
用法: python3 scripts/build_promo_en.py"""
import base64
import subprocess
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "store-generator" / "static"
ASSETS = STATIC / "assets"
OUT = Path("/mnt/c/Users/ye_zh/Pictures/store-final")
TMP = OUT / ".promo-en-build"
TMP.mkdir(parents=True, exist_ok=True)
CHROME = "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
WIN = "C:\\Users\\ye_zh\\Pictures\\store-final"

icon_b64 = base64.b64encode((ASSETS / "icon.png").read_bytes()).decode()
shot_b64 = base64.b64encode((ASSETS / "screenshots" / "01-cleanup.png").read_bytes()).decode()

HEAD = """<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box} body{overflow:hidden}
.shot{border-radius:12px;overflow:hidden;box-shadow:0 48px 96px rgba(2,6,23,.38),0 12px 32px rgba(2,6,23,.22);border:1px solid rgba(255,255,255,.14);background:#fff}
.shot img{display:block;width:100%}
.brand{display:flex;align-items:center;gap:16px}
</style></head><body>"""

# —— 中文版 template 原样结构，文案英文、字号按字符宽度校准 ——
SMALL = f"""{HEAD}
<div style="width:440px;height:280px;background:linear-gradient(135deg, #1d4ed8 0%, #0b1220 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;position:relative;overflow:hidden;font-family:'Noto Sans SC',system-ui,sans-serif">
  <div style="position:absolute;top:-70px;right:-70px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle, rgba(96,165,250,.35) 0%, rgba(96,165,250,0) 70%)"></div>
  <img src="data:image/png;base64,{icon_b64}" style="width:60px;height:60px;border-radius:14px;position:relative">
  <div style="font-size:34px;font-weight:900;color:#fff;position:relative">Dead links, fixed.</div>
  <div style="font-size:15px;color:rgba(255,255,255,.78);position:relative;letter-spacing:.1em">Dead · Duplicates · Empty folders · Local</div>
</div></body></html>"""

MARQUEE = f"""{HEAD}
<div style="width:1400px;height:560px;background:linear-gradient(120deg, #1d4ed8 0%, #1e3a8a 55%, #0b1220 100%);display:flex;align-items:center;padding:0 88px;gap:64px;position:relative;overflow:hidden;font-family:'Noto Sans SC',system-ui,sans-serif">
  <div style="position:absolute;left:-180px;top:-180px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle, rgba(96,165,250,.3) 0%, rgba(96,165,250,0) 68%)"></div>
  <div style="width:520px;display:flex;flex-direction:column;gap:30px;position:relative">
    <div class="brand"><img src="data:image/png;base64,{icon_b64}" width="56" height="56" style="border-radius:12px"><span style="font-size:28px;font-weight:700;color:#fff">Bookmark Cleaner</span></div>
    <div style="font-size:54px;font-weight:900;color:#fff;line-height:1.25">Dead links, fixed.<br>Duplicates, gone.</div>
    <div style="font-size:22px;color:rgba(255,255,255,.82);line-height:1.7">Recycle bin · Weekly auto-backup<br>Profile · Time Machine · 100% local</div>
  </div>
  <div style="flex:1;display:flex;justify-content:center;position:relative"><div class="shot" style="width:600px"><img src="data:image/png;base64,{shot_b64}"></div></div>
</div></body></html>"""

for fname, html, size, out in [
    ("small.html", SMALL, "440,280", "promo-small-en-440x280.png"),
    ("marquee.html", MARQUEE, "1400,560", "promo-marquee-en-1400x560.png"),
]:
    p = TMP / fname
    p.write_text(html, encoding="utf-8")
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu",
         f"--screenshot={WIN}\\{out}", f"--window-size={size}",
         "--virtual-time-budget=6000",
         f"file:///C:/Users/ye_zh/Pictures/store-final/.promo-en-build/{fname}"],
        capture_output=True, timeout=90)
    q = OUT / out
    print(("OK " if q.exists() else "FAIL ") + out, q.stat().st_size if q.exists() else "")
