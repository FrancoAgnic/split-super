// Split Súper — gastos compartidos usando GitHub como "servidor".
// Los datos viven en data.json dentro del repo. Se leen y escriben con la API de GitHub.
// - Leer: público, sin llave.
// - Escribir: requiere una llave de acceso (token) guardada solo en este dispositivo.

import { GITHUB } from "./config.js";

// ---- Constantes ---------------------------------------------------------

const PALETTE = ["#6366f1", "#22d3ee", "#f59e0b", "#34d399", "#f43f5e", "#a78bfa", "#fb7185", "#4ade80"];
const DEFAULT_PEOPLE = ["Persona 1", "Persona 2", "Persona 3", "Persona 4"];
const TOKEN_KEY = "splitsuper_token";
const POLL_MS_CONNECTED = 12000;   // refresco cuando hay llave
const POLL_MS_READONLY = 60000;    // refresco en modo lectura (evita el límite de la API)
const API = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.dataPath}`;

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

// Base64 <-> texto con soporte de acentos/emojis.
const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (str) => decodeURIComponent(escape(atob(str)));

function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} }

// Si la app se abrió con la llave dentro del link (#k=... o ?k=...),
// la guarda en este dispositivo y limpia la URL para que no quede a la vista.
// Así los compañeros no configuran nada: solo abren el link.
function ingestKeyFromUrl() {
  try {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const qs = new URLSearchParams(location.search);
    const key = (hash.get("k") || hash.get("key") || qs.get("k") || qs.get("key") || "").trim();
    if (key) {
      setToken(key);
      history.replaceState(null, "", location.origin + location.pathname);
      return true;
    }
  } catch {}
  return false;
}

// Arma el link para compartir con la llave adentro.
function buildShareLink() {
  const base = location.origin + location.pathname;
  return `${base}#k=${encodeURIComponent(getToken())}`;
}

function emptyData() {
  return { people: [...DEFAULT_PEOPLE], expenses: [], months: {} };
}

// Normaliza para que nunca falten campos.
function normalize(d) {
  return {
    people: Array.isArray(d?.people) && d.people.length ? d.people : [...DEFAULT_PEOPLE],
    expenses: Array.isArray(d?.expenses) ? d.expenses : [],
    months: d?.months && typeof d.months === "object" ? d.months : {},
  };
}

// ---- Estado -------------------------------------------------------------

const state = {
  month: currentMonthKey(),
  data: emptyData(),
  sha: null,      // sha del data.json actual (necesario para escribir)
  online: false,  // se pudo leer del repo
  connected: false, // hay llave válida guardada
  busy: false,
};

let pollTimer = null;

// ---- Elementos ----------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  monthPicker: $("month-picker"),
  connBadge: $("conn-badge"),
  accountBtn: $("account-btn"),
  form: $("expense-form"),
  addBtn: $("add-btn"),
  personSelect: $("person-select"),
  personField: $("person-field"),
  sharedInput: $("shared-input"),
  descInput: $("desc-input"),
  amountInput: $("amount-input"),
  readonlyHint: $("readonly-hint"),
  summary: $("summary"),
  grandTotal: $("grand-total"),
  paidBySelect: $("paidby-select"),
  settlement: $("settlement"),
  expenseList: $("expense-list"),
  repoLabel: $("repo-label"),
  managePeopleBtn: $("manage-people-btn"),
  peopleDialog: $("people-dialog"),
  peopleInputs: $("people-inputs"),
  addPersonBtn: $("add-person-btn"),
  savePeopleBtn: $("save-people-btn"),
  cancelPeopleBtn: $("cancel-people-btn"),
  accountDialog: $("account-dialog"),
  tokenInput: $("token-input"),
  tokenStatus: $("token-status"),
  saveTokenBtn: $("save-token-btn"),
  clearTokenBtn: $("clear-token-btn"),
  cancelTokenBtn: $("cancel-token-btn"),
  shareBlock: $("share-block"),
  shareLink: $("share-link"),
  copyLinkBtn: $("copy-link-btn"),
  installBanner: $("install-banner"),
  installBtn: $("install-btn"),
  installDismiss: $("install-dismiss"),
  iosDialog: $("ios-dialog"),
  iosCloseBtn: $("ios-close-btn"),
};

// ---- Acceso a GitHub (la "base de datos") ------------------------------

