(function () {
"use strict";

/* ============ OUTILS ============ */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const lines = (s) => String(s || "").split("|").map(x => x.trim()).filter(Boolean);
const uid = () => Math.random().toString(36).slice(2, 10);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
function todayISO() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
}

const ICONS = {
  flame: '<path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.2 3 2.5 3 0-3-1-6 0-9z"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z"/><path d="M4 21c3-6 7-9 12-11"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>'
};
const ic = (name, size = 18, sw = 2.4) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/* ============ SECTIONS DE LA FICHE ============ */
const SECTIONS = [
  { key:"echauf", label:"Échauffement",    sub:"Mise en route, cardio léger", color:"#ff8a3d", bg:"#fff3e8", pdf:[240,106,31],  icon:"flame" },
  { key:"corps",  label:"Corps du cours",  sub:"Renfo, cardio, gainage",      color:"#ff4f8b", bg:"#ffeef5", pdf:[232,54,122],  icon:"dumbbell" },
  { key:"retour", label:"Retour au calme", sub:"Étirements, respiration",     color:"#8b5cf6", bg:"#f4efff", pdf:[124,77,219],  icon:"leaf" }
];
const SEC = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

/* ============ ÉTAT ============ */
let custom = store.get("fc_custom", []);        // exercices créés
let overrides = store.get("fc_overrides", {});  // exercices de base modifiés
let state = store.get("fc_state", null);
if (!state || !state.sections) {
  state = {
    info: { cours:"", date:todayISO(), coach:"", duree:"", notes:"" },
    sections: { echauf:{ on:true, items:[] }, corps:{ on:false, items:[] }, retour:{ on:false, items:[] } },
    active: "echauf"
  };
}
SECTIONS.forEach(s => { if (!state.sections[s.key]) state.sections[s.key] = { on:false, items:[] }; });
if (!state.info.date) state.info.date = todayISO();
let filterCat = "all", query = "";

const save = () => store.set("fc_state", state);
const saveLib = () => { store.set("fc_custom", custom); store.set("fc_overrides", overrides); };

function allExercises() {
  const base = EXERCICES_BASE.map(e => overrides[e.id] ? { ...overrides[e.id], id:e.id, _base:true, _mod:true } : { ...e, _base:true });
  return base.concat(custom.map(e => ({ ...e, _perso:true })));
}
function getEx(id) { return allExercises().find(e => e.id === id); }
// exercice d'une ligne de fiche : version actuelle, sinon la copie gardée à l'enregistrement
function exOf(it) { return getEx(it.id) || (it.snap ? { ...it.snap, id:it.id, _perso:true } : null); }

/* ============ INFOS DU COURS ============ */
const INFO_FIELDS = { cours:"#f-cours", date:"#f-date", coach:"#f-coach", duree:"#f-duree", bpm:"#f-bpm", notes:"#f-notes" };

/* --- tempo : 1 bloc = 32 temps (4 x 8 temps) --- */
const TEMPS_PAR_BLOC = 32;
function blocSec(info = state.info) {
  const bpm = parseFloat(String((info && info.bpm) || "").replace(",", "."));
  return bpm >= 40 && bpm <= 250 ? TEMPS_PAR_BLOC * 60 / bpm : null;
}
function fmtSec(s) {
  if (s < 59.95) return `${String(Math.round(s * 10) / 10).replace(".", ",")} s`;
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  return r ? `${m} min ${String(r).padStart(2, "0")} s` : `${m} min`;
}
function renderBpmHint() {
  const b = blocSec();
  $("#bpm-hint").innerHTML = b ? `1 bloc = <b>${fmtSec(b)}</b>` : "Écris le tempo pour voir les durées";
}
function initInfo() {
  $("#cours-list").innerHTML = COURS_SUGGERES.map(c => `<option value="${esc(c)}">`).join("");
  if (!state.info.coach) state.info.coach = store.get("fc_coach", "");
  if (state.info.bpm === undefined) state.info.bpm = "128";
  for (const [k, sel] of Object.entries(INFO_FIELDS)) {
    const el = $(sel); el.value = state.info[k] || "";
    el.addEventListener("input", () => {
      state.info[k] = el.value; save();
      if (k === "coach") store.set("fc_coach", el.value);
      if (k === "bpm") { renderBpmHint(); renderBubbles(); }
    });
  }
}

/* ============ BIBLIOTHÈQUE ============ */
function renderChips() {
  const chips = [{ key:"all", label:"Tous", color:"#2a1433" }].concat(Object.entries(CATEGORIES).map(([k, v]) => ({ key:k, ...v })));
  $("#chips").innerHTML = chips.map(c =>
    `<button class="chip ${filterCat === c.key ? "on" : ""}" data-cat="${c.key}">${c.key !== "all" ? `<span class="dot" style="background:${c.color}"></span>` : ""}${esc(c.label)}</button>`
  ).join("");
}
function exCard(e) {
  const cat = CATEGORIES[e.c] || CATEGORIES.bas;
  const dl = [["Position", e.p], ["Mouvement", e.m], ["Ressenti", e.r], ["Sécurité", e.s]]
    .map(([t, v]) => `<dt>${t}</dt><dd>${esc(lines(v).join("\n")) || "—"}</dd>`).join("");
  return `<li class="ex" data-id="${esc(e.id)}" style="--c:${cat.color}">
    <div class="ex-row">
      <div class="ex-name">${esc(e.n)}${e._perso ? '<span class="tag-perso">perso</span>' : e._mod ? '<span class="tag-perso">modifié</span>' : ""}<small>${esc(cat.label)}${e.g ? " · " + esc(e.g) : ""}</small></div>
      <button class="icon-btn" data-act="info" title="Voir la description" aria-label="Voir la description">${ic("info", 17)}</button>
      <button class="icon-btn" data-act="edit" title="Modifier" aria-label="Modifier">${ic("edit", 16)}</button>
      <button class="icon-btn add" data-act="add" title="Ajouter à la bulle active" aria-label="Ajouter">${ic("plus", 18, 3)}</button>
    </div>
    <dl class="ex-detail">${dl}</dl>
  </li>`;
}
function renderLibrary() {
  const q = norm(query);
  const list = allExercises().filter(e =>
    (filterCat === "all" || e.c === filterCat) &&
    (!q || norm([e.n, e.p, e.m, e.r, e.s, (CATEGORIES[e.c] || {}).label, e.g].join(" ")).includes(q))
  );
  $("#lib-count").textContent = list.length;
  if (!list.length) { $("#lib-list").innerHTML = `<li class="empty-lib">Aucun exercice trouvé…<br>Tu peux le créer avec le bouton ci-dessous.</li>`; return; }
  let html = "";
  for (const [k, cat] of Object.entries(CATEGORIES)) {
    const group = list.filter(e => e.c === k);
    if (!group.length) continue;
    if (filterCat === "all") html += `<li class="cat-title">${esc(cat.label)}</li>`;
    let lastG = null;   // sous-groupes (ex : abdos grand droit / transverse / obliques)
    group.forEach(e => {
      const g = e.g || "";
      if (group.some(x => x.g) && g !== lastG) { html += `<li class="sub-title">${esc(g || "Autres")}</li>`; lastG = g; }
      html += exCard(e);
    });
  }
  $("#lib-list").innerHTML = html;
}
function initLibrary() {
  renderChips(); renderLibrary();
  $("#chips").addEventListener("click", ev => {
    const b = ev.target.closest(".chip"); if (!b) return;
    filterCat = b.dataset.cat; renderChips(); renderLibrary();
  });
  $("#search").addEventListener("input", ev => { query = ev.target.value; renderLibrary(); });
  $("#lib-list").addEventListener("click", ev => {
    const btn = ev.target.closest("[data-act]"); if (!btn) return;
    const li = btn.closest(".ex"); const id = li.dataset.id;
    if (btn.dataset.act === "info") li.classList.toggle("open");
    if (btn.dataset.act === "edit") openModal(id);
    if (btn.dataset.act === "add") addToActive(id);
  });
  new Sortable($("#lib-list"), {
    group: { name:"ex", pull:"clone", put:false },
    sort: false, draggable: ".ex", filter: ".icon-btn", preventOnFilter: false,
    delay: 180, delayOnTouchOnly: true, animation: 150
  });
}

/* ============ FICHE (bulles) ============ */
function sectionFor(ex) {
  if (ex.c === "echauf") return "echauf";
  if (ex.c === "retour") return "retour";
  return "corps";
}
function addToActive(id) {
  const ex = getEx(id); if (!ex) return;
  let key = state.active;
  if (!key || !state.sections[key].on) {
    key = SECTIONS.map(s => s.key).find(k => state.sections[k].on) || sectionFor(ex);
    state.sections[key].on = true; state.active = key;
  }
  state.sections[key].items.push({ uid:uid(), id, blocs:1 });
  save(); renderToggles(); renderBubbles();
  const b = document.querySelector(`.bubble[data-key="${key}"]`);
  if (b) { b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash"); }
  toast(`« ${ex.n} » ajouté à ${SEC[key].label}`);
}

function renderToggles() {
  $("#toggles").innerHTML = SECTIONS.map(s => {
    const n = state.sections[s.key].items.length;
    return `<div class="tog" style="--sc:${s.color}">
      <input type="checkbox" id="t-${s.key}" data-key="${s.key}" ${state.sections[s.key].on ? "checked" : ""}>
      <label for="t-${s.key}">
        <span class="ic">${ic(s.icon, 22)}</span>
        <span class="t">${s.label}<small>${n ? `${n} exercice${n > 1 ? "s" : ""}` : s.sub}</small></span>
        <span class="box">${ic("check", 16, 3.4)}</span>
      </label></div>`;
  }).join("");
}

function buildBubbles() {
  $("#bubbles").innerHTML = SECTIONS.map(s => `
    <div class="bubble" data-key="${s.key}" style="--sc:${s.color};--sbg:${s.bg}" hidden>
      <div class="b-head" title="Cliquer pour que les + ajoutent ici">
        <span class="ic">${ic(s.icon, 20)}</span>
        <h3>${s.label}<small class="b-sum"></small></h3>
        <span class="here">Les + arrivent ici</span>
      </div>
      <ul class="drop" data-key="${s.key}"></ul>
    </div>`).join("") + `<div class="nothing" id="nothing"><b>Coche une partie pour commencer</b>Échauffement, corps du cours ou retour au calme : une bulle s'ouvre pour y glisser tes exercices.</div>`;

  document.querySelectorAll(".drop").forEach(ul => {
    new Sortable(ul, {
      group: { name:"ex", pull:true, put:true },
      animation: 160, draggable: ".item, .ex",
      filter: "input, button", preventOnFilter: false,
      delay: 180, delayOnTouchOnly: true,
      onAdd: scheduleDomSync, onUpdate: scheduleDomSync, onRemove: scheduleDomSync
    });
  });
}

let domSyncT;
function scheduleDomSync() { clearTimeout(domSyncT); domSyncT = setTimeout(syncFromDOM, 0); }
function syncFromDOM() {
  const old = {};
  SECTIONS.forEach(s => state.sections[s.key].items.forEach(it => old[it.uid] = it));
  let lastAdded = null;
  document.querySelectorAll(".drop").forEach(ul => {
    const key = ul.dataset.key;
    state.sections[key].items = [...ul.children].map(li => {
      if (li.dataset.uid && old[li.dataset.uid]) return old[li.dataset.uid];
      if (li.dataset.id) { lastAdded = key; return { uid:uid(), id:li.dataset.id, blocs:1 }; }
      return null;
    }).filter(Boolean);
  });
  if (lastAdded) state.active = lastAdded;
  save(); renderToggles(); renderBubbles();
}

function renderBubbles() {
  const onKeys = SECTIONS.map(s => s.key).filter(k => state.sections[k].on);
  if (!onKeys.includes(state.active)) state.active = onKeys[0] || null;
  $("#nothing").hidden = onKeys.length > 0;

  SECTIONS.forEach(s => {
    const sec = state.sections[s.key];
    const bubble = document.querySelector(`.bubble[data-key="${s.key}"]`);
    const wasHidden = bubble.hidden;
    bubble.hidden = !sec.on;
    if (wasHidden && sec.on) { bubble.style.animation = "none"; void bubble.offsetWidth; bubble.style.animation = ""; }
    bubble.classList.toggle("active", state.active === s.key && onKeys.length > 1);
    const tot = sec.items.reduce((a, it) => a + (+it.blocs || 0), 0);
    const bs = blocSec();
    $(".b-sum", bubble).textContent = sec.items.length
      ? `${sec.items.length} exercice${sec.items.length > 1 ? "s" : ""} · ${tot} bloc${tot > 1 ? "s" : ""}${bs ? " · " + fmtSec(tot * bs) : ""}`
      : "Aucun exercice pour l'instant";
    $(".drop", bubble).innerHTML = sec.items.map((it, i) => {
      const ex = exOf(it);
      if (!ex) return "";
      const cat = CATEGORIES[ex.c] || {};
      return `<li class="item" data-uid="${it.uid}">
        <span class="grip" title="Glisser pour déplacer">${ic("grip", 18, 1.2)}</span>
        <span class="idx">${i + 1}</span>
        <div class="it-main"><b>${esc(ex.n)}</b><small>${esc(cat.label || "")}${ex.g ? " · " + esc(ex.g) : ""}${ex.v ? " · " + esc(ex.v) : ""}</small></div>
        <div class="blocs">
          <button data-act="minus" aria-label="Moins un bloc">−</button>
          <input type="number" min="1" max="99" value="${it.blocs}" aria-label="Nombre de blocs">
          <button data-act="plus" aria-label="Plus un bloc">+</button>
          <span>bloc${it.blocs > 1 ? "s" : ""}</span>
        </div>
        ${bs ? `<span class="it-time" title="Durée de l'exercice"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/></svg><span class="tt">${fmtSec(it.blocs * bs)}</span></span>` : ""}
        <button class="del" data-act="del" title="Retirer" aria-label="Retirer">${ic("x", 18, 2.6)}</button>
      </li>`;
    }).join("");
  });
  renderStats();
}

// met à jour durées et totaux sans tout redessiner (le curseur reste dans le champ)
function updateTimes(changedUid) {
  const bs = blocSec();
  SECTIONS.forEach(s => {
    const sec = state.sections[s.key];
    const bubble = document.querySelector(`.bubble[data-key="${s.key}"]`); if (!bubble) return;
    const tot = sec.items.reduce((a, it) => a + (+it.blocs || 0), 0);
    if (sec.items.length) $(".b-sum", bubble).textContent =
      `${sec.items.length} exercice${sec.items.length > 1 ? "s" : ""} · ${tot} bloc${tot > 1 ? "s" : ""}${bs ? " · " + fmtSec(tot * bs) : ""}`;
    sec.items.forEach(it => {
      const li = bubble.querySelector(`.item[data-uid="${it.uid}"]`); if (!li) return;
      const lbl = $(".blocs span", li); if (lbl) lbl.textContent = "bloc" + (it.blocs > 1 ? "s" : "");
      const t = $(".it-time .tt", li);
      if (t && bs) {
        const txt = fmtSec(it.blocs * bs);
        if (t.textContent !== txt) {
          t.textContent = txt;
          if (it.uid === changedUid) { const pill = t.parentElement; pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump"); }
        }
      }
    });
  });
  renderStats();
  const st = $("#stats b:last-child");
  if (st && bs) { st.classList.remove("bump"); void st.offsetWidth; st.classList.add("bump"); }
}

function renderStats() {
  let n = 0, b = 0;
  SECTIONS.forEach(s => { const sec = state.sections[s.key]; if (sec.on) sec.items.forEach(it => { n++; b += +it.blocs || 0; }); });
  const bs = blocSec();
  $("#stats").innerHTML = n ? `<b>${n}</b> exercice${n > 1 ? "s" : ""} · <b>${b}</b> bloc${b > 1 ? "s" : ""}${bs ? ` · cours complet : <b>${fmtSec(b * bs)}</b>` : " au total"}` : "Ta fiche est vide pour l'instant";
}

function findItem(uidv) {
  for (const s of SECTIONS) {
    const arr = state.sections[s.key].items; const i = arr.findIndex(x => x.uid === uidv);
    if (i > -1) return { arr, i, key:s.key };
  }
  return null;
}
function initBuilder() {
  renderToggles(); buildBubbles(); renderBubbles();
  $("#toggles").addEventListener("change", ev => {
    const key = ev.target.dataset.key; if (!key) return;
    state.sections[key].on = ev.target.checked;
    if (ev.target.checked) state.active = key;
    save(); renderToggles(); renderBubbles();
  });
  $("#bubbles").addEventListener("click", ev => {
    const bubble = ev.target.closest(".bubble");
    if (bubble && state.active !== bubble.dataset.key) {
      state.active = bubble.dataset.key; save();
      const many = SECTIONS.filter(s => state.sections[s.key].on).length > 1;
      document.querySelectorAll(".bubble").forEach(bb => bb.classList.toggle("active", many && bb.dataset.key === state.active));
    }
    const btn = ev.target.closest("[data-act]"); if (!btn) return;
    const li = btn.closest(".item"); const f = li && findItem(li.dataset.uid); if (!f) return;
    const it = f.arr[f.i];
    if (btn.dataset.act === "del") f.arr.splice(f.i, 1);
    if (btn.dataset.act === "plus" || btn.dataset.act === "minus") {
      it.blocs = btn.dataset.act === "plus" ? Math.min(99, (+it.blocs || 1) + 1) : Math.max(1, (+it.blocs || 1) - 1);
      $("input", li).value = it.blocs;
      save(); updateTimes(it.uid); return;
    }
    save(); renderToggles(); renderBubbles();
  });
  // mise à jour en direct pendant la saisie du nombre de blocs
  $("#bubbles").addEventListener("input", ev => {
    if (ev.target.type !== "number") return;
    const f = findItem(ev.target.closest(".item").dataset.uid); if (!f) return;
    const v = parseInt(ev.target.value, 10);
    if (!v) return; // champ vide pendant la frappe : on attend
    f.arr[f.i].blocs = Math.max(1, Math.min(99, v));
    save(); updateTimes(f.arr[f.i].uid);
  });
  $("#bubbles").addEventListener("change", ev => {
    if (ev.target.type !== "number") return;
    const f = findItem(ev.target.closest(".item").dataset.uid); if (!f) return;
    f.arr[f.i].blocs = Math.max(1, Math.min(99, parseInt(ev.target.value, 10) || 1));
    ev.target.value = f.arr[f.i].blocs;
    save(); updateTimes(f.arr[f.i].uid);
  });
  $("#btn-reset").addEventListener("click", () => {
    if (!confirm("Vider toutes les bulles de la fiche ?")) return;
    SECTIONS.forEach(s => state.sections[s.key].items = []);
    state.editingId = null;   // une fiche vidée devient une nouvelle fiche : elle n'écrasera pas l'enregistrement d'origine
    save(); renderToggles(); renderBubbles(); updateBanner(); toast("Fiche vidée");
  });
  $("#btn-export").addEventListener("click", () => exportPDF());
}

/* ============ CRÉER / MODIFIER UN EXERCICE ============ */
let editing = null;
function openModal(id) {
  editing = id || null;
  const e = id ? getEx(id) : { n:"", c: filterCat !== "all" ? filterCat : "bas", p:"", m:"", r:"", s:"", v:"" };
  $("#m-title").textContent = id ? "Modifier l'exercice" : "Créer un exercice";
  $("#m-cat").innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${e.c === k ? "selected" : ""}>${esc(v.label)}</option>`).join("");
  $("#m-nom").value = e.n || ""; $("#m-v").value = e.v || ""; $("#m-g").value = e.g || "";
  ["p","m","r","s"].forEach(k => $("#m-" + k).value = lines(e[k]).join("\n"));
  const del = $("#m-delete");
  if (e._perso) { del.hidden = false; del.textContent = "Supprimer"; }
  else if (e._mod) { del.hidden = false; del.textContent = "Rétablir l'original"; }
  else del.hidden = true;
  $("#modal-bg").classList.add("show");
  setTimeout(() => $("#m-nom").focus(), 50);
}
function closeModal() { $("#modal-bg").classList.remove("show"); editing = null; }
function initModal() {
  $("#btn-new").addEventListener("click", () => openModal(null));
  $("#m-cancel").addEventListener("click", closeModal);
  $("#modal-bg").addEventListener("click", ev => { if (ev.target.id === "modal-bg") closeModal(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeModal(); });
  $("#m-save").addEventListener("click", () => {
    const n = $("#m-nom").value.trim();
    if (!n) { toast("Donne un nom à l'exercice"); $("#m-nom").focus(); return; }
    const data = {
      n, c: $("#m-cat").value, v: $("#m-v").value.trim(), g: $("#m-g").value.trim(),
      p: $("#m-p").value.split("\n").map(x => x.trim()).filter(Boolean).join("|"),
      m: $("#m-m").value.split("\n").map(x => x.trim()).filter(Boolean).join("|"),
      r: $("#m-r").value.split("\n").map(x => x.trim()).filter(Boolean).join("|"),
      s: $("#m-s").value.split("\n").map(x => x.trim()).filter(Boolean).join("|")
    };
    const wasEditing = !!editing;
    if (!editing) custom.push({ id:"perso-" + uid(), ...data });
    else if (EXERCICES_BASE.some(e => e.id === editing)) overrides[editing] = data;
    else { const i = custom.findIndex(e => e.id === editing); if (i > -1) custom[i] = { id:editing, ...data }; }
    saveLib(); closeModal(); renderLibrary(); renderBubbles();
    toast(wasEditing ? "Exercice mis à jour" : "Exercice créé");
  });
  $("#m-delete").addEventListener("click", () => {
    if (!editing) return;
    if (EXERCICES_BASE.some(e => e.id === editing)) {
      delete overrides[editing]; toast("Description d'origine rétablie");
    } else {
      if (!confirm("Supprimer définitivement cet exercice ?")) return;
      custom = custom.filter(e => e.id !== editing);
      SECTIONS.forEach(s => state.sections[s.key].items = state.sections[s.key].items.filter(it => it.id !== editing));
      save(); toast("Exercice supprimé");
    }
    saveLib(); closeModal(); renderLibrary(); renderToggles(); renderBubbles();
  });

  // Sauvegarde / import des exercices perso
  $("#btn-backup").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app:"fiche-coach", version:1, custom, overrides }, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "mes-exercices-fiche-coach.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Sauvegarde téléchargée");
  });
  $("#btn-restore").addEventListener("click", () => $("#file-restore").click());
  $("#file-restore").addEventListener("change", async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.custom)) throw 0;
      const ids = new Set(data.custom.map(e => e.id));
      custom = custom.filter(e => !ids.has(e.id)).concat(data.custom);
      overrides = { ...overrides, ...(data.overrides || {}) };
      saveLib(); renderLibrary(); renderBubbles();
      toast(`${data.custom.length} exercice(s) perso importé(s)`);
    } catch (e) { toast("Fichier non reconnu"); }
    ev.target.value = "";
  });
}

/* ============ EXPORT PDF ============ */
function pdfText(s) {
  return String(s || "")
    .replace(/[→⟶➔➜]/g, "->").replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"')
    .replace(/…/g, "...").replace(/[–—−]/g, "-").replace(/œ/g, "oe").replace(/Œ/g, "OE")
    .replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/≈/g, "~").replace(/[✓✔]/g, "OK").replace(/[•●]/g, "-")
    .replace(/[^\n\r\t\x20-\x7E\xA0-\xFF€‚ƒ„†‡ˆ‰Š‹ŽšžŸ•™]/g, ""); // emojis & co : non gérés par la police du PDF
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function seriesText(ex, blocs, bs) {
  const b = `${blocs} bloc${blocs > 1 ? "s" : ""}`;
  return (ex.v ? `${ex.v} - ${b}` : b) + (bs ? `\n${fmtSec(blocs * bs)}` : "");
}
function dateLongue(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  try { return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" }); }
  catch (e) { return iso; }
}

function exportPDF(src) {
  const S = src && src.sections ? src : state;   // fiche en cours, ou une fiche enregistrée
  const secs = SECTIONS.filter(s => S.sections[s.key] && S.sections[s.key].on && S.sections[s.key].items.length);
  if (!secs.length) { toast("Ajoute au moins un exercice dans une bulle"); return; }
  if (!window.jspdf) { toast("Le module PDF n'a pas pu se charger"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
  const info = S.info || {};

  // --- En-tête dégradé ---
  const stops = [[255,79,139],[255,138,92],[255,179,71]];
  const HH = 30, N = 120;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), seg = t < .5 ? 0 : 1, lt = t < .5 ? t * 2 : (t - .5) * 2;
    const c = stops[seg].map((v, j) => Math.round(v + (stops[seg + 1][j] - v) * lt));
    doc.setFillColor(...c); doc.rect(W * i / N, 0, W / N + .3, HH, "F");
  }
  // petite ligne "pulsation" décorative

  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("FICHE DE COURS", M, 10.5, { charSpace:1 });
  const titre = pdfText(info.cours || "Mon cours");
  let fs = 22; doc.setFontSize(fs);
  while (fs > 12 && doc.getTextWidth(titre) > W * 0.48) { fs -= 1; doc.setFontSize(fs); }
  doc.text(titre, M, 22);
  if (M + doc.getTextWidth(titre) < W / 2 - 34) { // ligne « pulsation » seulement si le titre laisse la place
    doc.setDrawColor(255,255,255); doc.setLineWidth(1.1);
    doc.setGState && doc.setGState(new doc.GState({ opacity:.3 }));
    doc.lines([[30,0],[5,-10],[7,20],[7,-24],[6,18],[4,-4],[40,0]], W / 2 - 30, 17);
    doc.setGState && doc.setGState(new doc.GState({ opacity:1 }));
  }
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const bsH = blocSec(info);
  let totB = 0; secs.forEach(s => S.sections[s.key].items.forEach(it => totB += +it.blocs || 0));
  const right = [dateLongue(info.date),
    [info.coach ? "Coach : " + info.coach : "", info.duree ? "Durée : " + info.duree : ""].filter(Boolean).join("  ·  "),
    bsH ? `Musique : ${info.bpm} BPM (1 bloc = ${fmtSec(bsH)})  ·  Total : ${fmtSec(totB * bsH)}` : ""].filter(Boolean);
  right.forEach((t, i) => doc.text(pdfText(t), W - M, 11 + i * 5.5, { align:"right" }));

  let y = HH + 7;
  if (info.notes && info.notes.trim()) {
    doc.setTextColor(107,88,115); doc.setFont("helvetica","italic"); doc.setFontSize(9.5);
    const wrapped = doc.splitTextToSize(pdfText(info.notes.trim()), W - 2 * M);
    doc.text(wrapped, M, y); y += wrapped.length * 4.2 + 3;
  }

  // --- Sections ---
  secs.forEach(s => {
    const items = S.sections[s.key].items.map(it => ({ it, ex:exOf(it) })).filter(x => x.ex);
    if (y > H - 40) { doc.addPage(); y = 16; }
    const tot = items.reduce((a, x) => a + (+x.it.blocs || 0), 0);
    // étiquette de section
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    const label = pdfText(s.label);
    const lw = doc.getTextWidth(label) + 12;
    doc.setFillColor(...hexToRgb(s.color)); doc.roundedRect(M, y, lw, 8, 2.5, 2.5, "F");
    doc.setTextColor(255,255,255); doc.text(label, M + 6, y + 5.6);
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(107,88,115);
    doc.text(`${items.length} exercice${items.length > 1 ? "s" : ""}  ·  ${tot} bloc${tot > 1 ? "s" : ""}${bsH ? "  ·  " + fmtSec(tot * bsH) : ""}`, M + lw + 4, y + 5.4);

    doc.autoTable({
      startY: y + 11,
      margin: { left:M, right:M, top:14, bottom:14 },
      head: [["Exercice", "Séries", "Position", "Mouvement", "Ressenti", "Sécurité"]],
      body: items.map(({ it, ex }) => [
        pdfText(ex.n), pdfText(seriesText(ex, it.blocs, bsH)),
        pdfText(lines(ex.p).join("\n")), pdfText(lines(ex.m).join("\n")),
        pdfText(lines(ex.r).join("\n")), pdfText(lines(ex.s).join("\n"))
      ]),
      theme: "grid",
      rowPageBreak: "avoid",
      styles: { font:"helvetica", fontSize:8, cellPadding:2.2, textColor:[42,20,51], lineColor:[246,210,226], lineWidth:.25, valign:"middle", overflow:"linebreak" },
      headStyles: { fillColor:s.pdf, textColor:255, fontStyle:"bold", halign:"center", fontSize:9, cellPadding:2.6 },
      alternateRowStyles: { fillColor:[255,246,250] },
      columnStyles: {
        0: { cellWidth:34, fontStyle:"bold", fontSize:9 },
        1: { cellWidth:23, halign:"center", fontStyle:"bold", textColor:s.pdf },
        2: { cellWidth:54 }, 3: { cellWidth:58 }, 4: { cellWidth:49 }, 5: { cellWidth:55 }
      }
    });
    y = doc.lastAutoTable.finalY + 10;
  });

  // --- Pied de page ---
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(255,79,139); doc.setLineWidth(.6); doc.line(M, H - 9, W - M, H - 9);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(163,147,170);
    doc.text(pdfText(`${info.cours || "Fiche de cours"}${info.coach ? " · " + info.coach : ""}`), M, H - 5);
    doc.text(`Page ${p} / ${pages}`, W - M, H - 5, { align:"right" });
  }

  const slug = norm((src && src.title) || info.cours || "cours").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "cours";
  doc.save(`Fiche_${slug}_${info.date || todayISO()}.pdf`);
  toast("PDF exporté !");
}

/* ============ CONFIG ============ */
// Mets ici l'adresse mail qui recevra les remarques (bouton « Envoyer par mail »).
// Laisse vide pour choisir le destinataire au moment de l'envoi.
const EMAIL_REMARQUES = "";

function togglePanel(id, force) {
  const el = document.getElementById(id);
  const show = force ?? !el.classList.contains("show");
  el.classList.toggle("show", show);
  return show;
}
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => togglePanel(b.dataset.close, false)));
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !$("#modal-bg").classList.contains("show")) { togglePanel("notes-panel", false); togglePanel("bot-panel", false); }
});

/* ============ REMARQUES ============ */
const NOTE_TYPES = ["Idée", "Problème", "Exercice", "Question"];
let comments = store.get("fc_comments", []);
let noteType = "Idée";
const saveComments = () => store.set("fc_comments", comments);
const fmtDate = (iso) => { const d = new Date(iso); return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }); };

function addComment(type, text) {
  comments.unshift({ id:uid(), date:new Date().toISOString(), type, text:text.trim(), done:false });
  saveComments(); renderComments();
}
function renderComments() {
  const open = comments.filter(c => !c.done).length;
  $("#notes-badge").textContent = open || "";
  $("#note-types").innerHTML = NOTE_TYPES.map(t => `<button class="${t === noteType ? "on" : ""}" data-t="${t}">${t}</button>`).join("");
  $("#notes-list").innerHTML = comments.length ? comments.map(c => `
    <li class="note ${c.done ? "done" : ""}" data-id="${c.id}">
      <button class="n-check" data-act="done" title="${c.done ? "Remettre à faire" : "Marquer comme réglé"}" aria-label="Réglé">${ic("check", 13, 3.4)}</button>
      <div class="n-body"><div class="n-meta"><span class="t ${esc(c.type)}">${esc(c.type)}</span>${fmtDate(c.date)}</div><div class="n-text">${esc(c.text)}</div></div>
      <button class="del" data-act="del" title="Supprimer" aria-label="Supprimer">${ic("x", 15, 2.6)}</button>
    </li>`).join("") : `<li class="notes-empty">Aucune remarque pour l'instant.<br>Tout roule !</li>`;
}
function commentsText() {
  const head = `Remarques Fiche Coach (${new Date().toLocaleDateString("fr-FR")})\n` + "=".repeat(40) + "\n\n";
  return head + comments.map((c, i) =>
    `${i + 1}. [${c.type}]${c.done ? " (réglé)" : ""} - ${fmtDate(c.date)}\n${c.text}\n`).join("\n");
}
function initComments() {
  renderComments();
  $("#fab-notes").addEventListener("click", () => { if (togglePanel("notes-panel")) setTimeout(() => $("#note-text").focus(), 60); });
  $("#note-types").addEventListener("click", ev => { const b = ev.target.closest("[data-t]"); if (b) { noteType = b.dataset.t; renderComments(); } });
  const add = () => {
    const t = $("#note-text").value;
    if (!t.trim()) { toast("Écris ta remarque d'abord"); return; }
    addComment(noteType, t); $("#note-text").value = ""; toast("Remarque enregistrée");
  };
  $("#note-add").addEventListener("click", add);
  $("#note-text").addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) add(); });
  $("#notes-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const id = b.closest(".note").dataset.id; const c = comments.find(x => x.id === id);
    if (b.dataset.act === "done") c.done = !c.done;
    if (b.dataset.act === "del") { if (!confirm("Supprimer cette remarque ?")) return; comments = comments.filter(x => x.id !== id); }
    saveComments(); renderComments();
  });
  $("#notes-copy").addEventListener("click", async () => {
    if (!comments.length) { toast("Aucune remarque à copier"); return; }
    const txt = commentsText();
    try { await navigator.clipboard.writeText(txt); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (_) {} ta.remove(); }
    toast("Remarques copiées : colle-les dans un message");
  });
  $("#notes-mail").addEventListener("click", () => {
    if (!comments.length) { toast("Aucune remarque à envoyer"); return; }
    location.href = `mailto:${EMAIL_REMARQUES}?subject=${encodeURIComponent("Remarques Fiche Coach")}&body=${encodeURIComponent(commentsText())}`;
  });
  $("#notes-dl").addEventListener("click", () => {
    if (!comments.length) { toast("Aucune remarque à télécharger"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([commentsText()], { type:"text/plain;charset=utf-8" }));
    a.download = `remarques-fiche-coach-${todayISO()}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

/* ============ ASSISTANT « COACHY » ============ */
const TEMPLATES = {
  "Body Sculpt": {
    echauf:["marche-place","step-touch","montees-genoux","talons-fesses","rotation-epaules","squats-hanches"],
    corps:["squat-classique","fentes-arriere","pont-fessier","pompes-genoux","rowing","developpe-epaules","planche","crunch"],
    retour:["etir-quadriceps","etir-ischios","etir-fessiers","etir-pecs"] },
  "Abdos-Fessiers": {
    echauf:["marche-place","tap-pointe","talons-fesses","genou-coude","rotation-bassin","good-morning","abductions"],
    corps:["squats-sumo","hip-thrust","fentes-bulgares","abduction-90","kick-back-debout","squat-cosaque","crunch","planche-bras-jambe","tap-talons","hollow"],
    retour:["etir-fessiers","etir-adducteurs","etir-flechisseurs","posture-enfant"] },
  "Cardio / HIIT": {
    echauf:["marche-place","step-touch","jumping-jacks-lowimpact","montees-genoux","talons-fesses","pas-chasses","squats-hanches"],
    corps:["jumping-jacks","squat-saute","mountain-climbers","skaters","burpees","high-knees","fentes-sautees","planche"],
    retour:["etir-mollets","etir-quadriceps","etir-ischios","respiration"] },
  "Full Body": {
    echauf:["marche-place","cercles-bras","rotation-buste","montees-genoux","fentes-arriere-alt","squats-epaules"],
    corps:["squat-classique","pompes-genoux","rowing","fentes-avant","developpe-epaules","pont-fessier","planche-epaules","russian-twist"],
    retour:["etir-quadriceps","etir-ischios","etir-epaules","chat-vache","respiration"] },
  "Intégral": {
    echauf:["marche-place","cercles-bras","rotation-buste","montees-genoux","fentes-arriere-alt","squats-epaules"],
    corps:["squat-halteres","fente-curl","rdl-rowing","pompes-mains-step","dips","thruster","tirage-elastique","bear-crawl","planche-pieds-step"],
    retour:["etir-quadriceps","etir-ischios","etir-fessiers","etir-epaules","etir-triceps"] },
  "Stretching": {
    echauf:["marche-place","rotation-epaules","cercles-bras","rotation-bassin","rotation-buste"],
    corps:["chat-vache","etir-quadriceps","etir-ischios","etir-fessiers","etir-adducteurs","etir-flechisseurs","etir-pecs","etir-epaules","etir-triceps"],
    retour:["posture-enfant","respiration"] }
};
const DOUX = [
  "Tu fais un super boulot. Tes adhérents ont de la chance de t'avoir !",
  "Une séance à la fois. Tu gères, vraiment.",
  "Même les meilleures coachs ont commencé par une toute première fiche. Toi, tu en es déjà bien plus loin !",
  "Respire un grand coup… Tu vas assurer ce cours, j'en suis sûr.",
  "Ton énergie est contagieuse, ne l'oublie jamais.",
  "Le BPJEPS, c'est du boulot, mais tu avances chaque jour. Je suis fier de toi !",
  "Petit rappel : bois de l'eau, souris, et tout va bien se passer."
];
let botStarted = false, botQueue = Promise.resolve(), awaiting = null, lastUnknown = "", douxIdx = Math.floor(Math.random() * DOUX.length);
const prenom = () => (state.info.coach || "").trim().split(/\s+/)[0] || "";

const MAIN_CHIPS = () => [
  { label:"Comment ça marche ?", fn:() => answer("how") },
  { label:"Prépare-moi une fiche express", fn:() => answer("express") },
  { label:"Laisser une remarque", fn:() => answer("comment") },
  { label:"Mes horaires", fn:() => answer("horaires") },
  { label:"Un petit mot doux", fn:() => answer("doux") }
];

function setChips(chips) {
  const box = $("#bot-chips"); box.innerHTML = "";
  (chips || []).forEach(c => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = c.label;
    b.addEventListener("click", () => { setChips([]); userSay(c.label); c.fn(); });
    box.appendChild(b);
  });
}
function scrollChat() { const c = $("#chat"); c.scrollTop = c.scrollHeight; }
function userSay(text) {
  const m = document.createElement("div"); m.className = "msg me"; m.textContent = text;
  $("#chat").appendChild(m); scrollChat();
}
function botSay(text, chips) {
  botQueue = botQueue.then(() => new Promise(res => {
    const t = document.createElement("div"); t.className = "msg bot typing"; t.innerHTML = "<i></i><i></i><i></i>";
    $("#chat").appendChild(t); scrollChat();
    setTimeout(() => {
      t.className = "msg bot"; t.textContent = text; scrollChat();
      if (chips) setChips(chips);
      res();
    }, Math.min(1300, 450 + text.length * 8));
  }));
}

function applyTemplate(name) {
  const tpl = TEMPLATES[name];
  SECTIONS.forEach(s => {
    const ids = (tpl[s.key] || []).filter(id => getEx(id));
    state.sections[s.key] = { on: ids.length > 0, items: ids.map(id => ({ uid:uid(), id, blocs:1 })) };
  });
  state.active = "corps"; state.editingId = null;
  state.info.cours = name; $("#f-cours").value = name;
  showView("fiche");
  save(); renderToggles(); renderBubbles(); updateBanner();
  const n = SECTIONS.reduce((a, s) => a + state.sections[s.key].items.length, 0);
  botSay(`C'est fait ! J'ai rempli ta fiche « ${name} » avec ${n} exercices : échauffement, corps du cours et retour au calme.\nChange tout ce que tu veux, et pense à régler le nombre de blocs avec − et +.`,
    [{ label:"Exporter le PDF", fn:() => { exportPDF(); botSay("Et hop, ton PDF est en route ! Regarde dans tes téléchargements.", MAIN_CHIPS()); } },
     { label:"Autre chose", fn:() => botSay("Je t'écoute !", MAIN_CHIPS()) }]);
}

function answer(intent, raw) {
  const p = prenom();
  switch (intent) {
    case "how":
      botSay("C'est super simple :\n1. En haut de ta fiche, coche Échauffement, Corps du cours ou Retour au calme.\n2. Glisse les exercices de la liste de gauche dans la bulle (ou clique sur le + rose).\n3. Règle le nombre de blocs avec − et +.\n4. Clique sur « Exporter en PDF ». Et voilà !", MAIN_CHIPS()); break;
    case "express":
      botSay("Avec plaisir ! Quel type de cours tu prépares ?",
        Object.keys(TEMPLATES).map(name => ({ label:name, fn:() => {
          const has = SECTIONS.some(s => state.sections[s.key].items.length);
          if (!has) return applyTemplate(name);
          botSay("Ta fiche contient déjà des exercices. Je les remplace par ma proposition ?",
            [{ label:"Oui, remplace", fn:() => applyTemplate(name) }, { label:"Non, je garde ma fiche", fn:() => botSay("Pas de souci, je ne touche à rien !", MAIN_CHIPS()) }]);
        } }))); break;
    case "comment":
      togglePanel("notes-panel", true); setTimeout(() => $("#note-text").focus(), 60);
      botSay("Je t'ai ouvert la bulle des remarques en haut à droite. Écris ce que tu veux changer, Antoine s'en occupera !", MAIN_CHIPS()); break;
    case "doux":
      douxIdx = (douxIdx + 1) % DOUX.length;
      botSay((p ? p + ", " : "") + DOUX[douxIdx].charAt(0).toLowerCase() + DOUX[douxIdx].slice(1), MAIN_CHIPS()); break;
    case "pdf":
      botSay("Pour ton PDF : clique sur le gros bouton « Exporter en PDF » en bas de ta fiche. Seules les parties cochées qui contiennent des exercices sont dans le PDF.",
        [{ label:"Exporte-le maintenant", fn:() => { exportPDF(); botSay("C'est parti ! Regarde dans tes téléchargements.", MAIN_CHIPS()); } }, { label:"Merci !", fn:() => answer("merci") }]); break;
    case "tempo": {
      const bs = blocSec();
      botSay(`Dans la case « Musique tempo » en haut, écris le BPM de ta musique. Un bloc = 32 temps, donc à 128 BPM, 1 bloc = 15 secondes.${bs ? ` Là, avec ${state.info.bpm} BPM, 1 bloc = ${fmtSec(bs)}.` : ""} Je calcule ensuite la durée de chaque exercice, de chaque partie et du cours complet, et tout ça apparaît aussi dans le PDF.`, MAIN_CHIPS()); break; }
    case "blocs":
      botSay("Le nombre de blocs se règle sur chaque exercice de ta bulle, avec les boutons − et +. Tu peux aussi taper directement le chiffre. Il apparaît dans la colonne « Séries » du PDF.", MAIN_CHIPS()); break;
    case "create":
      botSay("Pour ajouter ton propre exercice : clique sur « Créer un exercice » en bas de la liste de gauche. Écris une consigne par ligne, elles apparaîtront telles quelles dans le PDF.",
        [{ label:"Ouvre-le pour moi", fn:() => { togglePanel("bot-panel", false); openModal(null); } }, ...MAIN_CHIPS().slice(0, 2)]); break;
    case "edit":
      botSay("Pour modifier un exercice : clique sur le petit crayon à côté de son nom. Si tu changes un exercice de base, tu pourras toujours revenir à l'original avec « Rétablir l'original ».", MAIN_CHIPS()); break;
    case "move":
      botSay("Pour changer l'ordre, attrape un exercice dans la bulle et fais-le glisser plus haut ou plus bas. Tu peux même le déplacer d'une bulle à l'autre !", MAIN_CHIPS()); break;
    case "delete":
      botSay("Pour retirer un exercice de ta fiche, clique sur la petite croix à droite. Et le bouton « Vider » efface toute la fiche d'un coup.", MAIN_CHIPS()); break;
    case "save":
      botSay(sync.url
        ? "Tout est synchronisé ! Tes horaires, tes fiches, tes exercices perso et tes remarques sont les mêmes sur ton téléphone et ton ordinateur. Le petit nuage en haut te montre si c'est à jour."
        : "Pour l'instant, tout est gardé seulement sur cet appareil. Pour retrouver tes horaires et tes fiches partout (téléphone + ordinateur), clique sur le petit nuage « Synchro » en haut et demande le lien de connexion à Antoine.", MAIN_CHIPS()); break;
    case "fiches": {
      const n = savedList().length;
      botSay(`Quand ta fiche est prête, clique sur « Enregistrer » en bas : tu lui donnes un titre et une description. Elle part dans l'onglet « Mes enregistrements »${n ? ` (tu en as déjà ${n})` : ""}, où tu peux l'exporter en PDF en un clic ou l'éditer pour la modifier.`,
        [{ label:"Voir mes enregistrements", fn:() => { showView("saved"); botSay("Et voilà !", MAIN_CHIPS()); } }, ...MAIN_CHIPS().slice(0, 2)]); break; }
    case "probs": {
      showView("probs"); window.scrollTo({ top:0, behavior:"smooth" });
      const n = pbOpenCount();
      botSay(`Je t'ai ouvert l'onglet « Problématiques ».${n ? ` Il te reste ${n} action${n > 1 ? "s" : ""} à cocher.` : ""} Commence par la priorité 1, une chose à la fois. Et en bas, le journal des faits te permet de noter ce qui se passe, à chaud. Tu n'es pas seule, ça va aller.`, MAIN_CHIPS()); break; }
    case "horaires":
      showView("horaires"); window.scrollTo({ top:0, behavior:"smooth" });
      botSay("Je t'ai ouvert l'onglet « Mes horaires ». Clique sur un jour : tu notes début et fin (2 créneaux possibles), puis combien d'heures de cours co et de plateau. Le reste est compté en « autres tâches » automatiquement. Les totaux de la semaine se calculent tout seuls !", MAIN_CHIPS()); break;
    case "hello":
      botSay(`Coucou${p ? " " + p : ""} ! T'inquiète pas, je vais m'occuper de toi. Qu'est-ce qu'on fait ?`, MAIN_CHIPS()); break;
    case "merci":
      botSay(`Avec grand plaisir${p ? " " + p : ""} ! Je reste dans mon coin en bas à droite si tu as besoin.`, MAIN_CHIPS()); break;
    default:
      lastUnknown = raw || "";
      botSay("Oups, là je ne suis pas sûr de comprendre… Je suis un petit robot, je connais surtout le site. Tu veux que j'enregistre ta question en remarque pour Antoine ?",
        [{ label:"Oui, enregistre-la", fn:() => { addComment("Question", lastUnknown); botSay("C'est noté dans tes remarques ! Pense à les envoyer à Antoine.", MAIN_CHIPS()); } },
         { label:"Non merci", fn:() => botSay("D'accord ! Autre chose ?", MAIN_CHIPS()) }]);
  }
}

