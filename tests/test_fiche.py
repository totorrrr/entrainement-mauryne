"""Test de non-régression de la fiche, de la bibliothèque et de « Mes enregistrements ».
Lancer depuis la racine du projet :  python tests/test_fiche.py
Prérequis : pip install playwright  puis  python -m playwright install chromium
"""
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
OUT = ROOT / "tests" / "sorties"; OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1400,"height":1000}, accept_downloads=True)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.route("**/fonts.*/**", lambda r: r.abort()); pg.add_init_script("sessionStorage.setItem('fc_teaser','1')")
    pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload()
    print("exercices :", pg.inner_text("#lib-count"))
    pg.click("#chips [data-cat=abdos]"); print("sous-groupes abdos :", pg.locator(".sub-title").all_inner_texts())
    pg.click("#chips [data-cat=all]")
    # glisser-déposer dans une bulle vide (le bug historique)
    src = pg.locator('.ex[data-id="tap-pointe"] .ex-name'); dst = pg.locator('.drop[data-key=echauf]')
    sb = src.bounding_box(); db = dst.bounding_box()
    pg.mouse.move(sb["x"]+20, sb["y"]+10); pg.mouse.down()
    for i in range(1, 26):
        pg.mouse.move(sb["x"]+20+(db["x"]+60-sb["x"]-20)*i/25, sb["y"]+10+(db["y"]+40-sb["y"]-10)*i/25); pg.wait_for_timeout(25)
    pg.mouse.up(); pg.wait_for_timeout(400)
    print("glisser-déposer OK :", pg.locator("#bubbles .item").count() == 1 and pg.locator("#bubbles .ex").count() == 0)
    # enchaîner des fiches sans « Nouvelle fiche » : aucune ne doit être écrasée
    titles = lambda: pg.evaluate("Object.values(JSON.parse(localStorage.fc_saved||'{}')).filter(f=>!f.deleted).map(f=>f.title)")
    for k in range(1, 4):
        pg.click('.ex[data-id="squats-sumo"] [data-act=add]'); pg.click("#btn-save"); pg.fill("#sv-name", f"AF{k}"); pg.press("#sv-name", "Enter")
    print("fiches (attendu AF1, AF2, AF3) :", titles())
    with pg.expect_download() as d: pg.click("#btn-export")
    d.value.save_as(str(OUT / "fiche.pdf")); print("PDF :", d.value.suggested_filename)
    pg.screenshot(path=str(OUT / "fiche.png"), full_page=True)
    m = b.new_page(viewport={"width":390,"height":844}); m.route("**/fonts.*/**", lambda r: r.abort())
    m.goto(URL); m.wait_for_timeout(300)
    print("pas de débordement mobile :", m.evaluate("document.documentElement.scrollWidth") == 390)
    print("erreurs JS :", errs or "aucune")
    b.close()
