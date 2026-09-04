// Split Súper — gastos compartidos, versión simple (sin login ni tokens).
// Los datos se guardan en un "blob" JSON en jsonblob.com. El id del grupo
// viaja en el link. Quien tiene el link, ve y edita. Ideal para amigos.

import { CONFIG } from "./config.js";

// ---- Constantes ---------------------------------------------------------

const PALETTE = ["#6366f1", "#22d3ee", "#f59e0b", "#34d399", "#f43f5e", "#a78bfa", "#fb7185", "#4ade80"];
const DEFAULT_PEOPLE = ["Persona 1", "Persona 2", "Persona 3", "Persona 4"];
const LS_GROUP = "splitsuper_group";
const LS_BACKUP = "splitsuper_backup";
const POLL_MS = 10000; // refresco cada 10s

// ---- Utilidades ---------------------------------------------------------

const fmt = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n || 0);

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const colorFor = (people, name) => {
  const i = people.indexOf(name);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function emptyData() { return { people: [...DEFAULT_PEOPLE], expenses: [], months: {} }; }

function normalize(d) {
  return {
    people: Array.isArray(d?.people) && d.people.length ? d.people : [...DEFAULT_PEOPLE],
    expenses: Array.isArray(d?.expenses) ? d.expenses : [],
    months: d?.months && typeof d.months === "object" ? d.months : {},
  };
}

function getGroup() { try { return localStorage.getItem(LS_GROUP) || ""; } catch { return ""; } }
function setGroup(id) { try { id ? localStorage.setItem(LS_GROUP, id) : localStorage.removeItem(LS_GROUP); } catch {} }
function saveBackup(data) { try { localStorage.setItem(LS_BACKUP, JSON.stringify(data)); } catch {} }
function loadBackup() { try { const s = localStorage.getItem(LS_BACKUP); return s ? normalize(JSON.parse(s)) : null; } catch { return null; } }

// ---- Estado -------------------------------------------------------------

const state = {
  month: currentMonthKey(),
  data: emptyData(),
  online: false,
  busy: false,
};
let pollTimer = null;

// ---- Elementos ----------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  noGroup: $("no-group"),
  createGroupBtn: $("create-group-btn"),
  appSections: document.querySelectorAll(".app-only"),
  monthPicker: $("month-picker"),
  connBadge: $("conn-badge"),
  shareBtn: $("share-btn"),
  form: $("expense-form"),
  addBtn: $("add-btn"),
  personSelect: $("person-select"),
  descInput: $("desc-input"),
  amountInput: $("amount-input"),
  summary: $("summary"),
  grandTotal: $("grand-total"),
  paidBySelect: $("paidby-select"),
  settlement: $("settlement"),
  expenseList: $("expense-list"),
  managePeopleBtn: $("manage-people-btn"),
  peopleDialog: $("people-dialog"),
  peopleInputs: $("people-inputs"),
  addPersonBtn: $("add-person-btn"),
  savePeopleBtn: $("save-people-btn"),
  cancelPeopleBtn: $("cancel-people-btn"),
  shareDialog: $("share-dialog"),
  shareLink: $("share-link"),
  copyLinkBtn: $("copy-link-btn"),
  leaveGroupBtn: $("leave-group-btn"),
  closeShareBtn: $("close-share-btn"),
  installBanner: $("install-banner"),
  installBtn: $("install-btn"),
  installDismiss: $("install-dismiss"),
  iosDialog: $("ios-dialog"),
  iosCloseBtn: $("ios-close-btn"),
};

// ---- Almacenamiento (jsonblob) -----------------------------------------

const JSON_HEADERS = { "Content-Type": "application/json" };

// fetch con detección clara de errores de red / bloqueo del navegador (CORS).
async function apiFetch(url, opts) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    const err = new Error("No se pudo contactar el servidor de datos (¿sin internet o bloqueado por el navegador?).");
    err.network = true;
    throw err;
  }
}

// Extrae el id del grupo de la respuesta (del cuerpo o, si no, de cabeceras).
async function extractId(res) {
  try {
    const j = await res.clone().json();
    const id = j.Id || j.id || j._id || j.key || "";
    if (id) return String(id);
    if (j.uri) return String(j.uri).split("/").filter(Boolean).pop() || "";
  } catch {}
  const loc = res.headers.get("Location") || res.headers.get("X-jsonblob") || "";
  return loc.split("/").filter(Boolean).pop() || "";
}