const INTENTS = [
  ["hello",   /\b(coucou|salut|bonjour|hello|hey|yo)\b/],
  ["merci",   /merci|super|genial|top\b|parfait/],
  ["doux",    /stress|fatigu|marre|peur|\bnulle?\b|galere|\bdur\b|angoiss|motiv|encourag|mot doux|triste|pas le moral/],
  ["express", /express|fiche type|idee|inspir|propos|genere|rempli|prepare|seance type|body|abdo|cardio|hiit|stretch|full|integral|bear/],
  ["probs",   /problematique|priorite|\bcfa\b|tuteur|journal|reflexion|soucis? au (travail|boulot)/],
  ["comment", /remarque|commentaire|bug|probleme|antoine|signaler|amelior/],
  ["horaires",/horaire|heures|planning|emploi du temps|plateau|pointage|releve/],
  ["pdf",     /pdf|export|telecharg|imprim/],
  ["tempo",   /bpm|tempo|musique|duree|combien de temps|minute|seconde/],
  ["blocs",   /bloc|serie|repetition/],
  ["create",  /creer|ajouter un exercice|nouvel|nouveau|mon propre|perso/],
  ["edit",    /modif|changer|corriger|description|crayon/],
  ["move",    /ordre|deplac|glisser|bouger|monter|descendre/],
  ["delete",  /supprim|retir|enlever|effacer|vider/],
  ["fiches",  /mes enregistrements|enregistrer (ma|la|une) fiche|fiches? enregistr|sauvegarder (ma|la) fiche|reutilis|retrouver (ma|une) fiche/],
  ["save",    /perdu|sauvegard|enregistr|telephone|portable|ordi|\bpc\b|synchro|appareil|import/],
  ["how",     /comment|marche|utilis|aide|explique|quoi faire|perdue?/]
];
function handleUser(text) {
  if (awaiting === "name") {
    const name = text.replace(/^(je m'?appelle|moi c'?est|c'?est)\s+/i, "").trim().split(/\s+/)[0].replace(/[^\p{L}\-']/gu, "");
    awaiting = null;
    if (name) {
      const nice = name.charAt(0).toUpperCase() + name.slice(1);
      state.info.coach = nice; $("#f-coach").value = nice; save(); store.set("fc_coach", nice);
      botSay(`Enchanté ${nice} ! J'ai noté ton prénom dans la case « Coach », comme ça il apparaîtra sur tes PDF.`);
      botSay("Qu'est-ce que je peux faire pour toi ?", MAIN_CHIPS());
      return;
    }
  }
  const n = norm(text);
  const hit = INTENTS.find(([, re]) => re.test(n));
  answer(hit ? hit[0] : "unknown", text);
}

