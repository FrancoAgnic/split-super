// Split Súper — app de gastos compartidos
// Vanilla JS + Firebase Firestore (sincronización en tiempo real entre todos).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, deleteDoc, setDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// ---- Utilidades ---------------------------------------------------------

// Paleta de colores por persona (se asigna por orden).
const PALETTE = ["#6366f1", "#22d3ee", "#f59e0b", "#34d399", "#f43f5e", "#a78bfa", "#fb7185", "#4ade80"];
const DEFAULT_PEOPLE = ["Persona 1", "Persona 2", "Persona 3", "Persona 4"];

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

// ---- Estado -------------------------------------------------------------

const state = {
  month: currentMonthKey(),
  people: [...DEFAULT_PEOPLE],
  expenses: [],       // gastos del mes seleccionado
  paidBy: "",         // quién pagó con la tarjeta este mes
  db: null,
};

let unsubExpenses = null;
let unsubConfig = null;
let unsubMonthMeta = null;

// ---- Elementos ----------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  configWarning: $("config-warning"),
  monthPicker: $("month-picker"),
  syncStatus: $("sync-status"),
  form: $("expense-form"),
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
};

// ---- Inicialización de Firebase ----------------------------------------

function isConfigured() {
  return firebaseConfig &&
    firebaseConfig.apiKey &&
    !String(firebaseConfig.apiKey).includes("TU_") &&
    firebaseConfig.projectId &&
    !String(firebaseConfig.projectId).includes("TU_");
}

function initFirebase() {
  if (!isConfigured()) {
    els.configWarning.classList.remove("hidden");
    setSync(false);
    return false;
  }
  const app = initializeApp(firebaseConfig);
  state.db = getFirestore(app);
  return true;
}

function setSync(online) {
  els.syncStatus.classList.toggle("online", online);
  els.syncStatus.classList.toggle("offline", !online);
  els.syncStatus.title = online ? "Conectado — datos sincronizados" : "Sin conexión";
}

// ---- Suscripciones a Firestore -----------------------------------------

// Config global (nombres de las personas), compartida por todos.
function subscribeConfig() {
  const ref = doc(state.db, "config", "app");
  unsubConfig = onSnapshot(ref, (snap) => {
    if (snap.exists() && Array.isArray(snap.data().people) && snap.data().people.length) {
      state.people = snap.data().people;
    } else {
      state.people = [...DEFAULT_PEOPLE];
    }
    renderPeopleControls();
    render();
  }, () => setSync(false));
}

// Metadatos del mes (quién pagó con la tarjeta).
function subscribeMonthMeta() {
  if (unsubMonthMeta) unsubMonthMeta();
  const ref = doc(state.db, "months", state.month);
  unsubMonthMeta = onSnapshot(ref, (snap) => {
    state.paidBy = (snap.exists() && snap.data().paidBy) || "";
    renderPaidBy();
    renderSettlement();
  }, () => setSync(false));
}

// Gastos del mes seleccionado.
function subscribeExpenses() {
  if (unsubExpenses) unsubExpenses();
  const q = query(collection(state.db, "expenses"), where("month", "==", state.month));
  unsubExpenses = onSnapshot(q, (snap) => {
    setSync(true);
    state.expenses = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    render();
  }, (err) => {
    console.error(err);
    setSync(false);
  });
}

// ---- Acciones -----------------------------------------------------------

async function addExpense(person, description, amount) {
  await addDoc(collection(state.db, "expenses"), {
    month: state.month,
    person,
    description,
    amount,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}

async function removeExpense(id) {
  await deleteDoc(doc(state.db, "expenses", id));
}

async function savePeople(people) {
  await setDoc(doc(state.db, "config", "app"), { people }, { merge: true });
}

async function setPaidBy(person) {
  await setDoc(doc(state.db, "months", state.month), { paidBy: person }, { merge: true });
}

// ---- Cálculos -----------------------------------------------------------

function totalsByPerson() {
  const totals = {};
  state.people.forEach((p) => (totals[p] = 0));
  state.expenses.forEach((e) => {
    totals[e.person] = (totals[e.person] || 0) + Number(e.amount || 0);
  });
  return totals;
}

function grandTotal() {
  return state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
}

// ---- Render -------------------------------------------------------------

function renderPeopleControls() {
  // Select de "de quién es el gasto"
  const prev = els.personSelect.value;
  els.personSelect.innerHTML = state.people
    .map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`)
    .join("");
  if (state.people.includes(prev)) els.personSelect.value = prev;
}

function renderPaidBy() {
  const opts = ['<option value="">— nadie —</option>']
    .concat(state.people.map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`));
  els.paidBySelect.innerHTML = opts.join("");
  els.paidBySelect.value = state.paidBy || "";
}

function render() {
  renderSummary();
  renderList();
  renderSettlement();
}