function authHeaders() {
  const t = getToken();
  const h = { Accept: "application/vnd.github+json" };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

// Lee data.json del repo. Devuelve { data, sha }. Si no existe, data vacío.
async function readRepo() {
  const url = `${API}?ref=${encodeURIComponent(GITHUB.branch)}&t=${Date.now()}`;
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  if (res.status === 404) return { data: emptyData(), sha: null };
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const json = await res.json();
  let parsed = emptyData();
  try { parsed = JSON.parse(b64decode((json.content || "").replace(/\n/g, ""))); } catch {}
  return { data: normalize(parsed), sha: json.sha };
}

// Escribe data.json. Requiere sha (si el archivo existe). Devuelve el nuevo sha.
async function writeRepo(data, sha, message) {
  const body = {
    message,
    content: b64encode(JSON.stringify(data, null, 2)),
    branch: GITHUB.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(API, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 409) { const e = new Error("conflict"); e.conflict = true; throw e; }
  if (res.status === 401 || res.status === 403) {
    let detail = ""; try { detail = (await res.json()).message || ""; } catch {}
    const e = new Error(detail || "auth"); e.auth = true; e.detail = detail; throw e;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.content.sha;
}

// Aplica un cambio de forma segura: relee lo último, aplica, y escribe.
// Reintenta si hubo un choque (otra persona escribió al mismo tiempo).
async function mutate(applyFn, message) {
  if (!getToken()) { openAccountDialog(); return false; }
  state.busy = true;
  renderStatus();
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, sha } = await readRepo();
      const next = normalize(data);
      applyFn(next);
      try {
        const newSha = await writeRepo(next, sha, message);
        state.data = next;
        state.sha = newSha;
        state.online = true;
        render();
        return true;
      } catch (e) {
        if (e.conflict) { await new Promise((r) => setTimeout(r, 300)); continue; }
        throw e;
      }
    }
    alert("Hubo muchos cambios al mismo tiempo. Probá de nuevo en un momento.");
    return false;
  } catch (e) {
    console.error(e);
    if (e.auth) {
      alert(
        "No se pudo guardar: la llave no tiene permiso de ESCRITURA.\n\n" +
        (e.detail ? "GitHub dice: " + e.detail + "\n\n" : "") +
        "Solución: en el token, Permissions → Contents debe estar en 'Read and write'."
      );
      openAccountDialog();
    } else {
      alert("No se pudo guardar. Revisá tu conexión.");
    }
    return false;
  } finally {
    state.busy = false;
    renderStatus();
  }
}

// ---- Carga y refresco ---------------------------------------------------

async function refresh() {
  try {
    const { data, sha } = await readRepo();
    state.data = data;
    state.sha = sha;
    state.online = true;
  } catch (e) {
    console.error(e);
    state.online = false;
  }
  render();
}

function schedulePolling() {
  if (pollTimer) clearInterval(pollTimer);
  const ms = state.connected ? POLL_MS_CONNECTED : POLL_MS_READONLY;
  pollTimer = setInterval(() => { if (!state.busy && !document.hidden) refresh(); }, ms);
}

// ---- Cálculos -----------------------------------------------------------