function startBot() {
  if (botStarted) return; botStarted = true;
  const p = prenom();
  if (p) {
    botSay(`Coucou ${p} ! T'inquiète pas, je vais m'occuper de toi.`);
    botSay("Je suis Coachy, ton petit assistant. Qu'est-ce que je peux faire pour toi ?", MAIN_CHIPS());
  } else {
    botSay("Coucou ! T'inquiète pas, je vais m'occuper de toi.");
    botSay("Moi c'est Coachy, ton petit assistant. Et toi, tu t'appelles comment ?");
    awaiting = "name";
  }
}
function openBot() {
  $("#bot-teaser").classList.remove("show");
  if (togglePanel("bot-panel")) { startBot(); setTimeout(() => $("#bot-input").focus(), 80); }
}
function initBot() {
  $("#bot-fab").addEventListener("click", openBot);
  $("#bot-teaser").addEventListener("click", ev => { if (ev.target.closest("#teaser-x")) { ev.stopPropagation(); $("#bot-teaser").classList.remove("show"); return; } openBot(); });
  $("#bot-teaser").addEventListener("keydown", ev => { if (ev.key === "Enter") openBot(); });
  $("#bot-form").addEventListener("submit", ev => {
    ev.preventDefault();
    const v = $("#bot-input").value.trim(); if (!v) return;
    $("#bot-input").value = ""; setChips([]); userSay(v); handleUser(v);
  });
  // petite bulle d'accueil, une fois par visite
  let seen = false;
  try { seen = sessionStorage.getItem("fc_teaser") === "1"; sessionStorage.setItem("fc_teaser", "1"); } catch (e) {}
  if (!seen) setTimeout(() => {
    if ($("#bot-panel").classList.contains("show")) return;
    const p = prenom();
    $("#teaser-text").innerHTML = `Coucou${p ? " <b>" + esc(p) + "</b>" : ""} ! T'inquiète pas, je vais m'occuper de toi.`;
    $("#bot-teaser").classList.add("show");
  }, 1400);
}