// Crea un grupo nuevo con los datos semilla. Devuelve el id.
async function createGroup(seed) {
  const res = await apiFetch(CONFIG.api, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(seed) });
  if (!res.ok) throw new Error("El servidor devolvió HTTP " + res.status + " al crear el grupo.");
  const id = await extractId(res);
  if (!id) throw new Error("El servidor no devolvió el id del grupo.");
  setGroup(id);
  saveBackup(seed);
  return id;
}

// Lee los datos del grupo actual.
async function readGroup() {
  const id = getGroup();
  const res = await apiFetch(`${CONFIG.api}/${id}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404) { const e = new Error("expired"); e.expired = true; throw e; }
  if (!res.ok) throw new Error("El servidor devolvió HTTP " + res.status + " al leer.");
  const data = normalize(await res.json());
  saveBackup(data);
  return data;
}

// Escribe los datos del grupo actual.
async function writeGroup(data) {
  const id = getGroup();
  const res = await apiFetch(`${CONFIG.api}/${id}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(data) });
  if (res.status === 404) { const e = new Error("expired"); e.expired = true; throw e; }
  if (!res.ok) throw new Error("El servidor devolvió HTTP " + res.status + " al guardar.");
  saveBackup(data);
}

// Aplica un cambio: relee lo último, aplica y escribe (para pisar lo menos posible).
async function mutate(applyFn) {
  if (!getGroup()) { showNoGroup(); return false; }
  state.busy = true; renderStatus();
  try {
    let base;
    try { base = await readGroup(); } catch (e) { if (e.expired) { await handleExpired(); return false; } throw e; }
    const next = normalize(base);
    applyFn(next);
    await writeGroup(next);
    state.data = next; state.online = true;
    render();
    return true;
  } catch (e) {
    if (e.expired) { await handleExpired(); return false; }
    console.error(e);
    alert("No se pudo guardar. Revisá tu conexión e intentá de nuevo.");
    return false;
  } finally {
    state.busy = false; renderStatus();
  }
}

// El grupo se borró por inactividad (jsonblob limpia blobs sin uso ~30 días).
async function handleExpired() {
  const backup = loadBackup() || state.data || emptyData();
  const ok = confirm(
    "El grupo compartido expiró por inactividad.\n\n¿Recrearlo con los datos que tenés guardados en este dispositivo? " +
    "Vas a tener que pasarles el link nuevo a tus roomies."
  );
  if (!ok) return;
  try {
    await createGroup(normalize(backup));
    state.data = normalize(backup); state.online = true;
    render();
    openShareDialog();
  } catch (e) {
    console.error(e);
    alert("No se pudo recrear el grupo.");
  }
}

// ---- Link del grupo -----------------------------------------------------

function ingestGroupFromUrl() {
  try {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const qs = new URLSearchParams(location.search);
    const id = (hash.get(CONFIG.groupParam) || qs.get(CONFIG.groupParam) || "").trim();
    if (id) {
      setGroup(id);
      history.replaceState(null, "", location.origin + location.pathname);
      return true;
    }
  } catch {}
  return false;
}

function buildShareLink() {
  return `${location.origin}${location.pathname}#${CONFIG.groupParam}=${encodeURIComponent(getGroup())}`;
}

// ---- Carga y refresco ---------------------------------------------------

async function refresh() {
  if (!getGroup()) { showNoGroup(); return; }
  try {
    state.data = await readGroup();
    state.online = true;
  } catch (e) {
    if (e.expired) { await handleExpired(); return; }
    console.error(e);
    state.online = false;
  }
  render();
}

function schedulePolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (getGroup() && !state.busy && !document.hidden) refresh(); }, POLL_MS);
}

// ---- Cálculos -----------------------------------------------------------