function monthExpenses() {
  return state.data.expenses
    .filter((e) => e.month === state.month)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function totalsByPerson() {
  const totals = {};
  const people = state.data.people;
  people.forEach((p) => (totals[p] = 0));
  const n = people.length || 1;
  monthExpenses().forEach((e) => {
    const amt = Number(e.amount || 0);
    if (e.shared) {
      // Gasto común: se divide en partes iguales entre todos.
      const share = amt / n;
      people.forEach((p) => { totals[p] = (totals[p] || 0) + share; });
    } else {
      totals[e.person] = (totals[e.person] || 0) + amt;
    }
  });
  return totals;
}

function grandTotal() {
  return monthExpenses().reduce((s, e) => s + Number(e.amount || 0), 0);
}

function paidByForMonth() {
  return state.data.months?.[state.month]?.paidBy || "";
}

// ---- Acciones -----------------------------------------------------------

function addExpense(person, description, amount, shared) {
  return mutate((d) => {
    d.expenses.push({ id: uid(), month: state.month, person: shared ? "" : person, description, amount, shared: !!shared, ts: Date.now() });
  }, `Agregar gasto: ${description} (${shared ? "compartido" : person})`);
}

function removeExpense(id) {
  return mutate((d) => { d.expenses = d.expenses.filter((e) => e.id !== id); }, "Eliminar gasto");
}

function savePeople(people) {
  return mutate((d) => { d.people = people; }, "Actualizar nombres");
}

function setPaidBy(person) {
  return mutate((d) => {
    d.months = d.months || {};
    d.months[state.month] = { ...(d.months[state.month] || {}), paidBy: person };
  }, `Marcar pagador de ${state.month}`);
}

// ---- Render -------------------------------------------------------------

function render() {
  els.repoLabel.textContent = `${GITHUB.owner}/${GITHUB.repo}`;
  renderStatus();
  renderPeopleControls();
  renderPaidBy();
  renderSummary();
  renderList();
  renderSettlement();
}

function renderStatus() {
  state.connected = !!getToken();
  const badge = els.connBadge;
  if (state.busy) {
    badge.textContent = "Guardando…"; badge.className = "conn-badge saving";
  } else if (!state.online) {
    badge.textContent = "Sin conexión"; badge.className = "conn-badge offline";
  } else if (state.connected) {
    badge.textContent = "Conectado"; badge.className = "conn-badge connected";
  } else {
    badge.textContent = "Solo lectura"; badge.className = "conn-badge reading";
  }
  els.accountBtn.textContent = state.connected ? "🔑 Cuenta" : "🔑 Conectar";
  const ro = !state.connected;
  els.readonlyHint.classList.toggle("hidden", !ro);
  els.addBtn.disabled = ro;
  els.descInput.disabled = ro;
  els.amountInput.disabled = ro;
  els.personSelect.disabled = ro;
}

function renderPeopleControls() {
  const prev = els.personSelect.value;
  els.personSelect.innerHTML = state.data.people
    .map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join("");
  if (state.data.people.includes(prev)) els.personSelect.value = prev;
}

function renderPaidBy() {
  const cur = paidByForMonth();
  const opts = ['<option value="">— nadie —</option>']
    .concat(state.data.people.map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`));
  els.paidBySelect.innerHTML = opts.join("");
  els.paidBySelect.value = cur;
  els.paidBySelect.disabled = !state.connected;
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
  if (!items.length) {
    els.expenseList.innerHTML = `<div class="empty">Todavía no hay gastos este mes.</div>`;
    return;
  }
  els.expenseList.innerHTML = items.map((e) => {
    const del = state.connected
      ? `<button class="del" data-id="${e.id}" title="Eliminar" aria-label="Eliminar">✕</button>`
      : `<span class="del-placeholder"></span>`;
    const tag = e.shared
      ? `<span class="tag tag-shared" title="Compartido entre todos">🤝 Común</span>`
      : `<span class="tag" style="background:${colorFor(state.data.people, e.person)}">${escapeHtml(e.person)}</span>`;
    return `
      <div class="expense-item">
        ${tag}
        <span class="desc" title="${escapeAttr(e.description)}">${escapeHtml(e.description)}</span>
        <span class="val">${fmt(e.amount)}</span>
        ${del}
      </div>`;
  }).join("");
}

// ---- Modal editar nombres ----------------------------------------------

function openPeopleDialog() {
  renderPeopleInputs(state.data.people);
  els.peopleDialog.showModal();
}
function renderPeopleInputs(people) {
  els.peopleInputs.innerHTML = people.map((p, i) => `
    <div class="person-input-row">
      <input type="text" value="${escapeAttr(p)}" maxlength="24" placeholder="Nombre ${i + 1}" />
      <button type="button" class="remove" title="Quitar" aria-label="Quitar">✕</button>
    </div>`).join("");
  els.peopleInputs.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (els.peopleInputs.querySelectorAll(".person-input-row").length > 1)
        e.target.closest(".person-input-row").remove();
    });
  });
}
function collectPeopleFromInputs() {
  return [...els.peopleInputs.querySelectorAll("input")].map((i) => i.value.trim()).filter((v) => v.length > 0);
}

// ---- Modal llave (token) ------------------------------------------------

function openAccountDialog() {
  els.tokenInput.value = getToken();
  els.tokenStatus.textContent = "";
  els.tokenStatus.className = "token-status";
  refreshShareBlock();
  els.accountDialog.showModal();
}

// Muestra el link para compartir solo si ya hay una llave guardada.
function refreshShareBlock() {
  const has = !!getToken();
  els.shareBlock.classList.toggle("hidden", !has);
  if (has) els.shareLink.value = buildShareLink();
}

async function copyShareLink() {
  const link = buildShareLink();
  try {
    await navigator.clipboard.writeText(link);
    els.copyLinkBtn.textContent = "¡Copiado!";
  } catch {
    els.shareLink.select();
    document.execCommand("copy");
    els.copyLinkBtn.textContent = "¡Copiado!";
  }
  setTimeout(() => { els.copyLinkBtn.textContent = "Copiar"; }, 1500);
}

// Prueba REAL de permiso de escritura: crea un archivo temporal y lo borra.
// No sirve mirar `permissions.push` del repo, porque para el DUEÑO siempre da
// true (refleja tu rol de dueño, no lo que la llave permite realmente).
async function testWriteAccess() {
  const probePath = ".splitsuper-access-check";
  const url = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${probePath}`;
  const put = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Verificar acceso de escritura (Split Súper)", content: b64encode("ok"), branch: GITHUB.branch }),
  });
  if (put.status === 401) return { ok: false, message: "La llave no es válida (revisala)." };
  if (put.status === 403) {
    let d = ""; try { d = (await put.json()).message || ""; } catch {}
    return { ok: false, message: "La llave no tiene permiso de escritura. En el token, Permissions → Contents debe estar en 'Read and write'." + (d ? " (" + d + ")" : "") };
  }
  if (put.status === 422) return { ok: true }; // el archivo ya existía: igual pudo escribir
  if (put.status !== 200 && put.status !== 201) return { ok: false, message: "No se pudo verificar (GitHub " + put.status + ")." };
  // Limpieza: borrar el archivo de prueba.
  try {
    const sha = (await put.json())?.content?.sha;
    if (sha) {
      await fetch(url, {
        method: "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Limpiar verificación (Split Súper)", sha, branch: GITHUB.branch }),
      });
    }
  } catch {}
  return { ok: true };
}