/* ============ MES HORAIRES ============ */
const HR_STATUS = {
  travail:   { label:"Travail",   color:"#ff4f8b" },
  formation: { label:"Formation", color:"#14b8a6" },
  repos:     { label:"Repos",     color:"#a393aa" }
};
const HR_COL = { co:"#ff4f8b", plateau:"#8b5cf6", autre:"#ff8a3d", formation:"#14b8a6" };
const JOURS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
let hours = store.get("fc_hours", {});
let hrCfg = store.get("fc_hours_cfg", { contrat:35 });
const live = r => (r && !r.deleted ? r : null);
const saveHours = () => { store.set("fc_hours", hours); store.set("fc_hours_cfg", hrCfg); };

const pad = n => String(n).padStart(2, "0");
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
function weekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
}
const toMin = t => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function slotMin(s) {
  if (!s || !s.d || !s.f) return 0;
  const a = toMin(s.d), b = toMin(s.f);
  return b > a ? b - a : 0; // fin avant début = créneau invalide (signalé dans la fenêtre)
}
function fmtH(m, zero = "0h") {
  if (!m) return zero;
  const neg = m < 0; m = Math.abs(Math.round(m));
  const s = `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ""}`;
  return neg ? "-" + s : s;
}
function parseDur(str) {
  let s = String(str || "").trim().toLowerCase().replace(",", ".").replace(/\s+/g, "");
  if (!s) return 0;
  let m;
  if ((m = s.match(/^(\d{1,2})[h:](\d{1,2})?$/))) return +m[1] * 60 + (+m[2] || 0);
  if ((m = s.match(/^(\d{1,3})(min|mn|m)$/))) return +m[1];
  if ((m = s.match(/^(\d+\.\d+)h$/))) return Math.round(parseFloat(m[1]) * 60);
  if ((m = s.match(/^\d+(\.\d+)?$/))) return Math.round(parseFloat(s) * 60);
  return null;
}
function dayCalc(rec) {
  if (!rec || rec.deleted) return { total:0, co:0, plateau:0, autre:0, formation:0, status:null };
  const total = rec.status === "repos" ? 0 : slotMin(rec.s1) + slotMin(rec.s2);
  if (rec.status === "formation") return { total, co:0, plateau:0, autre:0, formation:total, status:rec.status };
  if (rec.status === "repos") return { total:0, co:0, plateau:0, autre:0, formation:0, status:"repos" };
  const co = rec.co || 0, plateau = rec.plateau || 0;
  return { total, co, plateau, autre:Math.max(0, total - co - plateau), formation:0, status:rec.status, over: co + plateau > total };
}
function sumDays(isos) {
  const t = { total:0, co:0, plateau:0, autre:0, formation:0, jours:0 };
  isos.forEach(iso => { const c = dayCalc(hours[iso]); ["total","co","plateau","autre","formation"].forEach(k => t[k] += c[k]); if (c.total) t.jours++; });
  return t;
}

let wkStart = mondayOf(new Date());
let editIso = null, draft = null;
let hrMode = store.get("fc_hr_mode", "semaine");   // "semaine" ou "mois" (propre à l'appareil)

function sumHtml(t, label, sub) {
  const tile = (k, v, c) => `<div class="tile" style="--tc:${c}"><div class="k"><i></i>${k}</div><div class="v">${fmtH(v)}</div></div>`;
  const pct = v => t.total ? (v / t.total * 100).toFixed(1) + "%" : "0";
  return `<div class="tile big"><div class="k">${label}</div><div class="v">${fmtH(t.total)}</div><div class="sub">${sub}</div>
    <div class="tw"><span>Au travail <b>${fmtH(t.total - t.formation)}</b></span><span>En formation <b>${fmtH(t.formation)}</b></span></div></div>` +
    tile("Cours collectifs", t.co, HR_COL.co) + tile("Plateau", t.plateau, HR_COL.plateau) +
    tile("Autres tâches", t.autre, HR_COL.autre) + tile("Formation", t.formation, HR_COL.formation) +
    `<div class="wk-bar" title="Répartition">${["co","plateau","autre","formation"].map(k => `<span style="width:${pct(t[k])};background:${HR_COL[k]}"></span>`).join("")}</div>`;
}
const joursTxt = n => `${n} jour${n > 1 ? "s" : ""} travaillé${n > 1 ? "s" : ""}`;

