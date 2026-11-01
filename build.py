"""Reconstruit index.html (à la racine du dossier) à partir des sources de src/.
Usage : python build.py
- src/app.html  : structure HTML + CSS, avec 3 repères : <!--VENDOR-->, /*DATA*/, /*APP*/
- src/vendor.html : bibliothèques intégrées (jsPDF 2.5.1, jsPDF-AutoTable 3.8.2, SortableJS 1.15.2) — ne pas modifier
- src/data.js   : bibliothèque d'exercices (CATEGORIES, EXERCICES_BASE, COURS_SUGGERES)
- src/app.js    : toute la logique du site
"""
import pathlib
root = pathlib.Path(__file__).resolve().parent
s = root / "src"
h = (s / "app.html").read_text(encoding="utf-8")
for mark in ("<!--VENDOR-->", "/*DATA*/", "/*APP*/"):
    assert h.count(mark) == 1, f"repère {mark} manquant ou en double dans src/app.html"
h = h.replace("<!--VENDOR-->", (s / "vendor.html").read_text(encoding="utf-8"), 1)
h = h.replace("/*DATA*/", (s / "data.js").read_text(encoding="utf-8"), 1)
h = h.replace("/*APP*/", (s / "app.js").read_text(encoding="utf-8"), 1)
(root / "index.html").write_text(h, encoding="utf-8", newline="\n")
print(f"index.html reconstruit ({len(h)//1024} Ko)")
