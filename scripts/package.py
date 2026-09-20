import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

version = json.load(open("manifest.json", encoding="utf-8"))["version"]
out = f"bookmark-cleaner-v{version}.zip"

files = [
    "manifest.json", "background.js", "popup.html", "popup.js",
    "dashboard.html", "dashboard.js", "timemachine.html", "timemachine.js",
    "privacy.html", "README.md", "LICENSE",
]
dirs = ["lib", "styles", "icons"]
extra = ["assets/support.png"]

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        if os.path.exists(f):
            z.write(f)
    for d in dirs:
        for base, _, names in os.walk(d):
            for n in names:
                if n == ".DS_Store":
                    continue
                z.write(os.path.join(base, n))
    for f in extra:
        if os.path.exists(f):
            z.write(f)

size_kb = os.path.getsize(out) // 1024
with zipfile.ZipFile(out) as z:
    count = len(z.namelist())
print(f"打包完成: {out} ({size_kb} KB, {count} 个文件)")