function renderWeek() {
  const mois = hrMode === "mois";
  $("#days").hidden = mois; $("#months").hidden = !mois;
  document.querySelectorAll("#hr-mode [data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === hrMode));
  $("#wk-today").textContent = mois ? "Ce mois" : "Cette semaine";
  if (mois) return renderMonth();
  const days = [...Array(7)].map((_, i) => addDays(wkStart, i));
  const isos = days.map(isoOf);
  const f = d => d.toLocaleDateString("fr-FR", { day:"numeric", month:"long" });
  $("#wk-title").textContent = `Semaine du ${f(days[0])} au ${f(days[6])}`;
  const monthIsos = $("#hr-month").value ? selectedMonthIsos() : monthIsosOfWeek(), month = dateOf(monthIsos[0]);
  const mt = sumDays(monthIsos);
  $("#wk-sub").textContent = `Semaine ${weekNumber(wkStart)} · Total ${month.toLocaleDateString("fr-FR", { month:"long" })} : ${fmtH(mt.total)}`;

  const t = sumDays(isos);
  const contrat = Math.round((parseFloat(hrCfg.contrat) || 0) * 60);
  const ecart = t.total - contrat;
  $("#wk-sum").innerHTML = sumHtml(t, "Total de la semaine",
    contrat ? (ecart === 0 ? "Pile les heures prévues" : ecart > 0 ? `${fmtH(ecart)} de plus que prévu (${fmtH(contrat)})` : `Encore ${fmtH(-ecart)} pour atteindre ${fmtH(contrat)}`) : joursTxt(t.jours));

  const today = isoOf(new Date());
  $("#days").innerHTML = days.map((d, i) => {
    const iso = isos[i], rec = live(hours[iso]), c = dayCalc(rec);
    const head = `<div class="dn"><span>${JOURS[i]}</span><span><small>${d.toLocaleDateString("fr-FR", { month:"short" })}</small> <b>${d.getDate()}</b></span></div>`;
    if (!rec) return `<button class="day empty ${iso === today ? "today" : ""}" data-iso="${iso}">${head}<div class="add"><span class="pl">${ic("plus", 20, 3)}</span>Ajouter</div></button>`;
    const st = HR_STATUS[rec.status] || HR_STATUS.travail;
    const slots = [rec.s1, rec.s2].filter(s => s && s.d && s.f).map(s => `${s.d} → ${s.f}`).join("<br>");
    const mini = rec.status === "travail"
      ? [["Cours co", c.co, HR_COL.co], ["Plateau", c.plateau, HR_COL.plateau], ["Autres", c.autre, HR_COL.autre]].filter(x => x[1]).map(([k, v, col]) => `<span style="--tc:${col}"><i></i>${k} ${fmtH(v)}</span>`).join("")
      : "";
    return `<button class="day ${rec.status === "repos" ? "repos" : ""} ${iso === today ? "today" : ""}" data-iso="${iso}" style="--sc:${st.color}">
      ${head}<span class="st">${st.label}</span>
      ${rec.status !== "repos" ? `<div class="tot">${fmtH(c.total)}</div><div class="slots">${slots || "Pas d'horaires"}</div>` : ""}
      <div class="mini">${mini}${rec.note ? `<span>${esc(rec.note.length > 40 ? rec.note.slice(0, 39) + "…" : rec.note)}</span>` : ""}</div>
      ${c.over ? `<span class="warn" title="Cours co + plateau dépassent le total">!</span>` : ""}
    </button>`;
  }).join("");
}

/* --- vue du mois : une carte par semaine, seuls les jours du mois comptent --- */
function renderMonth() {
  const isos = selectedMonthIsos(), first = dateOf(isos[0]), last = dateOf(isos[isos.length - 1]), mo = first.getMonth();
  const ml = first.toLocaleDateString("fr-FR", { month:"long", year:"numeric" });
  $("#wk-title").textContent = ml.charAt(0).toUpperCase() + ml.slice(1);
  const t = sumDays(isos);
  $("#wk-sub").textContent = `${joursTxt(t.jours)} · clique sur une semaine pour la modifier`;
  $("#wk-sum").innerHTML = sumHtml(t, "Total du mois", joursTxt(t.jours));
  const contrat = Math.round((parseFloat(hrCfg.contrat) || 0) * 60), today = isoOf(new Date());
  const f = d => d.toLocaleDateString("fr-FR", { day:"numeric", month:"short" });
  const weeks = []; for (let m = mondayOf(first); m <= last; m = addDays(m, 7)) weeks.push(m);
  $("#months").innerHTML = weeks.map(m => {
    const wd = [...Array(7)].map((_, i) => addDays(m, i)), inM = wd.filter(d => d.getMonth() === mo);
    const wt = sumDays(inM.map(isoOf)), ecart = wt.total - contrat;
    const cmp = contrat && inM.length === 7 && wt.total ? `<span class="${ecart < 0 ? "moins" : "plus"}">${ecart === 0 ? "pile le contrat" : (ecart > 0 ? "+" : "") + fmtH(ecart) + " / contrat"}</span>` : "";
    const cells = wd.map((d, i) => {
      const iso = isoOf(d), out = d.getMonth() !== mo, rec = out ? null : live(hours[iso]), c = dayCalc(rec);
      const col = rec ? (HR_STATUS[rec.status] || HR_STATUS.travail).color : "var(--line)";
      return `<span class="mc ${out ? "out" : ""} ${iso === today ? "today" : ""}" style="--sc:${col}"><small>${JOURS[i].slice(0, 3)} ${d.getDate()}</small><b>${out ? "" : !rec ? "–" : rec.status === "repos" ? "Repos" : fmtH(c.total, "–")}</b></span>`;
    }).join("");
    return `<button class="wk-card" data-wk="${isoOf(m)}">
      <div class="wk-card-h"><span>Semaine ${weekNumber(m)}<small>${inM.length > 1 ? `du ${f(inM[0])} au ${f(inM[inM.length - 1])}` : `le ${f(inM[0])}`}</small></span><b>${fmtH(wt.total)}${cmp}</b></div>
      ${wt.formation ? `<div class="wk-split">Au travail ${fmtH(wt.total - wt.formation)} · En formation ${fmtH(wt.formation)}</div>` : ""}
      <div class="mc-row">${cells}</div>
    </button>`;
  }).join("");
}
function setHrMode(m) { hrMode = m; store.set("fc_hr_mode", m); renderWeek(); }

/* --- éditeur d'une journée --- */
function openDay(iso) {
  editIso = iso;
  const rec = live(hours[iso]);
  draft = rec ? JSON.parse(JSON.stringify(rec)) : { status:"travail", s1:{ d:"", f:"" }, s2:{ d:"", f:"" }, co:0, plateau:0, note:"" };
  draft.s1 = draft.s1 || { d:"", f:"" }; draft.s2 = draft.s2 || { d:"", f:"" };
  const d = dateOf(iso);
  const long = d.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
  $("#dm-title").innerHTML = `${long.charAt(0).toUpperCase() + long.slice(1)}<small>${rec ? "Modifier la journée" : "Nouvelle journée"}</small>`;
  ["s1d","s1f","s2d","s2f"].forEach(id => $("#" + id).value = draft[id.slice(0, 2)][id[2]] || "");
  $("#dm-note").value = draft.note || "";
  $("#dm-co").value = draft.co ? fmtH(draft.co) : "";
  $("#dm-plateau").value = draft.plateau ? fmtH(draft.plateau) : "";
  refreshDay();
  draftStart = draftKey();
  $("#day-bg").classList.add("show");
}
let draftStart = "";
function draftKey() {
  return JSON.stringify([draft.status, $("#s1d").value, $("#s1f").value, $("#s2d").value, $("#s2f").value,
    $("#dm-co").value, $("#dm-plateau").value, $("#dm-note").value.trim()]);
}
function slotIssue() {
  if (draft.status === "repos") return "";
  const bad = [draft.s1, draft.s2].map((s, i) => {
    if (!s || (!s.d && !s.f)) return "";
    if (!s.d || !s.f) return `Créneau ${i + 1} : il manque ${!s.d ? "l'heure de début" : "l'heure de fin"}.`;
    if (toMin(s.f) <= toMin(s.d)) return `Créneau ${i + 1} : l'heure de fin est avant l'heure de début.`;
    return "";
  }).filter(Boolean);
  if (bad.length) return bad[0];
  const a = draft.s1, b = draft.s2;
  if (a && b && a.d && a.f && b.d && b.f && toMin(a.d) < toMin(b.f) && toMin(b.d) < toMin(a.f)) return "Les deux créneaux se chevauchent.";
  return "";
}
function refreshDay() {
  $("#dm-status").innerHTML = Object.entries(HR_STATUS).map(([k, v]) =>
    `<button data-st="${k}" class="${draft.status === k ? "on" : ""}" style="--sc:${v.color}">${v.label}</button>`).join("");
  $("#dm-times").hidden = draft.status === "repos";
  $("#dm-split-wrap").hidden = draft.status !== "travail";
  const total = slotMin(draft.s1) + slotMin(draft.s2);
  $("#dm-total").textContent = fmtH(total);
  const rest = total - (draft.co || 0) - (draft.plateau || 0);
  const r = $("#dm-rest");
  r.classList.toggle("bad", rest < 0);
  r.innerHTML = rest < 0
    ? `<i></i>Attention : cours co + plateau dépassent la journée de ${fmtH(-rest)}`
    : `<i></i>Autres tâches (accueil, ménage, réunions…) : <b>${fmtH(rest)}</b>`;
  const issue = slotIssue(), w = $("#dm-warn");
  w.hidden = !issue; w.textContent = issue;
}
function readDraftInputs() {
  draft.s1 = { d:$("#s1d").value, f:$("#s1f").value };
  draft.s2 = { d:$("#s2d").value, f:$("#s2f").value };
  draft.note = $("#dm-note").value.trim();
}
function saveDay() {
  readDraftInputs();
  const co = parseDur($("#dm-co").value), pl = parseDur($("#dm-plateau").value);
  if (co === null || pl === null) { toast("Durée non reconnue : écris par ex. 2h, 1h30 ou 1,5"); return false; }
  draft.co = co; draft.plateau = pl;
  const issue = slotIssue();
  if (issue) { toast(issue); return false; }
  if (draft.status === "travail" && !slotMin(draft.s1) && !slotMin(draft.s2) && !draft.note) { toast("Renseigne au moins un créneau (début et fin)"); return false; }
  draft.u = Date.now(); hours[editIso] = draft; saveHours(); renderWeek();
  return true;
}
function closeDay() { $("#day-bg").classList.remove("show"); editIso = null; }
function moveDay(n) {
  // les flèches enregistrent la journée en cours si elle a été modifiée
  if (draftKey() !== draftStart && !saveDay()) return;
  const next = isoOf(addDays(dateOf(editIso), n));
  const d = dateOf(next);
  if (d < wkStart || d >= addDays(wkStart, 7)) { wkStart = mondayOf(d); renderWeek(); }
  openDay(next);
}

/* --- exports --- */
function isosOfMonth(y, m) {
  const res = []; for (let d = new Date(y, m, 1); d.getMonth() === m; d = addDays(d, 1)) res.push(isoOf(d));
  return res;
}
function monthIsosOfWeek() { const ref = addDays(wkStart, 3); return isosOfMonth(ref.getFullYear(), ref.getMonth()); } // le jeudi décide du mois
function selectedMonthIsos() { const [y, m] = $("#hr-month").value.split("-").map(Number); return isosOfMonth(y, m - 1); }
function fillMonthSelect(selected) {
  const now = new Date(), opts = [];
  for (let i = -12; i <= 2; i++) { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); opts.push(d); }
  Object.keys(hours).concat(selected ? [selected + "-01"] : []).forEach(iso => { const d = dateOf(iso); if (!opts.some(o => o.getFullYear() === d.getFullYear() && o.getMonth() === d.getMonth())) opts.push(new Date(d.getFullYear(), d.getMonth(), 1)); });
  opts.sort((a, b) => b - a);
  $("#hr-month").innerHTML = opts.map(d => {
    const v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, l = d.toLocaleDateString("fr-FR", { month:"long", year:"numeric" });
    return `<option value="${v}" ${v === selected ? "selected" : ""}>${l.charAt(0).toUpperCase() + l.slice(1)}</option>`;
  }).join("");
}
function rowOf(iso) {
  const d = dateOf(iso), rec = live(hours[iso]), c = dayCalc(rec);
  const sl = s => s && s.d && s.f ? `${s.d} - ${s.f}` : "";
  return {
    jour: JOURS[(d.getDay() + 6) % 7], date: d.toLocaleDateString("fr-FR"),
    statut: rec ? (HR_STATUS[rec.status] || HR_STATUS.travail).label : "", c1: rec && rec.status !== "repos" ? sl(rec.s1) : "", c2: rec && rec.status !== "repos" ? sl(rec.s2) : "",
    c, note: rec ? rec.note || "" : ""
  };
}
function exportHoursPDF(isos, titre, sousTitre) {
  if (!isos.some(i => live(hours[i]))) { toast("Aucune heure renseignée sur cette période"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
  const stops = [[255,79,139],[255,138,92],[255,179,71]], N = 120, HH = 28;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), seg = t < .5 ? 0 : 1, lt = t < .5 ? t * 2 : (t - .5) * 2;
    doc.setFillColor(...stops[seg].map((v, j) => Math.round(v + (stops[seg + 1][j] - v) * lt))); doc.rect(W * i / N, 0, W / N + .3, HH, "F");
  }
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("RELEVÉ D'HEURES", M, 10, { charSpace:1 });
  doc.setFontSize(20); doc.text(pdfText(titre), M, 20.5);
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  [state.info.coach ? "Coach : " + state.info.coach : "", sousTitre].filter(Boolean).forEach((t, i) => doc.text(pdfText(t), W - M, 11 + i * 5.5, { align:"right" }));

  // tableau (avec sous-totaux par semaine sur le mois)
  const body = []; let wk = [];
  const flush = () => {
    if (isos.length > 7 && wk.length) {
      const s = sumDays(wk);
      body.push([{ content:`Total semaine ${weekNumber(dateOf(wk[0]))}`, colSpan:5, styles:{ fontStyle:"bold", fillColor:[255,230,241] } },
        ...[s.total, s.co, s.plateau, s.autre, s.formation].map(v => ({ content:fmtH(v, ""), styles:{ fontStyle:"bold", fillColor:[255,230,241] } })),
        { content:"", styles:{ fillColor:[255,230,241] } }]);
    }
    wk = [];
  };
  isos.forEach((iso, i) => {
    const r = rowOf(iso);
    body.push([r.jour, r.date, r.statut, r.c1, r.c2, fmtH(r.c.total, ""), fmtH(r.c.co, ""), fmtH(r.c.plateau, ""), fmtH(r.c.autre, ""), fmtH(r.c.formation, ""), pdfText(r.note)]);
    wk.push(iso);
    if (dateOf(iso).getDay() === 0 || i === isos.length - 1) flush();
  });
  doc.autoTable({
    startY: HH + 6, margin:{ left:M, right:M, top:14, bottom:34 },
    head:[["Jour","Date","Statut","Créneau 1","Créneau 2","Total","Cours co","Plateau","Autres","Formation","Note"]],
    body, theme:"grid",
    styles:{ font:"helvetica", fontSize:8.5, cellPadding:2, textColor:[42,20,51], lineColor:[246,210,226], lineWidth:.25, valign:"middle", halign:"center" },
    headStyles:{ fillColor:[232,54,122], textColor:255, fontStyle:"bold" },
    alternateRowStyles:{ fillColor:[255,246,250] },
    columnStyles:{ 0:{ halign:"left", fontStyle:"bold", cellWidth:22 }, 1:{ cellWidth:22 }, 2:{ cellWidth:21 }, 3:{ cellWidth:26 }, 4:{ cellWidth:26 },
      5:{ fontStyle:"bold", cellWidth:18 }, 6:{ cellWidth:18, textColor:[232,54,122] }, 7:{ cellWidth:18, textColor:[124,77,219] }, 8:{ cellWidth:18 }, 9:{ cellWidth:20 }, 10:{ halign:"left" } }
  });
  // récapitulatif
  let y = doc.lastAutoTable.finalY + 8;
  if (y > H - 40) { doc.addPage(); y = 18; }
  const s = sumDays(isos);
  const boxes = [["TOTAL", s.total, [232,54,122]], ["Au travail", s.total - s.formation, [42,20,51]], ["Cours collectifs", s.co, [255,79,139]], ["Plateau", s.plateau, [139,92,246]], ["Autres tâches", s.autre, [255,138,61]], ["Formation", s.formation, [20,184,166]]];
  const bw = (W - 2 * M - (boxes.length - 1) * 5) / boxes.length;
  boxes.forEach(([k, v, col], i) => {
    const x = M + i * (bw + 5);
    doc.setFillColor(...col); doc.roundedRect(x, y, bw, 16, 3, 3, "F");
    doc.setTextColor(255,255,255); doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.text(k, x + 5, y + 5.8);
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text(fmtH(v), x + 5, y + 12.8);
  });
  // signatures
  y += 24;
  if (y < H - 22) {
    doc.setTextColor(107,88,115); doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text("Signature de l'alternante :", M, y); doc.text("Signature du tuteur :", W / 2 + 4, y);
    doc.setDrawColor(246,210,226); doc.roundedRect(M, y + 2, W / 2 - M - 4, 14, 2, 2); doc.roundedRect(W / 2 + 4, y + 2, W / 2 - M - 4, 14, 2, 2);
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setDrawColor(255,79,139); doc.setLineWidth(.6); doc.line(M, H - 9, W - M, H - 9);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(163,147,170);
    doc.text(pdfText(`Relevé d'heures${state.info.coach ? " · " + state.info.coach : ""}`), M, H - 5);
    doc.text(`Page ${p} / ${pages}`, W - M, H - 5, { align:"right" });
  }
  const slug = norm(titre).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`Heures_${slug}.pdf`);
  toast("PDF des heures exporté !");
}
function exportCSV() {
  const isos = selectedMonthIsos();
  if (!isos.some(i => live(hours[i]))) { toast("Aucune heure renseignée ce mois-ci"); return; }
  const dec = m => m ? (m / 60).toFixed(2).replace(".", ",") : "";
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Jour","Date","Statut","Début 1","Fin 1","Début 2","Fin 2","Total (h)","Cours co (h)","Plateau (h)","Autres (h)","Formation (h)","Note"]];
  isos.forEach(iso => {
    const r = rowOf(iso), rec = live(hours[iso]) || {};
    const on = rec.status && rec.status !== "repos";
    rows.push([r.jour, r.date, r.statut, on ? rec.s1?.d || "" : "", on ? rec.s1?.f || "" : "", on ? rec.s2?.d || "" : "", on ? rec.s2?.f || "" : "",
      dec(r.c.total), dec(r.c.co), dec(r.c.plateau), dec(r.c.autre), dec(r.c.formation), r.note]);
  });
  const s = sumDays(isos);
  rows.push(["TOTAL","","","","","","", dec(s.total), dec(s.co), dec(s.plateau), dec(s.autre), dec(s.formation), ""]);
  const csv = "﻿" + rows.map(r => r.map(q).join(";")).join("\r\n");
  const ref = dateOf(isos[0]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
  a.download = `Heures_${ref.getFullYear()}-${pad(ref.getMonth() + 1)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Fichier Excel téléchargé");
}

/* --- onglets --- */
function showView(v) {
  $("#view-fiche").hidden = v !== "fiche";
  $("#view-horaires").hidden = v !== "horaires";
  $("#view-saved").hidden = v !== "saved";
  $("#view-probs").hidden = v !== "probs";
  if (v === "probs") renderProbs();
  if (v === "saved") renderSaved();
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  const nav = $("#tabs"), on = nav.querySelector("button.on");   // sur mobile, l'onglet actif reste visible
  if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  store.set("fc_view", v);
  if (v === "horaires") renderWeek();
}

function initHoraires() {
  $("#tabs").addEventListener("click", ev => { const b = ev.target.closest("[data-view]"); if (b) showView(b.dataset.view); });
  const syncMonth = () => { const r = addDays(wkStart, 3); fillMonthSelect(`${r.getFullYear()}-${pad(r.getMonth() + 1)}`); };
  fillMonthSelect(`${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`);
  const shiftMonth = n => { const [y, m] = $("#hr-month").value.split("-").map(Number), d = new Date(y, m - 1 + n, 1); fillMonthSelect(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const step = n => { if (hrMode === "mois") shiftMonth(n); else { wkStart = addDays(wkStart, 7 * n); syncMonth(); } renderWeek(); };
  $("#wk-prev").addEventListener("click", () => step(-1));
  $("#wk-next").addEventListener("click", () => step(1));
  $("#hr-mode").addEventListener("click", ev => { const b = ev.target.closest("[data-mode]"); if (b) setHrMode(b.dataset.mode); });
  $("#months").addEventListener("click", ev => { const w = ev.target.closest("[data-wk]"); if (w) { wkStart = dateOf(w.dataset.wk); setHrMode("semaine"); } });
  $("#wk-today").addEventListener("click", () => { wkStart = mondayOf(new Date()); fillMonthSelect(`${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`); renderWeek(); });
  $("#days").addEventListener("click", ev => { const d = ev.target.closest(".day"); if (d) openDay(d.dataset.iso); });
  $("#hr-month").addEventListener("change", renderWeek);
  const c = $("#hr-contrat"); c.value = hrCfg.contrat ?? "";
  c.addEventListener("input", () => { hrCfg.contrat = c.value; saveHours(); renderWeek(); });

  $("#dm-status").addEventListener("click", ev => { const b = ev.target.closest("[data-st]"); if (!b) return; readDraftInputs(); draft.status = b.dataset.st; refreshDay(); });
  ["s1d","s1f","s2d","s2f"].forEach(id => $("#" + id).addEventListener("input", () => { readDraftInputs(); refreshDay(); }));
  document.querySelectorAll("#day-bg .clr").forEach(b => b.addEventListener("click", () => {
    $(`#s${b.dataset.clr}d`).value = ""; $(`#s${b.dataset.clr}f`).value = ""; readDraftInputs(); refreshDay();
  }));
  document.querySelectorAll("#day-bg .dur").forEach(box => {
    const k = box.dataset.k, input = $("input", box);
    box.addEventListener("click", ev => {
      const b = ev.target.closest("[data-d]"); if (!b) return;
      const cur = parseDur(input.value) || 0;
      draft[k] = Math.max(0, cur + Number(b.dataset.d)); input.value = draft[k] ? fmtH(draft[k]) : ""; refreshDay();
    });
    input.addEventListener("input", () => { const v = parseDur(input.value); if (v !== null) { draft[k] = v; refreshDay(); } });
    input.addEventListener("blur", () => { const v = parseDur(input.value); if (v !== null) input.value = v ? fmtH(v) : ""; });
  });
  $("#dm-save").addEventListener("click", () => { if (saveDay()) { closeDay(); toast("Journée enregistrée"); } });
  $("#dm-prev").addEventListener("click", () => moveDay(-1));
  $("#dm-next").addEventListener("click", () => moveDay(1));
  $("#dm-clear").addEventListener("click", () => {
    if (live(hours[editIso]) && !confirm("Effacer les horaires de cette journée ?")) return;
    hours[editIso] = { deleted:true, u:Date.now() }; saveHours(); renderWeek(); closeDay(); toast("Journée effacée");
  });
  $("#dm-copy").addEventListener("click", () => {
    let d = dateOf(editIso), src = null;
    for (let i = 1; i <= 14 && !src; i++) { const iso = isoOf(addDays(d, -i)); if (live(hours[iso]) && hours[iso].status !== "repos") src = hours[iso]; }
    if (!src) { toast("Aucune journée précédente à copier"); return; }
    const note = $("#dm-note").value;
    draft = JSON.parse(JSON.stringify(src)); draft.note = note; delete draft.u;
    ["s1d","s1f","s2d","s2f"].forEach(id => $("#" + id).value = draft[id.slice(0, 2)]?.[id[2]] || "");
    $("#dm-co").value = draft.co ? fmtH(draft.co) : ""; $("#dm-plateau").value = draft.plateau ? fmtH(draft.plateau) : "";
    refreshDay(); toast("Horaires copiés, pense à enregistrer");
  });
  $("#day-bg").addEventListener("click", ev => { if (ev.target.id === "day-bg") closeDay(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && $("#day-bg").classList.contains("show")) closeDay(); });

  $("#hr-pdf-week").addEventListener("click", () => {
    const isos = [...Array(7)].map((_, i) => isoOf(addDays(wkStart, i)));
    const f = d => d.toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });
    exportHoursPDF(isos, `Semaine ${weekNumber(wkStart)}`, `Du ${f(wkStart)} au ${f(addDays(wkStart, 6))}`);
  });
  $("#hr-pdf-month").addEventListener("click", () => {
    const isos = selectedMonthIsos(); const m = dateOf(isos[0]).toLocaleDateString("fr-FR", { month:"long", year:"numeric" });
    exportHoursPDF(isos, m.charAt(0).toUpperCase() + m.slice(1), `${isos.length} jours`);
  });
  $("#hr-csv").addEventListener("click", exportCSV);

  const start = location.hash === "#horaires" ? "horaires" : location.hash === "#enregistrements" ? "saved" : location.hash === "#problematiques" ? "probs" : store.get("fc_view", "fiche");
  showView(["horaires", "saved", "probs"].includes(start) ? start : "fiche");
}

/* ============ MES ENREGISTREMENTS (fiches sauvegardées) ============ */
let saved = store.get("fc_saved", {});          // { id: { id, title, desc, created, u, info, sections } }
const liveF = r => (r && !r.deleted ? r : null);
const saveSaved = () => store.set("fc_saved", saved);
const savedList = () => Object.values(saved).filter(liveF).sort((a, b) => (b.u || 0) - (a.u || 0));
// catégorie d'une fiche enregistrée (champ facultatif « cat ») : 3 au choix, ou un nom écrit à la main
const FICHE_CATS = { "Cross Training":"#f43f5e", "Abdos-Fessiers":"#db2777", "Intégral":"#6366f1" };
const catColor = c => FICHE_CATS[c] || "#a855f7";
let svCat = "";   // filtre de « Mes enregistrements » : "" = toutes, "__none" = sans catégorie
function catOptions(sel) {
  const customs = [...new Set(savedList().map(f => f.cat).concat(sel).filter(c => c && !FICHE_CATS[c] && c !== "__autre"))].sort();
  return [["", "Sans catégorie"], ...Object.keys(FICHE_CATS).concat(customs).map(c => [c, c]), ["__autre", "Autre (à écrire)…"]]
    .map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
}

// copie complète de la fiche en cours (avec une copie des exercices perso, au cas où ils seraient supprimés plus tard)
function snapshotFiche() {
  const sections = {};
  SECTIONS.forEach(s => {
    const sec = state.sections[s.key];
    sections[s.key] = { on: !!sec.on, items: sec.items.map(it => {
      const o = { uid:it.uid, id:it.id, blocs:+it.blocs || 1 };
      const ex = exOf(it);
      if (ex && (ex._perso || String(it.id).startsWith("perso-"))) o.snap = { n:ex.n, c:ex.c, v:ex.v || "", p:ex.p || "", m:ex.m || "", r:ex.r || "", s:ex.s || "" };
      return o;
    }) };
  });
  return { info:{ ...state.info }, sections, active:state.active };
}
function ficheStats(f) {
  let n = 0, b = 0; const parts = [];
  SECTIONS.forEach(s => {
    const sec = f.sections && f.sections[s.key];
    if (!sec || !sec.on || !sec.items.length) return;
    n += sec.items.length; sec.items.forEach(it => b += +it.blocs || 0);
    parts.push({ s, n:sec.items.length });
  });
  const bs = blocSec(f.info);
  return { n, b, parts, dur: bs ? fmtSec(b * bs) : "" };
}
const sameFiche = (a, b) => JSON.stringify(SECTIONS.map(s => (a.sections[s.key] || {}).items?.map(it => [it.id, +it.blocs]) || []))
                         === JSON.stringify(SECTIONS.map(s => (b.sections[s.key] || {}).items?.map(it => [it.id, +it.blocs]) || []));
// la fiche en cours contient-elle des choses non enregistrées ?
function ficheDirty() {
  const has = SECTIONS.some(s => state.sections[s.key].items.length);
  if (!has) return false;
  const rec = liveF(saved[state.editingId]);
  return !rec || !sameFiche(rec, state);
}

function updateBanner() {
  const rec = liveF(saved[state.editingId]);
  if (state.editingId && !rec) state.editingId = null;
  $("#edit-banner").hidden = !rec;
  if (rec) $("#edit-banner-txt").textContent = `Tu modifies « ${rec.title} ». En enregistrant avec le même titre, elle sera mise à jour (l'ancienne version reste récupérable). Avec un autre titre, ce sera une nouvelle fiche.`;
  $("#btn-save-lbl").textContent = "Enregistrer";
  const n = savedList().length;
  $("#sv-count").textContent = n || "";
  const nt = trashList().length;
  $("#sv-trash-n").textContent = nt ? ` (${nt})` : "";
}