function monthExpenses() {
  return state.data.expenses.filter((e) => e.month === state.month).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function totalsByPerson() {
  const totals = {};
  state.data.people.forEach((p) => (totals[p] = 0));
  monthExpenses().forEach((e) => { totals[e.person] = (totals[e.person] || 0) + Number(e.amount || 0); });
  return totals;
}
function grandTotal() { return monthExpenses().reduce((s, e) => s + Number(e.amount || 0), 0); }
function paidByForMonth() { return state.data.months?.[state.month]?.paidBy || ""; }

// ---- Acciones -----------------------------------------------------------

function addExpense(person, description, amount) {
  return mutate((d) => { d.expenses.push({ id: uid(), month: state.month, person, description, amount, ts: Date.now() }); });
}
function removeExpense(id) { return mutate((d) => { d.expenses = d.expenses.filter((e) => e.id !== id); }); }
function savePeople(people) { return mutate((d) => { d.people = people; }); }
function setPaidBy(person) {
  return mutate((d) => { d.months = d.months || {}; d.months[state.month] = { ...(d.months[state.month] || {}), paidBy: person }; });
}

// ---- Mostrar / ocultar pantallas ---------------------------------------

function showNoGroup() {
  els.noGroup.classList.remove("hidden");
  els.appSections.forEach((s) => s.classList.add("hidden"));
}
function showApp() {
  els.noGroup.classList.add("hidden");
  els.appSections.forEach((s) => s.classList.remove("hidden"));
}

// ---- Render -------------------------------------------------------------

function render() {
  if (!getGroup()) { showNoGroup(); return; }
  showApp();
  renderStatus();
  renderPeopleControls();
  renderPaidBy();
  renderSummary();
  renderList();
  renderSettlement();
}

function renderStatus() {
  const badge = els.connBadge;
  if (state.busy) { badge.textContent = "Guardando…"; badge.className = "conn-badge saving"; }
  else if (!state.online) { badge.textContent = "Sin conexión"; badge.className = "conn-badge offline"; }
  else { badge.textContent = "Compartido ✓"; badge.className = "conn-badge connected"; }
}

function renderPeopleControls() {
  const prev = els.personSelect.value;
  els.personSelect.innerHTML = state.data.people.map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join("");
  if (state.data.people.includes(prev)) els.personSelect.value = prev;
}

function renderPaidBy() {
  const cur = paidByForMonth();
  els.paidBySelect.innerHTML = ['<option value="">— nadie —</option>']
    .concat(state.data.people.map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`)).join("");
  els.paidBySelect.value = cur;
}

function renderSummary() {
  const totals = totalsByPerson();
  const gt = grandTotal();
  els.grandTotal.textContent = fmt(gt);
  els.summary.innerHTML = state.data.people.map((p) => {
    const val = totals[p] || 0;
    const pct = gt > 0 ? (val / gt) * 100 : 0;
    const color = colorFor(state.data.people, p);
    return `
      <div class="summary-row">
        <div class="who"><span class="dot" style="background:${color}"></span>${escapeHtml(p)}</div>
        <div class="amount">${fmt(val)}</div>
        <div class="bar"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></div>
      </div>`;
  }).join("");
}

function renderSettlement() {
  const totals = totalsByPerson();
  const payer = paidByForMonth();
  if (!payer || !state.data.people.includes(payer) || grandTotal() === 0) { els.settlement.innerHTML = ""; return; }
  const rows = state.data.people
    .filter((p) => p !== payer && (totals[p] || 0) > 0)
    .map((p) => `<div class="settle-row"><b>${escapeHtml(p)}</b> le debe <b>${fmt(totals[p])}</b> a <b>${escapeHtml(payer)}</b></div>`);
  const header = `<div class="settle-row"><b>${escapeHtml(payer)}</b> pagó todo con la tarjeta. Cada uno le devuelve lo suyo:</div>`;
  els.settlement.innerHTML = rows.length ? header + rows.join("") : "";
}

function renderList() {
  const items = monthExpenses();
  if (!items.length) { els.expenseList.innerHTML = `<div class="empty">Todavía no hay gastos este mes.</div>`; return; }
  els.expenseList.innerHTML = items.map((e) => {
    const color = colorFor(state.data.people, e.person);
    return `
      <div class="expense-item">
        <span class="tag" style="background:${color}">${escapeHtml(e.person)}</span>
        <span class="desc" title="${escapeAttr(e.description)}">${escapeHtml(e.description)}</span>
        <span class="val">${fmt(e.amount)}</span>
        <button class="del" data-id="${e.id}" title="Eliminar" aria-label="Eliminar">✕</button>
      </div>`;
  }).join("");
}

// ---- Modal editar nombres ----------------------------------------------

function openPeopleDialog() { renderPeopleInputs(state.data.people); els.peopleDialog.showModal(); }
function renderPeopleInputs(people) {
  els.peopleInputs.innerHTML = people.map((p, i) => `
    <div class="person-input-row">
      <input type="text" value="${escapeAttr(p)}" maxlength="24" placeholder="Nombre ${i + 1}" />
      <button type="button" class="remove" title="Quitar" aria-label="Quitar">✕</button>
    </div>`).join("");
  els.peopleInputs.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (els.peopleInputs.querySelectorAll(".person-input-row").length > 1) e.target.closest(".person-input-row").remove();
    });
  });
}
function collectPeopleFromInputs() {
  return [...els.peopleInputs.querySelectorAll("input")].map((i) => i.value.trim()).filter((v) => v.length > 0);
}

// ---- Modal compartir ----------------------------------------------------

function openShareDialog() {
  els.shareLink.value = getGroup() ? buildShareLink() : "";
  els.shareDialog.showModal();
}
async function copyShareLink() {
  const link = buildShareLink();
  try { await navigator.clipboard.writeText(link); }
  catch { els.shareLink.select(); document.execCommand("copy"); }
  els.copyLinkBtn.textContent = "¡Copiado!";
  setTimeout(() => { els.copyLinkBtn.textContent = "Copiar"; }, 1500);
}

// ---- Escapado seguro ----------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---- Eventos ------------------------------------------------------------

function wireEvents() {
  els.createGroupBtn.addEventListener("click", async () => {
    els.createGroupBtn.disabled = true;
    els.createGroupBtn.textContent = "Creando…";
    try {
      await createGroup(emptyData());
      state.data = emptyData();
      render();
      openShareDialog();
    } catch (e) {
      console.error(e);
      alert("No se pudo crear el grupo.\n\nDetalle: " + (e.message || e));
    } finally {
      els.createGroupBtn.disabled = false;
      els.createGroupBtn.textContent = "➕ Crear grupo compartido";
    }
  });

  els.monthPicker.value = state.month;
  els.monthPicker.addEventListener("change", () => { state.month = els.monthPicker.value || currentMonthKey(); render(); });

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const person = els.personSelect.value;
    const description = els.descInput.value.trim();
    const amount = Number(els.amountInput.value);
    if (!person || !description || !(amount > 0)) return;
    const ok = await addExpense(person, description, amount);
    if (ok) { els.descInput.value = ""; els.amountInput.value = ""; els.descInput.focus(); }
  });

  els.expenseList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".del");
    if (!btn) return;
    if (confirm("¿Eliminar este gasto?")) await removeExpense(btn.dataset.id);
  });

  els.paidBySelect.addEventListener("change", async () => { await setPaidBy(els.paidBySelect.value); });

  els.managePeopleBtn.addEventListener("click", openPeopleDialog);
  els.addPersonBtn.addEventListener("click", () => {
    const people = collectPeopleFromInputs();
    people.push("");
    renderPeopleInputs(people);
    els.peopleInputs.querySelector(".person-input-row:last-child input").focus();
  });
  els.cancelPeopleBtn.addEventListener("click", () => els.peopleDialog.close());
  els.savePeopleBtn.addEventListener("click", async () => {
    const people = collectPeopleFromInputs();
    if (!people.length) { alert("Tiene que haber al menos una persona."); return; }
    els.peopleDialog.close();
    await savePeople(people);
  });

  // Compartir
  els.shareBtn.addEventListener("click", openShareDialog);
  els.copyLinkBtn.addEventListener("click", copyShareLink);
  els.closeShareBtn.addEventListener("click", () => els.shareDialog.close());
  els.leaveGroupBtn.addEventListener("click", () => {
    if (!confirm("¿Salir del grupo en este dispositivo? (No borra los datos; podés volver con el link).")) return;
    setGroup("");
    els.shareDialog.close();
    showNoGroup();
  });

  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}

// ---- Instalación como app (PWA) ----------------------------------------

let deferredPrompt = null;
const LS_INSTALL_DISMISS = "splitsuper_install_dismissed";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const installDismissed = () => { try { return localStorage.getItem(LS_INSTALL_DISMISS) === "1"; } catch { return false; } };

function showInstallBanner() {
  if (isStandalone() || installDismissed()) return;
  els.installBanner.classList.remove("hidden");
}
function hideInstallBanner() { els.installBanner.classList.add("hidden"); }

function initInstall() {
  // Registrar el service worker (necesario para que sea instalable y ande offline).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // Android/Chrome: guardamos el evento y mostramos el cartel con botón "Instalar".
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; hideInstallBanner(); });

  // iPhone no dispara beforeinstallprompt: si no está instalada, mostramos el cartel igual.
  if (isIOS() && !isStandalone()) showInstallBanner();

  els.installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      hideInstallBanner();
    } else if (isIOS()) {
      els.iosDialog.showModal();
    } else {
      // Navegador sin soporte de instalación automática.
      els.iosDialog.showModal();
    }
  });

  els.installDismiss.addEventListener("click", () => {
    hideInstallBanner();
    try { localStorage.setItem(LS_INSTALL_DISMISS, "1"); } catch {}
  });
  els.iosCloseBtn.addEventListener("click", () => els.iosDialog.close());
}

// ---- Arranque -----------------------------------------------------------

async function start() {
  wireEvents();
  initInstall();
  ingestGroupFromUrl();
  if (getGroup()) { render(); await refresh(); }
  else { showNoGroup(); }
  schedulePolling();
}

start();
