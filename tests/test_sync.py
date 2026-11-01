"""Test de la synchronisation avec un faux serveur qui exécute le vrai google-apps-script.gs.
Lancer depuis la racine du projet, dans 2 terminaux :
  1) node tests/mockserver.js            (faux Google, port 8765, code secret « test123 »)
  2) python -m http.server 8766          (sert index.html)
puis : python tests/test_sync.py
"""
import json, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright
SITE = "http://localhost:8766/index.html"
URL = "https://script.google.com/macros/s/x/exec"
INIT = "const __o = window.fetch; window.fetch = (u, opt) => (String(u).startsWith('https://script.google') ? __o('http://localhost:8765/x', opt) : __o(u, opt)); sessionStorage.setItem('fc_teaser','1');"
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def page():
        pg = b.new_context(viewport={"width":1300,"height":950}).new_page(); pg.add_init_script(INIT)
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept()); pg.route("**/fonts.*/**", lambda r: r.abort()); return pg
    titles = lambda pg: sorted(pg.evaluate("Object.values(JSON.parse(localStorage.fc_saved||'{}')).filter(f=>!f.deleted).map(f=>f.title)"))
    ph = page(); ph.goto(SITE)                       # « téléphone » : horaires + fiche
    ph.click("#tabs [data-view=horaires]"); ph.locator(".day").nth(0).click(); ph.fill("#s1d","09:00"); ph.fill("#s1f","13:00"); ph.click("#dm-save")
    ph.click("#tabs [data-view=fiche]"); ph.click('.ex[data-id="tap-pointe"] [data-act=add]'); ph.click("#btn-save"); ph.fill("#sv-name","Fiche tel"); ph.press("#sv-name","Enter")
    ph.click("#sync-btn"); ph.fill("#sy-url", URL); ph.fill("#sy-code","test123"); ph.click("#sy-connect"); ph.wait_for_timeout(2000); ph.keyboard.press("Escape")
    pc = page(); pc.goto(SITE)                       # « PC » : exercice perso, puis lien magique
    pc.click("#btn-new"); pc.fill("#m-nom","Exo PC"); pc.click("#m-save")
    pc.goto(SITE + "#synchro=" + urllib.parse.quote(URL, safe="") + "&code=test123"); pc.reload(); pc.wait_for_timeout(2500)
    ph.evaluate("window.__ficheCoach.syncNow()"); ph.wait_for_timeout(1500)
    for n, pg in (("téléphone", ph), ("PC", pc)):
        print(n, ": heures", list(pg.evaluate("window.__ficheCoach.hours()").keys()), "| fiches", titles(pg),
              "| perso", pg.evaluate("JSON.parse(localStorage.fc_custom||'[]').map(e=>e.n)"))
    print("erreurs JS :", errs or "aucune"); b.close()