function renderSaved() {
  updateBanner();
  const q = norm($("#sv-search").value);
  const all = savedList(), count = c => all.filter(f => c === "__none" ? !f.cat : f.cat === c).length;
  const used = [...new Set(all.map(f => f.cat).filter(c => c && !FICHE_CATS[c]))].sort();
  $("#sv-cats").innerHTML = !all.length ? "" : [["", "Toutes", all.length]]
    .concat(Object.keys(FICHE_CATS).concat(used).map(c => [c, c, count(c)]), count("__none") ? [["__none", "Sans catégorie", count("__none")]] : [])
    .map(([v, l, n]) => `<button class="chip ${svCat === v ? "on" : ""}" data-cat="${esc(v)}">${v && v !== "__none" ? `<span class="dot" style="background:${catColor(v)}"></span>` : ""}${esc(l)} · ${n}</button>`).join("");
  const list = all.filter(f => (!svCat || (svCat === "__none" ? !f.cat : f.cat === svCat)) &&
    (!q || norm([f.title, f.desc, f.cat, f.info && f.info.cours].join(" ")).includes(q)));
  const box = $("#sv-list");
  if (!list.length) {
    box.innerHTML = q || svCat
      ? `<div class="sv-empty"><b>Aucune fiche trouvée</b>${svCat ? "Rien dans cette catégorie pour l'instant." : "Essaie un autre mot."}</div>`
      : `<div class="sv-empty"><b>Aucune fiche enregistrée pour l'instant</b>Prépare ta fiche dans l'onglet « Fiche de cours », puis clique sur « Enregistrer » en bas.</div>`;
    return;
  }
  const fd = ts => new Date(ts).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" });
  box.innerHTML = list.map(f => {
    const st = ficheStats(f), info = f.info || {};
    return `<article class="sv-card ${f.id === state.editingId ? "cur" : ""}" data-id="${esc(f.id)}">
      ${f.id === state.editingId ? `<span class="flag">En cours</span>` : ""}
      <div><h3>${esc(f.title)}</h3><div class="when">Modifiée le ${fd(f.u || f.created)}</div></div>
      <select class="sv-cat" aria-label="Catégorie de la fiche" style="--tc:${f.cat ? catColor(f.cat) : "var(--muted)"}">${catOptions(f.cat || "")}</select>
      <div class="chips2">
        ${info.cours ? `<span>${esc(info.cours)}</span>` : ""}
        ${info.bpm ? `<span>${esc(info.bpm)} BPM</span>` : ""}
        ${st.parts.map(p => `<span style="--tc:${p.s.color}"><i></i>${p.s.label} · ${p.n}</span>`).join("")}
      </div>
      <div class="desc ${f.desc ? "" : "empty"}">${f.desc ? esc(f.desc) : "Pas de description"}</div>
      <div class="stat"><b>${st.n}</b> exercice${st.n > 1 ? "s" : ""} · <b>${st.b}</b> bloc${st.b > 1 ? "s" : ""}${st.dur ? ` · <b>${st.dur}</b>` : ""}</div>
      <div class="acts">
        <button class="btn btn-main" data-act="pdf"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>PDF</button>
        <button class="btn btn-violet" data-act="edit">${ic("edit", 16, 2.6)}Éditer</button>
        ${(f.versions || []).length ? `<button class="icon-btn" data-act="versions" title="Versions précédentes (${f.versions.length})" aria-label="Versions précédentes"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg></button>` : ""}
        <button class="icon-btn" data-act="del" title="Supprimer" aria-label="Supprimer">${ic("x", 17, 2.6)}</button>
      </div>
    </article>`;
  }).join("");
}

function openSaveModal() {
  const st = ficheStats(state);
  if (!st.n) { toast("Ajoute au moins un exercice avant d'enregistrer"); return; }
  const rec = liveF(saved[state.editingId]);
  const dfr = state.info.date ? dateOf(state.info.date).toLocaleDateString("fr-FR", { day:"numeric", month:"short" }) : "";
  $("#sv-title").textContent = rec ? "Enregistrer ma fiche" : "Enregistrer ma fiche";
  $("#sv-name").value = rec ? rec.title : [state.info.cours || "Ma fiche", dfr].filter(Boolean).join(" – ");
  $("#sv-desc").value = rec ? rec.desc || "" : "";
  const guess = Object.keys(FICHE_CATS).find(c => norm(c) === norm(state.info.cours || "")) || "";   // ex : fiche express « Intégral »
  $("#sv-cat").innerHTML = catOptions(rec ? rec.cat || "" : guess);
  $("#sv-cat-txt").value = ""; $("#sv-cat-txt").hidden = true;
  $("#sv-recap").textContent = `${st.n} exercice${st.n > 1 ? "s" : ""} · ${st.b} bloc${st.b > 1 ? "s" : ""}${st.dur ? " · " + st.dur : ""}`;
  refreshSaveButtons();
  $("#save-bg").classList.add("show");
  setTimeout(() => { $("#sv-name").focus(); $("#sv-name").select(); }, 60);
}
// Si on modifie une fiche enregistrée : même titre → « Mettre à jour » (l'ancienne version est gardée dans l'historique),
// titre différent → « Enregistrer comme nouvelle fiche » par défaut. Le remplacement n'est jamais le choix implicite.
function saveMode() {
  const rec = liveF(saved[state.editingId]);
  if (!rec) return { primary:"new" };
  return { primary: $("#sv-name").value.trim() === rec.title ? "update" : "new", rec };
}
function refreshSaveButtons() {
  const m = saveMode();
  const ok = $("#sv-ok"), alt = $("#sv-asnew"), hint = $("#sv-mode");
  if (!m.rec) { ok.textContent = "Enregistrer"; ok.dataset.mode = "new"; alt.hidden = true; hint.hidden = true; return; }
  alt.hidden = false; hint.hidden = false;
  if (m.primary === "update") {
    ok.textContent = "Mettre à jour"; ok.dataset.mode = "update";
    alt.textContent = "Enregistrer comme nouvelle"; alt.dataset.mode = "new";
    hint.textContent = `Tu remplaces « ${m.rec.title} ». Pas d'inquiétude : l'ancienne version reste récupérable (bouton ↺ sur la fiche).`;
  } else {
    ok.textContent = "Enregistrer comme nouvelle"; ok.dataset.mode = "new";
    alt.textContent = `Remplacer « ${m.rec.title.length > 28 ? m.rec.title.slice(0, 27) + "…" : m.rec.title} »`; alt.dataset.mode = "update";
    hint.textContent = `Nouveau titre : une nouvelle fiche sera créée, « ${m.rec.title} » est gardée telle quelle.`;
  }
}
const MAX_VERSIONS = 5;
function trimForSync(rec) {   // une case du Google Sheets = 50 000 caractères max : on retire les plus vieilles versions si besoin
  while (rec.versions && rec.versions.length && JSON.stringify(rec).length > 44000) rec.versions.pop();
  return rec;
}
function doSave(mode) {
  const title = $("#sv-name").value.trim();
  if (!title) { toast("Donne un titre à ta fiche"); $("#sv-name").focus(); return; }
  const cat = $("#sv-cat").value === "__autre" ? $("#sv-cat-txt").value.trim().slice(0, 40) : $("#sv-cat").value;
  if ($("#sv-cat").value === "__autre" && !cat) { toast("Écris le nom de la catégorie"); $("#sv-cat-txt").focus(); return; }
  const old = mode === "update" ? liveF(saved[state.editingId]) : null;
  const id = old ? old.id : "f-" + Date.now().toString(36) + uid().slice(0, 4);
  const now = Date.now();
  let versions = [];
  if (old) {   // l'ancienne version part dans l'historique de la fiche
    const { versions:prev = [], ...ancienne } = old;
    versions = [{ ...ancienne, savedAt: old.u || now }].concat(prev).slice(0, MAX_VERSIONS);
  }
  saved[id] = trimForSync({ id, title, desc:$("#sv-desc").value.trim(), cat, created: old ? old.created : now, u:now, ...snapshotFiche(), versions });
  state.editingId = id; save(); saveSaved();
  $("#save-bg").classList.remove("show");
  renderSaved();
  toast(old ? "Fiche mise à jour (l'ancienne version est gardée)" : "Fiche enregistrée dans « Mes enregistrements »");
}

/* --- historique des versions d'une fiche --- */
let verFor = null;
function openVersions(id) {
  const rec = liveF(saved[id]); if (!rec) return;
  verFor = id;
  const fd = ts => new Date(ts).toLocaleString("fr-FR", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  $("#ver-title").textContent = `Versions de « ${rec.title} »`;
  $("#ver-list").innerHTML = (rec.versions || []).map((v, i) => {
    const st = ficheStats(v);
    return `<li class="ver-item" data-i="${i}">
      <div class="ver-main"><b>${esc(v.title)}</b><small>Version du ${fd(v.savedAt || v.u)} · ${st.n} exercice${st.n > 1 ? "s" : ""} · ${st.b} bloc${st.b > 1 ? "s" : ""}${st.dur ? " · " + st.dur : ""}</small></div>
      <button class="btn btn-ghost btn-sm" data-vact="pdf">PDF</button>
      <button class="btn btn-violet btn-sm" data-vact="restore">Restaurer</button>
    </li>`;
  }).join("") || `<li class="sv-empty">Pas encore d'ancienne version.</li>`;
  $("#ver-bg").classList.add("show");
}
function restoreVersion(i) {
  const rec = liveF(saved[verFor]); if (!rec) return;
  const v = rec.versions[i]; if (!v) return;
  if (!confirm(`Revenir à la version du ${new Date(v.savedAt || v.u).toLocaleDateString("fr-FR")} ? La version actuelle sera gardée dans l'historique.`)) return;
  const { versions:prev = [], ...actuelle } = rec;
  const rest = prev.filter((_, k) => k !== i);
  const { savedAt, ...vv } = v;
  saved[verFor] = trimForSync({ ...vv, id:verFor, u:Date.now(), versions:[{ ...actuelle, savedAt: rec.u }].concat(rest).slice(0, MAX_VERSIONS) });
  saveSaved(); renderSaved(); $("#ver-bg").classList.remove("show");
  if (state.editingId === verFor) loadFiche(saved[verFor]);
  toast("Version restaurée");
}

/* --- corbeille & récupération --- */
const trashList = () => Object.entries(saved).filter(([, r]) => r && r.deleted && r.trash).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.u - a.u);
function openTrash() {
  const t = trashList();
  $("#trash-list").innerHTML = t.map(r => `<li class="ver-item" data-id="${esc(r.id)}">
      <div class="ver-main"><b>${esc(r.trash.title)}</b><small>Supprimée le ${new Date(r.u).toLocaleDateString("fr-FR")} · ${ficheStats(r.trash).n} exercices</small></div>
      <button class="btn btn-violet btn-sm" data-tact="restore">Restaurer</button>
      <button class="icon-btn" data-tact="purge" title="Supprimer définitivement" aria-label="Supprimer définitivement">${ic("x", 16, 2.6)}</button>
    </li>`).join("") || `<li class="sv-empty">La corbeille est vide.</li>`;
  $("#trash-paste").value = "";
  $("#trash-bg").classList.add("show");
}
function importPastedFiche() {
  const txt = $("#trash-paste").value.trim();
  if (!txt) { toast("Colle d'abord le contenu de la case"); return; }
  let f;
  try { f = JSON.parse(txt); } catch (e) { toast("Ce texte n'est pas reconnu : copie bien toute la case de la colonne _data"); return; }
  if (f.deleted && f.trash) f = f.trash;
  if (!f || !f.sections) { toast("Ce texte ne contient pas de fiche"); return; }
  const id = "f-" + Date.now().toString(36) + uid().slice(0, 4), now = Date.now();
  saved[id] = trimForSync({ ...f, id, title:(f.title || "Fiche") + " (récupérée)", created:f.created || now, u:now });
  saveSaved(); renderSaved(); $("#trash-bg").classList.remove("show");
  toast("Fiche récupérée : elle est dans « Mes enregistrements »");
}

function loadFiche(rec) {
  state.info = { ...state.info, ...JSON.parse(JSON.stringify(rec.info || {})) };
  SECTIONS.forEach(s => {
    const sec = rec.sections && rec.sections[s.key];
    state.sections[s.key] = sec ? { on:!!sec.on, items:sec.items.map(it => ({ ...JSON.parse(JSON.stringify(it)), uid:uid() })) } : { on:false, items:[] };
  });
  state.active = rec.active || "echauf";
  state.editingId = rec.id;
  save();
  for (const [k, sel] of Object.entries(INFO_FIELDS)) $(sel).value = state.info[k] || "";
  renderBpmHint(); renderToggles(); renderBubbles(); renderSaved();
  showView("fiche"); window.scrollTo({ top:0, behavior:"smooth" });
}
function editFiche(id) {
  const rec = liveF(saved[id]); if (!rec) return;
  if (state.editingId !== id && ficheDirty() && !confirm("Ta fiche en cours n'est pas enregistrée. La remplacer par « " + rec.title + " » ?")) return;
  loadFiche(rec);
  toast(`« ${rec.title} » ouverte : modifie-la puis clique sur « Mettre à jour »`);
}
function newFiche() {
  if (ficheDirty() && !confirm("Ta fiche en cours n'est pas enregistrée. Commencer une nouvelle fiche vide ?")) return;
  state.info = { cours:"", date:todayISO(), coach:state.info.coach || "", duree:"", bpm:state.info.bpm || "128", notes:"" };
  state.sections = { echauf:{ on:true, items:[] }, corps:{ on:false, items:[] }, retour:{ on:false, items:[] } };
  state.active = "echauf"; state.editingId = null; save();
  for (const [k, sel] of Object.entries(INFO_FIELDS)) $(sel).value = state.info[k] || "";
  renderBpmHint(); renderToggles(); renderBubbles(); renderSaved();
  showView("fiche"); window.scrollTo({ top:0, behavior:"smooth" });
  toast("Nouvelle fiche vide");
}

function initSaved() {
  renderSaved();
  $("#btn-save").addEventListener("click", openSaveModal);
  $("#sv-ok").addEventListener("click", () => doSave($("#sv-ok").dataset.mode));
  $("#sv-asnew").addEventListener("click", () => {
    const m = $("#sv-asnew").dataset.mode, rec = liveF(saved[state.editingId]);
    if (m === "update" && rec && !confirm(`Remplacer « ${rec.title} » par cette fiche ? (L'ancienne version restera dans son historique.)`)) return;
    doSave(m);
  });
  $("#sv-name").addEventListener("input", refreshSaveButtons);
  $("#sv-trash").addEventListener("click", openTrash);
  $("#trash-import").addEventListener("click", importPastedFiche);
  ["ver", "trash"].forEach(k => {
    $(`#${k}-bg`).addEventListener("click", ev => { if (ev.target.id === `${k}-bg` || ev.target.closest(`[data-close-${k}]`)) $(`#${k}-bg`).classList.remove("show"); });
  });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") { $("#ver-bg").classList.remove("show"); $("#trash-bg").classList.remove("show"); } });
  $("#ver-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-vact]"); if (!b) return;
    const i = +b.closest(".ver-item").dataset.i, rec = liveF(saved[verFor]); if (!rec) return;
    if (b.dataset.vact === "pdf") exportPDF(rec.versions[i]);
    if (b.dataset.vact === "restore") restoreVersion(i);
  });
  $("#trash-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-tact]"); if (!b) return;
    const id = b.closest(".ver-item").dataset.id, r = saved[id]; if (!r || !r.trash) return;
    if (b.dataset.tact === "restore") { saved[id] = { ...r.trash, id, u:Date.now() }; toast(`« ${r.trash.title} » est revenue`); }
    if (b.dataset.tact === "purge") { if (!confirm("Supprimer définitivement cette fiche ?")) return; saved[id] = { deleted:true, u:Date.now() }; }
    saveSaved(); renderSaved(); openTrash();
  });
  $("#sv-cancel").addEventListener("click", () => $("#save-bg").classList.remove("show"));
  $("#save-bg").addEventListener("click", ev => { if (ev.target.id === "save-bg") $("#save-bg").classList.remove("show"); });
  $("#sv-name").addEventListener("keydown", ev => { if (ev.key === "Enter") doSave($("#sv-ok").dataset.mode); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") $("#save-bg").classList.remove("show"); });
  $("#sv-search").addEventListener("input", renderSaved);
  $("#sv-new").addEventListener("click", newFiche);
  $("#btn-newfiche").addEventListener("click", newFiche);
  $("#sv-cat").addEventListener("change", () => { const t = $("#sv-cat-txt"); t.hidden = $("#sv-cat").value !== "__autre"; if (!t.hidden) t.focus(); });
  $("#sv-cats").addEventListener("click", ev => { const b = ev.target.closest("[data-cat]"); if (b) { svCat = b.dataset.cat; renderSaved(); } });
  $("#sv-list").addEventListener("change", ev => {   // changer la catégorie directement depuis la carte
    const sel = ev.target.closest(".sv-cat"); if (!sel) return;
    const rec = liveF(saved[sel.closest(".sv-card").dataset.id]); if (!rec) return;
    let cat = sel.value;
    if (cat === "__autre") { const t = prompt("Nom de la catégorie :"); if (!t || !t.trim()) { renderSaved(); return; } cat = t.trim().slice(0, 40); }
    rec.cat = cat; rec.u = Date.now(); saveSaved(); renderSaved();
    toast(cat ? `Fiche rangée dans « ${cat} »` : "Catégorie retirée");
  });
  $("#sv-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const id = b.closest(".sv-card").dataset.id, rec = liveF(saved[id]); if (!rec) return;
    if (b.dataset.act === "pdf") exportPDF(rec);
    if (b.dataset.act === "edit") editFiche(id);
    if (b.dataset.act === "versions") openVersions(id);
    if (b.dataset.act === "del") {
      if (!confirm(`Supprimer la fiche « ${rec.title} » ?`)) return;
      const { versions, ...copie } = rec;   // gardée dans la corbeille, récupérable
      saved[id] = { deleted:true, u:Date.now(), trash:copie };
      if (state.editingId === id) { state.editingId = null; save(); }
      saveSaved(); renderSaved(); toast("Fiche mise dans la corbeille");
    }
  });
}