function renderSummary() {
  const totals = totalsByPerson();
  const gt = grandTotal();
  els.grandTotal.textContent = fmt(gt);

  els.summary.innerHTML = state.people
    .map((p) => {
      const val = totals[p] || 0;
      const pct = gt > 0 ? (val / gt) * 100 : 0;
      const color = colorFor(state.people, p);
      return `
        <div class="summary-row">
          <div class="who"><span class="dot" style="background:${color}"></span>${escapeHtml(p)}</div>
          <div class="amount">${fmt(val)}</div>
          <div class="bar"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></div>
        </div>`;
    })
    .join("");
}

function renderSettlement() {
  const totals = totalsByPerson();
  const payer = state.paidBy;
  if (!payer || !state.people.includes(payer) || grandTotal() === 0) {
    els.settlement.innerHTML = "";
    return;
  }
  const rows = state.people
    .filter((p) => p !== payer && (totals[p] || 0) > 0)
    .map((p) => `<div class="settle-row"><b>${escapeHtml(p)}</b> le debe <b>${fmt(totals[p])}</b> a <b>${escapeHtml(payer)}</b></div>`);
  const header = `<div class="settle-row"><b>${escapeHtml(payer)}</b> pagó todo con la tarjeta. Cada uno le devuelve lo suyo:</div>`;
  els.settlement.innerHTML = rows.length ? header + rows.join("") : "";
}

function renderList() {
  if (!state.expenses.length) {
    els.expenseList.innerHTML = `<div class="empty">Todavía no hay gastos este mes. ¡Agregá el primero! ☝️</div>`;
    return;
  }
  els.expenseList.innerHTML = state.expenses
    .map((e) => {
      const color = colorFor(state.people, e.person);
      return `
        <div class="expense-item">
          <span class="tag" style="background:${color}">${escapeHtml(e.person)}</span>
          <span class="desc" title="${escapeAttr(e.description)}">${escapeHtml(e.description)}</span>
          <span class="val">${fmt(e.amount)}</span>
          <button class="del" data-id="${e.id}" title="Eliminar" aria-label="Eliminar">✕</button>
        </div>`;
    })
    .join("");
}

// ---- Modal editar nombres ----------------------------------------------

function openPeopleDialog() {
  renderPeopleInputs(state.people);
  els.peopleDialog.showModal();
}

function renderPeopleInputs(people) {
  els.peopleInputs.innerHTML = people
    .map((p, i) => `
      <div class="person-input-row">
        <input type="text" value="${escapeAttr(p)}" maxlength="24" placeholder="Nombre ${i + 1}" />
        <button type="button" class="remove" title="Quitar" aria-label="Quitar">✕</button>
      </div>`)
    .join("");
  els.peopleInputs.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const rows = els.peopleInputs.querySelectorAll(".person-input-row");
      if (rows.length > 1) e.target.closest(".person-input-row").remove();
    });
  });
}

function collectPeopleFromInputs() {
  return [...els.peopleInputs.querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter((v) => v.length > 0);
}

// ---- Escapado seguro ----------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---- Eventos ------------------------------------------------------------

function wireEvents() {
  els.monthPicker.value = state.month;
  els.monthPicker.addEventListener("change", () => {
    state.month = els.monthPicker.value || currentMonthKey();
    if (state.db) {
      subscribeExpenses();
      subscribeMonthMeta();
    }
  });

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.db) return;
    const person = els.personSelect.value;
    const description = els.descInput.value.trim();
    const amount = Number(els.amountInput.value);
    if (!person || !description || !(amount > 0)) return;
    try {
      await addExpense(person, description, amount);
      els.descInput.value = "";
      els.amountInput.value = "";
      els.descInput.focus();
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar el gasto. Revisá tu conexión o las reglas de Firestore.");
    }
  });

  els.expenseList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".del");
    if (!btn || !state.db) return;
    if (confirm("¿Eliminar este gasto?")) {
      try { await removeExpense(btn.dataset.id); }
      catch (err) { console.error(err); }
    }
  });

  els.paidBySelect.addEventListener("change", async () => {
    if (!state.db) return;
    try { await setPaidBy(els.paidBySelect.value); }
    catch (err) { console.error(err); }
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
    try {
      if (state.db) await savePeople(people);
      else { state.people = people; renderPeopleControls(); render(); }
      els.peopleDialog.close();
    } catch (err) {
      console.error(err);
      alert("No se pudieron guardar los nombres.");
    }
  });
}

// ---- Arranque -----------------------------------------------------------

function start() {
  wireEvents();
  renderPeopleControls();
  renderPaidBy();
  render();

  if (initFirebase()) {
    subscribeConfig();
    subscribeExpenses();
    subscribeMonthMeta();
  }
}

start();