async function verifyAndSaveToken() {
  const t = els.tokenInput.value.trim();
  if (!t) { els.tokenStatus.textContent = "Pegá una llave o tocá Desconectar."; els.tokenStatus.className = "token-status warn"; return; }
  els.tokenStatus.textContent = "Verificando permiso de escritura…"; els.tokenStatus.className = "token-status";
  setToken(t); // authHeaders() la usa para la prueba
  try {
    const res = await testWriteAccess();
    if (!res.ok) throw new Error(res.message);
    els.tokenStatus.textContent = "✅ ¡Llave válida y con permiso de escritura! Ya podés guardar.";
    els.tokenStatus.className = "token-status ok";
    state.connected = true;
    schedulePolling();
    refreshShareBlock();
    refresh();
  } catch (e) {
    setToken("");
    state.connected = false;
    refreshShareBlock();
    els.tokenStatus.textContent = "❌ " + (e.message || "No se pudo validar la llave.");
    els.tokenStatus.className = "token-status warn";
  }
}

// ---- Escapado seguro ----------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// Muestra/oculta el selector de persona según si el gasto es compartido.
function updateSharedUI() {
  const shared = els.sharedInput.checked;
  els.personField.classList.toggle("hidden", shared);
  els.personSelect.disabled = shared;
}

// ---- Eventos ------------------------------------------------------------

function wireEvents() {
  els.monthPicker.value = state.month;
  els.monthPicker.addEventListener("change", () => {
    state.month = els.monthPicker.value || currentMonthKey();
    render();
  });

  els.sharedInput.addEventListener("change", updateSharedUI);

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const shared = els.sharedInput.checked;
    const person = els.personSelect.value;
    const description = els.descInput.value.trim();
    const amount = Number(els.amountInput.value);
    if (!description || !(amount > 0)) return;
    if (!shared && !person) return; // individual necesita persona
    const ok = await addExpense(person, description, amount, shared);
    if (ok) {
      els.descInput.value = ""; els.amountInput.value = "";
      els.sharedInput.checked = false; updateSharedUI();
      els.descInput.focus();
    }
  });

  els.expenseList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".del");
    if (!btn) return;
    if (confirm("¿Eliminar este gasto?")) await removeExpense(btn.dataset.id);
  });

  els.paidBySelect.addEventListener("change", async () => {
    await setPaidBy(els.paidBySelect.value);
  });

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

  // Modal llave
  els.accountBtn.addEventListener("click", openAccountDialog);
  els.saveTokenBtn.addEventListener("click", verifyAndSaveToken);
  els.clearTokenBtn.addEventListener("click", () => {
    setToken("");
    state.connected = false;
    els.tokenInput.value = "";
    els.tokenStatus.textContent = "Desconectado. Quedás en modo lectura.";
    els.tokenStatus.className = "token-status";
    refreshShareBlock();
    schedulePolling();
    render();
  });
  els.copyLinkBtn.addEventListener("click", copyShareLink);
  els.cancelTokenBtn.addEventListener("click", () => els.accountDialog.close());

  // Refrescar al volver a la pestaña
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}

// ---- Arranque -----------------------------------------------------------

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
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; hideInstallBanner(); });
  if (isIOS() && !isStandalone()) showInstallBanner();

  els.installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      hideInstallBanner();
    } else {
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
  const gotKeyFromLink = ingestKeyFromUrl();
  state.connected = !!getToken();
  render();
  await refresh();
  schedulePolling();
  // Si entraron por el link mágico, avisamos que ya quedó listo.
  if (gotKeyFromLink && state.connected) {
    els.connBadge.textContent = "¡Conectado!";
  }
}

start();