/* ============ PROBLÉMATIQUES ============ */
const PB_LEVELS = {
  1: { label:"Priorité 1", color:"#ef4444", pdf:[239,68,68] },
  2: { label:"Priorité 2", color:"#f97316", pdf:[249,115,22] },
  3: { label:"Priorité 3", color:"#eab308", pdf:[202,138,4] },
  4: { label:"Priorité 4", color:"#22c55e", pdf:[22,163,74] }
};
let probs = store.get("fc_problems", { items:[], journal:[] });
if (!Array.isArray(probs.items)) probs.items = [];
if (!Array.isArray(probs.journal)) probs.journal = [];
let pbEditing = null;
const saveProbs = () => store.set("fc_problems", probs);
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const plain = s => String(s || "").replace(/\*\*(.+?)\*\*/g, "$1");

function pbOpenCount() {
  return probs.items.filter(i => !i.solved).reduce((a, i) => a + i.actions.filter(x => !x.done).length, 0);
}
function renderProbs() {
  const items = [...probs.items].sort((a, b) => (a.solved - b.solved) || (a.level - b.level));
  const all = probs.items.reduce((a, i) => a + i.actions.length, 0);
  const done = probs.items.reduce((a, i) => a + i.actions.filter(x => x.done || i.solved).length, 0);
  const open = pbOpenCount();
  $("#pb-count").textContent = open || "";
  $("#pb-prog").innerHTML = all
    ? `<span>${done} / ${all} actions faites</span><div class="bar"><span style="width:${(done / all * 100).toFixed(0)}%"></span></div><span>${probs.items.filter(i => i.solved).length} / ${probs.items.length} réglée${probs.items.length > 1 ? "s" : ""}</span>`
    : "";
  $("#pb-list").innerHTML = items.length ? items.map(i => {
    const L = PB_LEVELS[i.level] || PB_LEVELS[4];
    const d = i.actions.filter(x => x.done).length;
    return `<article class="pb-card ${i.solved ? "done" : ""}" data-id="${esc(i.id)}" style="--pc:${L.color}">
      <header>
        <span class="lvl">${L.label}</span>
        <h3>${esc(i.title)}${i.tag ? `<small>${esc(i.tag)}</small>` : ""}</h3>
        <div class="hd-acts">
          <label class="pb-solved"><input type="checkbox" data-solved ${i.solved ? "checked" : ""}>Réglé</label>
          ${i.solved ? `<button class="icon-btn" data-act="open" title="Afficher le détail" aria-label="Afficher le détail">${ic("info", 17)}</button>` : ""}
          <button class="icon-btn" data-act="edit" title="Modifier" aria-label="Modifier">${ic("edit", 16)}</button>
        </div>
      </header>
      <div class="pb-body">
        ${i.constat ? `<div class="pb-block"><span class="lbl">Le constat</span><p>${rich(i.constat)}</p></div>` : ""}
        ${i.risque ? `<div class="pb-block risk"><span class="lbl">Le risque</span><p>${rich(i.risque)}</p></div>` : ""}
        ${i.reco ? `<div class="pb-block reco"><span class="lbl">La recommandation</span><p>${rich(i.reco)}</p></div>` : ""}
      </div>
      ${i.actions.length ? `<div class="pb-acts"><span class="lbl"><span>Actions</span><span>${d} / ${i.actions.length}</span></span>
        ${i.actions.map(a => `<label class="pb-chk ${a.done ? "ok" : ""}"><input type="checkbox" data-a="${esc(a.id)}" ${a.done ? "checked" : ""}><span>${rich(a.text)}</span></label>`).join("")}
      </div>` : ""}
    </article>`;
  }).join("") : `<div class="pb-empty"><b>Aucune problématique pour l'instant</b>Clique sur « Importer » pour charger le fichier envoyé par Antoine, ou sur « Ajouter » pour en créer une.</div>`;

  const jr = [...probs.journal].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  $("#jr-list").innerHTML = jr.map(e => `<li class="jr-item" data-id="${esc(e.id)}">
      <span class="when">${e.date ? dateOf(e.date).toLocaleDateString("fr-FR") : ""}${e.time ? "<br>" + esc(e.time) : ""}</span>
      <div class="txt">${esc(e.text)}${e.ctx ? `<small>${esc(e.ctx)}</small>` : ""}</div>
      <button class="del" data-act="jdel" title="Supprimer" aria-label="Supprimer">${ic("x", 15, 2.6)}</button>
    </li>`).join("");
}

function openPb(id) {
  pbEditing = id || null;
  const i = id ? probs.items.find(x => x.id === id) : { title:"", level:1, tag:"", constat:"", risque:"", reco:"", actions:[] };
  $("#pb-mtitle").textContent = id ? "Modifier la problématique" : "Nouvelle problématique";
  $("#pb-title").value = i.title; $("#pb-level").value = String(i.level); $("#pb-tag").value = i.tag || "";
  $("#pb-constat").value = i.constat || ""; $("#pb-risque").value = i.risque || ""; $("#pb-reco").value = i.reco || "";
  $("#pb-actions").value = i.actions.map(a => a.text).join("\n");
  $("#pb-del").hidden = !id;
  $("#pb-bg").classList.add("show");
  setTimeout(() => $("#pb-title").focus(), 60);
}
function savePb() {
  const title = $("#pb-title").value.trim();
  if (!title) { toast("Donne un titre à la problématique"); return; }
  const old = pbEditing ? probs.items.find(x => x.id === pbEditing) : null;
  const prevActs = old ? old.actions : [];
  const actions = $("#pb-actions").value.split("\n").map(t => t.trim()).filter(Boolean).map(t => {
    const same = prevActs.find(a => a.text === t);          // on garde les cases déjà cochées
    return same ? same : { id:"a-" + uid(), text:t, done:false };
  });
  const data = { title, level:+$("#pb-level").value, tag:$("#pb-tag").value.trim(), constat:$("#pb-constat").value.trim(),
    risque:$("#pb-risque").value.trim(), reco:$("#pb-reco").value.trim(), actions };
  if (old) Object.assign(old, data);
  else probs.items.push({ id:"p-" + uid(), solved:false, ...data });
  saveProbs(); renderProbs(); $("#pb-bg").classList.remove("show");
  toast(old ? "Problématique mise à jour" : "Problématique ajoutée");
}

function exportProbsPDF() {
  if (!probs.items.length && !probs.journal.length) { toast("Rien à exporter pour l'instant"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  const stops = [[139,92,246],[255,79,139]], N = 90, HH = 26;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    doc.setFillColor(...stops[0].map((v, j) => Math.round(v + (stops[1][j] - v) * t))); doc.rect(W * k / N, 0, W / N + .3, HH, "F");
  }
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("SUIVI", M, 10, { charSpace:1 });
  doc.setFontSize(19); doc.text("Problématiques", M, 19.5);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5);
  doc.text(pdfText([state.info.coach, new Date().toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })].filter(Boolean).join("  ·  ")), W - M, 12, { align:"right" });
  let y = HH + 8;
  const items = [...probs.items].sort((a, b) => a.level - b.level);
  items.forEach(i => {
    const L = PB_LEVELS[i.level] || PB_LEVELS[4];
    if (y > H - 50) { doc.addPage(); y = 18; }
    doc.setFont("helvetica","bold"); doc.setFontSize(9);
    const lab = L.label.toUpperCase(), lw = doc.getTextWidth(lab) + 8;
    doc.setFillColor(...L.pdf); doc.roundedRect(M, y, lw, 6.5, 2, 2, "F");
    doc.setTextColor(255,255,255); doc.text(lab, M + 4, y + 4.5);
    doc.setTextColor(42,20,51); doc.setFontSize(12.5);
    const t = doc.splitTextToSize(pdfText(i.title + (i.tag ? " (" + i.tag + ")" : "") + (i.solved ? "  - RÉGLÉ" : "")), W - 2 * M - lw - 4);
    doc.text(t, M + lw + 4, y + 4.8);
    y += Math.max(8, t.length * 5.2) + 2;
    const rows = [["Le constat", i.constat], ["Le risque", i.risque], ["La recommandation", i.reco]].filter(r => r[1]).map(r => [r[0], pdfText(plain(r[1]))]);
    i.actions.forEach(a => rows.push([{ content: a.done ? "Fait" : "À faire", styles:{ textColor: a.done ? [22,163,74] : [234,88,12], fontStyle:"bold" } }, pdfText(plain(a.text))]));
    doc.autoTable({
      startY:y, margin:{ left:M, right:M, top:16, bottom:16 }, body:rows, theme:"grid",
      styles:{ font:"helvetica", fontSize:9, cellPadding:2.4, textColor:[42,20,51], lineColor:[235,225,240], lineWidth:.25, valign:"top" },
      columnStyles:{ 0:{ cellWidth:34, fontStyle:"bold", textColor:L.pdf } }
    });
    y = doc.lastAutoTable.finalY + 9;
  });
  if (probs.journal.length) {
    if (y > H - 40) { doc.addPage(); y = 18; }
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(42,20,51); doc.text("Journal des faits", M, y); y += 3;
    const jr = [...probs.journal].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    doc.autoTable({
      startY:y, margin:{ left:M, right:M, top:16, bottom:16 }, theme:"grid",
      head:[["Date", "Heure", "Ce qui s'est passé", "Contexte / témoins"]],
      body: jr.map(e => [e.date ? dateOf(e.date).toLocaleDateString("fr-FR") : "", e.time || "", pdfText(e.text), pdfText(e.ctx || "")]),
      styles:{ font:"helvetica", fontSize:9, cellPadding:2.4, textColor:[42,20,51], lineColor:[235,225,240], lineWidth:.25, valign:"top" },
      headStyles:{ fillColor:[139,92,246], textColor:255, fontStyle:"bold" },
      columnStyles:{ 0:{ cellWidth:22 }, 1:{ cellWidth:15 }, 3:{ cellWidth:45 } }
    });
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(163,147,170);
    doc.text("Document personnel - ne pas diffuser", M, H - 6);
    doc.text(`Page ${p} / ${pages}`, W - M, H - 6, { align:"right" });
  }
  doc.save(`Problematiques_${todayISO()}.pdf`);
  toast("PDF exporté !");
}

function initProbs() {
  $("#jr-date").value = todayISO();
  renderProbs();
  $("#pb-add").addEventListener("click", () => openPb(null));
  $("#pb-pdf").addEventListener("click", exportProbsPDF);
  $("#pb-save").addEventListener("click", savePb);
  $("#pb-cancel").addEventListener("click", () => $("#pb-bg").classList.remove("show"));
  $("#pb-bg").addEventListener("click", ev => { if (ev.target.id === "pb-bg") $("#pb-bg").classList.remove("show"); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") $("#pb-bg").classList.remove("show"); });
  $("#pb-del").addEventListener("click", () => {
    if (!pbEditing || !confirm("Supprimer cette problématique ?")) return;
    probs.items = probs.items.filter(x => x.id !== pbEditing);
    saveProbs(); renderProbs(); $("#pb-bg").classList.remove("show"); toast("Problématique supprimée");
  });
  $("#pb-list").addEventListener("change", ev => {
    const card = ev.target.closest(".pb-card"); if (!card) return;
    const it = probs.items.find(x => x.id === card.dataset.id); if (!it) return;
    if (ev.target.dataset.a) { const a = it.actions.find(x => x.id === ev.target.dataset.a); if (a) a.done = ev.target.checked; }
    if (ev.target.hasAttribute("data-solved")) it.solved = ev.target.checked;
    // toutes les actions cochées : on propose de marquer comme réglé
    const allDone = it.actions.length && it.actions.every(x => x.done);
    saveProbs(); renderProbs();
    if (ev.target.dataset.a && allDone && !it.solved) toast("Toutes les actions sont faites : coche « Réglé » si c'est bon !");
  });
  $("#pb-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const card = b.closest(".pb-card");
    if (b.dataset.act === "edit") openPb(card.dataset.id);
    if (b.dataset.act === "open") card.classList.toggle("open");
  });
  $("#jr-add").addEventListener("click", () => {
    const text = $("#jr-text").value.trim();
    if (!text) { toast("Décris ce qui s'est passé"); $("#jr-text").focus(); return; }
    probs.journal.push({ id:"j-" + uid(), date:$("#jr-date").value, time:$("#jr-time").value, text, ctx:$("#jr-ctx").value.trim() });
    $("#jr-text").value = ""; $("#jr-ctx").value = ""; $("#jr-time").value = "";
    saveProbs(); renderProbs(); toast("Ajouté au journal");
  });
  $("#jr-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-act=jdel]"); if (!b) return;
    if (!confirm("Supprimer cette note du journal ?")) return;
    probs.journal = probs.journal.filter(e => e.id !== b.closest(".jr-item").dataset.id);
    saveProbs(); renderProbs();
  });
  $("#pb-import").addEventListener("click", () => $("#pb-file").click());
  $("#pb-file").addEventListener("change", async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items)) throw 0;
      const ids = new Set(data.items.map(i => i.id));
      probs.items = probs.items.filter(i => !ids.has(i.id)).concat(data.items.map(i => ({
        id:i.id || "p-" + uid(), title:String(i.title || "Sans titre"), level:Math.min(4, Math.max(1, +i.level || 4)), tag:i.tag || "",
        constat:i.constat || "", risque:i.risque || "", reco:i.reco || "", solved:!!i.solved,
        actions:(i.actions || []).map(a => ({ id:a.id || "a-" + uid(), text:String(a.text || a), done:!!a.done }))
      })));
      if (Array.isArray(data.journal)) { const jids = new Set(probs.journal.map(e => e.id)); probs.journal = probs.journal.concat(data.journal.filter(e => !jids.has(e.id))); }
      saveProbs(); renderProbs(); toast(`${data.items.length} problématique(s) importée(s)`);
    } catch (e) { toast("Fichier non reconnu"); }
    ev.target.value = "";
  });
}

/* ============ SYNCHRONISATION (Google Sheets) ============ */
const SYNC_KEYS = ["fc_custom", "fc_overrides", "fc_comments", "fc_state", "fc_hours_cfg", "fc_coach", "fc_problems"];
const rawGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const rawSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let sync = store.get("fc_sync", { url:"", code:"" });
let meta = store.get("fc_sync_meta", { kvU:{}, kvPushed:{}, dayPushed:{} });
meta.fichePushed = meta.fichePushed || {};
let scriptOld = false; // script Google pas encore mis à jour pour les fiches enregistrées
let syncBusy = false, syncAgain = false, syncTimer = null, applyingRemote = false, lastSyncAt = null, syncState = "off", syncErr = "";
const saveMeta = () => rawSet("fc_sync_meta", JSON.stringify(meta));

// chaque modification locale est datée pour savoir quelle version est la plus récente
const _storeSet = store.set;
store.set = (k, v) => {
  _storeSet(k, v);
  if (applyingRemote) return;
  if (SYNC_KEYS.includes(k)) { meta.kvU[k] = Date.now(); saveMeta(); }
  if (SYNC_KEYS.includes(k) || k === "fc_hours" || k === "fc_saved") scheduleSync(1500);
};
function scheduleSync(ms) { if (!sync.url) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }

function rowCells(iso) {
  const rec = live(hours[iso]);
  if (!rec) return ["", "", "", "", "", "", "", "", "", "", "", ""];
  const r = rowOf(iso), on = rec.status !== "repos";
  const dec = m => m ? Math.round(m / 60 * 100) / 100 : "";
  return [r.jour, r.statut, on ? rec.s1?.d || "" : "", on ? rec.s1?.f || "" : "", on ? rec.s2?.d || "" : "", on ? rec.s2?.f || "" : "",
    dec(r.c.total), dec(r.c.co), dec(r.c.plateau), dec(r.c.autre), dec(r.c.formation), rec.note || ""];
}

async function api(body) {
  let res;
  try {
    res = await fetch(sync.url, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body:JSON.stringify(body) });
  } catch (e) {
    throw new Error(navigator.onLine === false
      ? "Pas de connexion internet."
      : "Le script Google ne répond pas. Le plus souvent : le déploiement n'est pas réglé sur « Qui a accès : Tout le monde », ou l'adresse n'est pas celle qui finit par /exec.");
  }
  const txt = await res.text();
  let j;
  try { j = JSON.parse(txt); }
  catch (e) {
    throw new Error(/<html|<!doctype/i.test(txt)
      ? "Google affiche une page de connexion au lieu du script : dans Apps Script, Déployer > Gérer les déploiements, règle « Qui a accès » sur « Tout le monde »."
      : "Réponse inattendue du script (" + res.status + "). Vérifie que tu as bien collé tout le code et cliqué sur Déployer.");
  }
  if (!j.ok) throw new Error(j.error === "code"
    ? "Code secret incorrect : il doit être exactement le même que dans le script (majuscules et accents compris)."
    : "Erreur du script : " + j.error);
  return j;
}

function ficheRow(id) {
  const f = liveF(saved[id]);
  if (!f) { const t = saved[id] && saved[id].trash; return [t ? "(corbeille) " + t.title : "(supprimée)", "", "", "", "", ""]; }
  const st = ficheStats(f);
  return [f.title, (f.info && f.info.cours) || "", f.desc || "", st.n, st.dur, new Date(f.u).toLocaleString("fr-FR")];
}
function outgoing() {
  const kv = {}, days = {}, fiches = {};
  Object.keys(saved).forEach(id => {
    const f = saved[id];
    if (f && f.u && f.u > (meta.fichePushed[id] || 0)) fiches[id] = { v:JSON.stringify(f), u:f.u, row:ficheRow(id) };
  });
  SYNC_KEYS.forEach(k => {
    const u = meta.kvU[k], v = rawGet(k);
    if (u && v !== null && u > (meta.kvPushed[k] || 0)) kv[k] = { v, u };
  });
  Object.keys(hours).forEach(iso => {
    const rec = hours[iso];
    if (rec && rec.u && rec.u > (meta.dayPushed[iso] || 0)) days[iso] = { v:JSON.stringify(rec), u:rec.u, row:rowCells(iso) };
  });
  return { kv, days, fiches };
}

function applyRemote(res) {
  let changed = false;
  applyingRemote = true;
  try {
    Object.entries(res.kv || {}).forEach(([k, r]) => {
      if (!SYNC_KEYS.includes(k)) return;
      if (r.u > (meta.kvU[k] || 0)) { rawSet(k, r.v); meta.kvU[k] = meta.kvPushed[k] = r.u; changed = true; }
    });
    Object.entries(res.days || {}).forEach(([iso, r]) => {
      const loc = hours[iso];
      if (!r.v) return;
      if (!loc || (loc.u || 0) < r.u) {
        try { const rec = JSON.parse(r.v); rec.u = r.u; hours[iso] = rec; meta.dayPushed[iso] = r.u; changed = true; } catch (e) {}
      }
    });
    if (changed) rawSet("fc_hours", JSON.stringify(hours));
    let fchanged = false;
    Object.entries(res.fiches || {}).forEach(([id, r]) => {
      if (!r.v) return;
      const loc = saved[id];
      if (!loc || (loc.u || 0) < r.u) {
        try { const f = JSON.parse(r.v); f.u = r.u; f.id = id; saved[id] = f; meta.fichePushed[id] = r.u; fchanged = true; } catch (e) {}
      }
    });
    if (fchanged) { rawSet("fc_saved", JSON.stringify(saved)); changed = true; }
    saveMeta();
  } finally { applyingRemote = false; }
  if (changed) reloadAll();
  return changed;
}

function reloadAll() {
  custom = store.get("fc_custom", []);
  overrides = store.get("fc_overrides", {});
  saved = store.get("fc_saved", {});
  probs = store.get("fc_problems", { items:[], journal:[] });
  if (!Array.isArray(probs.items)) probs.items = [];
  if (!Array.isArray(probs.journal)) probs.journal = [];
  comments = store.get("fc_comments", []);
  hrCfg = store.get("fc_hours_cfg", { contrat:35 });
  const st = store.get("fc_state", null);
  if (st && st.sections) {
    state = st;
    SECTIONS.forEach(s => { if (!state.sections[s.key]) state.sections[s.key] = { on:false, items:[] }; });
    if (!state.info) state.info = {};
  }
  if (!state.info.coach) state.info.coach = store.get("fc_coach", "");
  if (state.info.bpm === undefined) state.info.bpm = "128";
  for (const [k, sel] of Object.entries(INFO_FIELDS)) { const el = $(sel); if (document.activeElement !== el) el.value = state.info[k] || ""; }
  const c = $("#hr-contrat"); if (document.activeElement !== c) c.value = hrCfg.contrat ?? "";
  renderBpmHint(); renderLibrary(); renderToggles(); renderBubbles(); renderComments(); renderWeek(); renderSaved(); renderProbs();
}

async function syncNow() {
  if (!sync.url) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true; setSyncState("busy");
  try {
    const out = outgoing();
    const has = Object.keys(out.kv).length || Object.keys(out.days).length || Object.keys(out.fiches).length;
    const res = await api({ code:sync.code, action: has ? "set" : "get", kv:out.kv, days:out.days, fiches:out.fiches });
    scriptOld = !("fiches" in res);
    Object.entries(out.kv).forEach(([k, r]) => meta.kvPushed[k] = Math.max(meta.kvPushed[k] || 0, r.u));
    Object.entries(out.days).forEach(([iso, r]) => meta.dayPushed[iso] = Math.max(meta.dayPushed[iso] || 0, r.u));
    if (!scriptOld) Object.entries(out.fiches).forEach(([id, r]) => meta.fichePushed[id] = Math.max(meta.fichePushed[id] || 0, r.u));
    saveMeta();
    applyRemote(res);
    lastSyncAt = new Date(); setSyncState("ok");
  } catch (e) {
    syncErr = e.message || "Pas de connexion"; setSyncState("err");
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}

/* --- fusion de deux appareils (1re connexion ou import d'un fichier) : on ne perd rien --- */
const unionById = (first, second) => {           // « first » gagne si le même id existe des deux côtés
  const ids = new Set(first.map(x => x && x.id));
  return first.concat(second.filter(x => x && !ids.has(x.id)));
};
const ficheHasItems = st => st && st.sections && SECTIONS.some(s => st.sections[s.key] && st.sections[s.key].items && st.sections[s.key].items.length);
function mergeValue(k, loc, rem, now) {
  switch (k) {
    case "fc_custom":    return unionById(rem || [], loc || []);
    case "fc_comments":  return unionById(rem || [], loc || []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    case "fc_overrides": return { ...(loc || {}), ...(rem || {}) };
    case "fc_problems":  return { items: unionById((rem && rem.items) || [], (loc && loc.items) || []),
                                  journal: unionById((rem && rem.journal) || [], (loc && loc.journal) || []) };
    case "fc_state":
      if (ficheHasItems(loc) && ficheHasItems(rem) && !sameFiche(loc, rem)) {
        // deux fiches différentes en cours : celle de cet appareil est rangée dans « Mes enregistrements »
        const id = "f-" + now.toString(36) + uid().slice(0, 4);
        saved[id] = { id, title:`Fiche récupérée de cet appareil (${new Date(now).toLocaleDateString("fr-FR")})`,
          desc:"Fiche qui était en cours sur cet appareil au moment de la fusion des données.", created:now, u:now,
          info:{ ...loc.info }, sections:JSON.parse(JSON.stringify(loc.sections)), active:loc.active };
        rawSet("fc_saved", JSON.stringify(saved));
        return rem;
      }
      return ficheHasItems(loc) && !ficheHasItems(rem) ? loc : rem;
    default: return rem !== undefined ? rem : loc;   // fc_coach, fc_hours_cfg
  }
}
// remote = { kv:{clé: valeur}, kvU:{clé: date}, days:{iso: rec}, fiches:{id: rec} }
function mergeAll(remote, now) {
  applyingRemote = true;
  try {
    SYNC_KEYS.forEach(k => {
      const raw = rawGet(k); let loc; try { loc = raw === null ? undefined : JSON.parse(raw); } catch (e) { loc = undefined; }
      const rem = remote.kv[k];
      if (rem === undefined) { if (loc !== undefined) { meta.kvU[k] = now; meta.kvPushed[k] = 0; } return; }
      const merged = loc === undefined ? rem : mergeValue(k, loc, rem, now);
      rawSet(k, JSON.stringify(merged));
      if (JSON.stringify(merged) === JSON.stringify(rem)) { meta.kvU[k] = meta.kvPushed[k] = remote.kvU[k] || 1; }
      else { meta.kvU[k] = now; meta.kvPushed[k] = 0; }   // la version fusionnée repartira en ligne
    });
    [["days", hours, "fc_hours", "dayPushed"], ["fiches", saved, "fc_saved", "fichePushed"]].forEach(([part, local, key, pushed]) => {
      const rem = remote[part] || {};
      Object.keys(local).forEach(id => { if (local[id] && !local[id].u) local[id].u = rem[id] ? 1 : now; });  // anciennes données sans date
      Object.entries(rem).forEach(([id, r]) => {
        if (!r) return;
        if (!local[id] || (local[id].u || 0) < (r.u || 0)) { if (part === "fiches" && !r.deleted) r.id = id; local[id] = r; meta[pushed][id] = r.u || 0; }
      });
      rawSet(key, JSON.stringify(local));
    });
    saveMeta();
  } finally { applyingRemote = false; }
  reloadAll();
}

// première connexion d'un appareil : on fusionne ce qui est en ligne avec ce qui est sur cet appareil
async function connectSync(url, code) {
  const old = sync;
  sync = { url:url.trim(), code:code.trim() };
  setSyncState("busy");
  try {
    const res = await api({ code:sync.code, action:"get" });
    store.set("fc_sync", sync);
    const remote = { kv:{}, kvU:{}, days:{}, fiches:{} };
    Object.entries(res.kv || {}).forEach(([k, r]) => { try { remote.kv[k] = JSON.parse(r.v); remote.kvU[k] = r.u; } catch (e) {} });
    Object.entries(res.days || {}).forEach(([k, r]) => { try { const x = JSON.parse(r.v); x.u = r.u; remote.days[k] = x; } catch (e) {} });
    Object.entries(res.fiches || {}).forEach(([k, r]) => { try { const x = JSON.parse(r.v); x.u = r.u; remote.fiches[k] = x; } catch (e) {} });
    meta.dayPushed = {}; meta.fichePushed = {};
    mergeAll(remote, Date.now());
    await syncNow();          // renvoie en ligne ce qui vient de cet appareil
    return true;
  } catch (e) {
    applyingRemote = false;
    sync = old; syncErr = e.message || "Connexion impossible"; setSyncState(sync.url ? "err" : "off");
    throw e;
  }
}

/* --- transfert par fichier (sans Google) --- */
function exportAllData() {
  const kv = {};
  SYNC_KEYS.forEach(k => { const v = rawGet(k); if (v !== null) try { kv[k] = JSON.parse(v); } catch (e) {} });
  const data = { app:"fiche-coach-tout", version:1, date:new Date().toISOString(), kv, kvU:{ ...meta.kvU }, days:hours, fiches:saved };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type:"application/json" }));
  a.download = `fiche-coach-toutes-mes-donnees-${todayISO()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Fichier téléchargé : ouvre-le avec « Importer et fusionner » sur l'autre appareil");
}
async function importAllData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "fiche-coach-tout" || !data.kv) throw 0;
    mergeAll({ kv:data.kv, kvU:{}, days:data.days || {}, fiches:data.fiches || {} }, Date.now());
    // ce qui vient du fichier doit aussi partir en ligne si la synchro est active
    Object.keys(data.kv).forEach(k => { if (SYNC_KEYS.includes(k)) { meta.kvU[k] = Date.now(); meta.kvPushed[k] = 0; } });
    saveMeta(); scheduleSync(300);
    toast("Données fusionnées : rien n'a été effacé !");
  } catch (e) { toast("Ce fichier n'est pas une sauvegarde complète de Fiche Coach"); }
}

function syncLink() {
  return `${location.origin}${location.pathname}#synchro=${encodeURIComponent(sync.url)}&code=${encodeURIComponent(sync.code)}`;
}

function setSyncState(s) {
  syncState = s;
  const b = $("#sync-btn"); if (!b) return;
  b.dataset.state = s;
  $(".lbl", b).textContent = { off:"Synchro", busy:"Synchro…", ok:"Synchronisé", err:"Hors ligne" }[s];
  b.title = s === "err" ? "Pas synchronisé : " + syncErr : s === "ok" && lastSyncAt ? "Synchronisé à " + lastSyncAt.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : "Synchronisation téléphone / ordinateur";
  if ($("#sync-bg").classList.contains("show")) renderSyncModal();
}

function renderSyncModal() {
  const on = !!sync.url;
  $("#sy-off").hidden = on; $("#sy-on").hidden = !on;
  if (on) {
    const txt = { busy:"Synchronisation en cours…", ok:`Tout est à jour${lastSyncAt ? " (dernière synchro à " + lastSyncAt.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) + ")" : ""}.`, err:"Pas synchronisé pour l'instant : " + syncErr + ". Tes modifications sont gardées et partiront dès que la connexion revient.", off:"" }[syncState];
    $("#sy-status").textContent = txt + (scriptOld && syncState === "ok" ? " Attention : tes fiches enregistrées ne sont pas encore synchronisées. Antoine doit mettre à jour le script Google (nouvelle version)." : "");
    $("#sy-status").dataset.state = syncState;
  }
}

function initSync() {
  $("#sync-btn").addEventListener("click", () => { renderSyncModal(); $("#sync-bg").classList.add("show"); });
  $("#sync-bg").addEventListener("click", ev => { if (ev.target.id === "sync-bg" || ev.target.closest("[data-sy-close]")) $("#sync-bg").classList.remove("show"); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") $("#sync-bg").classList.remove("show"); });
  const syErr = msg => { const e = $("#sy-err"); e.hidden = !msg; e.textContent = msg || ""; };
  $("#sy-connect").addEventListener("click", async () => {
    const url = $("#sy-url").value.trim().replace(/\s+/g, ""), code = $("#sy-code").value.trim();
    syErr("");
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return syErr("L'adresse doit commencer par https://script.google.com/ (c'est l'« URL de l'application Web » donnée par Google après Déployer).");
    if (/\/edit|\/home\/projects|\/dev$/.test(url) || !/\/exec\/?$/.test(url)) return syErr("Ce n'est pas la bonne adresse : il faut l'« URL de l'application Web », celle qui finit par /exec (pas l'adresse de l'éditeur de code).");
    if (!code) return syErr("Entre le code secret.");
    const btn = $("#sy-connect"); btn.disabled = true; btn.textContent = "Connexion…";
    try { await connectSync(url.replace(/\/$/, ""), code); toast("Appareil connecté ! Tes données sont fusionnées."); renderSyncModal(); }
    catch (e) { syErr(e.message || "Connexion impossible"); }
    finally { btn.disabled = false; btn.textContent = "Connecter cet appareil"; }
  });
  $("#sy-now").addEventListener("click", () => syncNow());
  document.querySelectorAll("[data-sy-export]").forEach(b => b.addEventListener("click", exportAllData));
  document.querySelectorAll("[data-sy-import]").forEach(b => b.addEventListener("click", () => $("#sy-file").click()));
  $("#sy-file").addEventListener("change", ev => { const f = ev.target.files[0]; if (f) importAllData(f); ev.target.value = ""; });
  $("#sy-link").addEventListener("click", async () => {
    if (location.protocol === "file:") { toast("Ouvre d'abord le site depuis son adresse GitHub (https://…), sinon le lien ne marchera pas sur l'autre appareil"); return; }
    const l = syncLink();
    try { await navigator.clipboard.writeText(l); toast("Lien copié : ouvre-le sur l'autre appareil"); }
    catch (e) { prompt("Copie ce lien et ouvre-le sur l'autre appareil :", l); }
  });
  $("#sy-off-btn").addEventListener("click", () => {
    if (!confirm("Déconnecter cet appareil ? Tes données restent ici, mais ne seront plus synchronisées.")) return;
    sync = { url:"", code:"" }; store.set("fc_sync", sync); meta = { kvU:{}, kvPushed:{}, dayPushed:{}, fichePushed:{} }; saveMeta();
    setSyncState("off"); renderSyncModal();
  });

  // lien magique : #synchro=URL&code=XXX
  const h = location.hash;
  if (h.startsWith("#synchro=")) {
    const params = new URLSearchParams(h.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    connectSync(params.get("synchro") || "", params.get("code") || "")
      .then(() => toast("Appareil connecté : tout est synchronisé !"))
      .catch(e => { renderSyncModal(); $("#sync-bg").classList.add("show"); const er = $("#sy-err"); er.hidden = false; er.textContent = "Le lien n'a pas marché : " + (e.message || ""); $("#sy-url").value = params.get("synchro") || ""; });
  } else if (sync.url) {
    setSyncState("busy"); syncNow();
  } else setSyncState("off");

  setInterval(() => { if (sync.url && document.visibilityState === "visible") syncNow(); }, 20000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleSync(200); });
  window.addEventListener("online", () => scheduleSync(200));
}

/* ============ DÉMARRAGE ============ */
initInfo(); initLibrary(); initBuilder(); initModal(); renderBpmHint(); initComments(); initBot(); initSaved(); initProbs(); initHoraires(); initSync();
window.__ficheCoach = { exportPDF, state: () => state, hours: () => hours, syncNow };
})();

