'use strict';

/* ============================================================
   Viáticos — control de gastos de viaje
   Todo se guarda localmente (localStorage) en este teléfono.
   ============================================================ */

const STORAGE_KEY = 'viaticos_v1';

const TIPO_LABEL = {
  ahorro: 'Ahorro si no lo uso',
  reembolsable: 'Se ajusta con la empresa'
};

const RUBRO_PRESETS = [
  { nombre: 'Pasajes', precioUnitario: 200, cantidad: 2, porDia: false, tipo: 'reembolsable' },
  { nombre: 'Movilización taxi', precioUnitario: 150, cantidad: 1, porDia: false, tipo: 'ahorro' },
  { nombre: 'Alojamiento', precioUnitario: 500, cantidad: 4, porDia: true, tipo: 'reembolsable' },
  { nombre: 'Desayuno', precioUnitario: 150, cantidad: 5, porDia: true, tipo: 'ahorro' },
  { nombre: 'Almuerzo', precioUnitario: 230, cantidad: 4, porDia: true, tipo: 'ahorro' },
  { nombre: 'Cena', precioUnitario: 230, cantidad: 4, porDia: true, tipo: 'ahorro' },
  { nombre: 'Movilización interna', precioUnitario: 20, cantidad: 9, porDia: true, tipo: 'ahorro' }
];

const MONEDAS = ['C$', '$', 'Q', 'L', '₡', 'S/', 'Bs', '€'];

/* ---------------- Utilidades ---------------- */

function uid() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return String(n).padStart(2, '0'); }

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function formatDateISO(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDateISO(d);
}
function daysBetweenInclusive(s, e) {
  const a = parseDate(s), b = parseDate(e);
  return Math.round((b - a) / 86400000) + 1;
}
function formatDateHuman(s) {
  if (!s) return '';
  const d = parseDate(s);
  const txt = d.toLocaleDateString('es-NI', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
function formatDateShort(s) {
  if (!s) return '';
  const d = parseDate(s);
  return d.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
function money(amount, symbol) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return sign + symbol + ' ' + abs.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- Persistencia ---------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { trips: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.trips)) return { trips: [] };
    return parsed;
  } catch (e) {
    console.error('Error leyendo datos guardados', e);
    return { trips: [] };
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* Estado de navegación (no se guarda) */
const nav = {
  view: 'home',        // home | newTrip | trip
  tripId: null,
  tab: 'resumen',       // resumen | registrar | presupuesto
  showClosed: false
};

/* ---------------- Modelo / cálculos ---------------- */

function getTrip(id) {
  return state.trips.find(t => t.id === id);
}

function rubroMapOf(trip) {
  const m = {};
  trip.rubros.forEach(r => { m[r.id] = r; });
  return m;
}

function itemLabel(trip, item) {
  const rubro = rubroMapOf(trip)[item.rubroId];
  const nombre = rubro ? rubro.nombre : '(rubro eliminado)';
  return item.index > 1 ? `${nombre} #${item.index}` : nombre;
}

function generateItemsForRubro(trip, rubro) {
  const totalDays = Math.max(1, daysBetweenInclusive(trip.fechaInicio, trip.fechaFinPlan));
  const items = [];
  for (let i = 0; i < rubro.cantidad; i++) {
    const fecha = rubro.porDia ? addDays(trip.fechaInicio, i % totalDays) : trip.fechaInicio;
    items.push({
      id: uid(),
      rubroId: rubro.id,
      index: i + 1,
      fecha,
      presupuesto: rubro.precioUnitario,
      estado: 'pendiente', // pendiente | consumido | ahorro | devolver
      montoReal: null,
      detalle: [],
      auto: false
    });
  }
  return items;
}

function computeTotals(trip) {
  const rmap = rubroMapOf(trip);
  const t = {
    recibido: 0,
    gastoComprobado: 0,
    ahorroPersonal: 0,
    aDevolver: 0,
    aReembolsar: 0,
    gastoPropioExtra: 0,
    pendienteMonto: 0,
    pendienteCount: 0,
    totalItems: trip.items.length
  };
  trip.items.forEach(item => {
    t.recibido += item.presupuesto;
    const rubro = rmap[item.rubroId];
    if (item.estado === 'pendiente') {
      t.pendienteMonto += item.presupuesto;
      t.pendienteCount++;
      return;
    }
    if (item.estado === 'ahorro') { t.ahorroPersonal += item.presupuesto; return; }
    if (item.estado === 'devolver') { t.aDevolver += item.presupuesto; return; }
    if (item.estado === 'consumido') {
      const real = Number(item.montoReal) || 0;
      t.gastoComprobado += real;
      const diff = item.presupuesto - real; // positivo = gastó menos
      const tipo = rubro ? rubro.tipo : 'ahorro';
      if (tipo === 'reembolsable') {
        if (diff > 0) t.aDevolver += diff;
        else if (diff < 0) t.aReembolsar += -diff;
      } else {
        if (diff > 0) t.ahorroPersonal += diff;
        else if (diff < 0) t.gastoPropioExtra += -diff;
      }
    }
  });
  t.saldoFinal = t.ahorroPersonal + t.aReembolsar - t.aDevolver;
  return t;
}

function rubroTotals(trip, rubro) {
  const items = trip.items.filter(i => i.rubroId === rubro.id);
  const presupuestado = items.reduce((s, i) => s + i.presupuesto, 0);
  const registrados = items.filter(i => i.estado !== 'pendiente').length;
  const consumidoReal = items.filter(i => i.estado === 'consumido').reduce((s, i) => s + (Number(i.montoReal) || 0), 0);
  return { items, presupuestado, registrados, total: items.length, consumidoReal };
}

function shortenTripPreview(trip, fechaFinReal) {
  const affected = trip.items.filter(i => i.estado === 'pendiente' && i.fecha > fechaFinReal);
  const monto = affected.reduce((s, i) => s + i.presupuesto, 0);
  return { count: affected.length, monto };
}

function applyShortenTrip(trip, fechaFinReal) {
  trip.fechaFinReal = fechaFinReal;
  trip.items.forEach(i => {
    if (i.estado === 'pendiente' && i.fecha > fechaFinReal) {
      i.estado = 'devolver';
      i.montoReal = 0;
      i.auto = true;
    }
  });
}

function undoShortenTrip(trip) {
  trip.items.forEach(i => {
    if (i.auto) { i.estado = 'pendiente'; i.montoReal = null; i.auto = false; }
  });
  trip.fechaFinReal = null;
}

/* ---------------- Render raíz ---------------- */

const appEl = document.getElementById('app');

function render() {
  if (nav.view === 'home') return renderHome();
  if (nav.view === 'newTrip') return renderNewTrip();
  if (nav.view === 'trip') return renderTripDetail();
}

/* ---------------- Vista: Home ---------------- */

function renderHome() {
  const trips = [...state.trips].sort((a, b) => (b.fechaInicio || '').localeCompare(a.fechaInicio || ''));
  const activos = trips.filter(t => !t.cerrado);
  const cerrados = trips.filter(t => t.cerrado);

  function tripCard(trip) {
    const t = computeTotals(trip);
    const pct = t.totalItems ? Math.round(((t.totalItems - t.pendienteCount) / t.totalItems) * 100) : 0;
    const fin = trip.fechaFinReal || trip.fechaFinPlan;
    return `
      <div class="card trip-card" data-action="open-trip" data-id="${trip.id}">
        <div class="row1">
          <div>
            <div class="name">${esc(trip.nombre)}</div>
            <div class="dest">${esc(trip.destino || '')}</div>
          </div>
          <div>
            ${trip.cerrado ? '<span class="badge cerrado">Liquidado</span>' : '<span class="badge activo">En curso</span>'}
          </div>
        </div>
        <div class="dates">${formatDateShort(trip.fechaInicio)} — ${formatDateShort(fin)} · Recibido ${money(t.recibido, trip.moneda)}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="dates">${pct}% registrado${t.pendienteCount ? ` · ${t.pendienteCount} pendiente(s)` : ''}</div>
      </div>`;
  }

  appEl.innerHTML = `
    <div class="appbar">
      <h1>Mis viajes<span class="sub">Control de viáticos</span></h1>
    </div>
    <div class="content">
      ${trips.length === 0 ? `
        <div class="empty-state">
          <span class="emoji">🧳</span>
          <p><strong>Aún no tienes viajes registrados.</strong></p>
          <p>Crea tu primer viaje, agrega el presupuesto que te dieron y ve registrando cada gasto para saber cuánto es de la empresa y cuánto es tuyo.</p>
        </div>` : ''}
      ${activos.length ? `<div class="section-title">En curso</div><div class="list">${activos.map(tripCard).join('')}</div>` : ''}
      ${cerrados.length ? `
        <div class="section-title" data-action="toggle-closed" style="cursor:pointer">
          Liquidados (${cerrados.length}) ${nav.showClosed ? '▲' : '▼'}
        </div>
        ${nav.showClosed ? `<div class="list">${cerrados.map(tripCard).join('')}</div>` : ''}
      ` : ''}
      <div class="footer-note">Tus datos se guardan solo en este teléfono.</div>
    </div>
    <button class="fab" data-action="new-trip" aria-label="Nuevo viaje">+</button>
  `;
}

/* ---------------- Vista: Nuevo viaje ---------------- */

let newTripRubros = []; // borrador en memoria mientras se llena el formulario

function blankRubro(preset) {
  return {
    _key: uid(),
    nombre: preset ? preset.nombre : '',
    precioUnitario: preset ? preset.precioUnitario : '',
    cantidad: preset ? preset.cantidad : 1,
    porDia: preset ? preset.porDia : true,
    tipo: preset ? preset.tipo : 'ahorro'
  };
}

function renderNewTrip() {
  if (newTripRubros.length === 0) newTripRubros = [blankRubro()];

  const tripOptions = state.trips
    .slice().sort((a, b) => (b.fechaInicio || '').localeCompare(a.fechaInicio || ''))
    .map(t => `<option value="${t.id}">${esc(t.nombre)} (${formatDateShort(t.fechaInicio)})</option>`).join('');

  appEl.innerHTML = `
    <div class="appbar">
      <button class="icon-btn" data-action="go-home">←</button>
      <h1>Nuevo viaje</h1>
    </div>
    <div class="content">
      <form id="new-trip-form">
        <div class="card stack">
          <div class="field">
            <label for="f-nombre">Nombre del viaje</label>
            <input type="text" id="f-nombre" name="nombre" placeholder="Ej. Nueva Guinea - Semana 37" required>
          </div>
          <div class="field">
            <label for="f-destino">Destino / Departamento</label>
            <input type="text" id="f-destino" name="destino" placeholder="Ej. Nueva Guinea">
          </div>
          <div class="row2">
            <div class="field">
              <label for="f-inicio">Fecha inicio</label>
              <input type="date" id="f-inicio" name="fechaInicio" value="${todayISO()}" required>
            </div>
            <div class="field">
              <label for="f-fin">Fecha fin planeada</label>
              <input type="date" id="f-fin" name="fechaFinPlan" value="${addDays(todayISO(), 4)}" required>
            </div>
          </div>
          <div class="field">
            <label for="f-moneda">Moneda</label>
            <select id="f-moneda" name="moneda">
              ${MONEDAS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          ${state.trips.length ? `
          <div class="field">
            <label for="f-copiar">Copiar presupuesto de un viaje anterior (opcional)</label>
            <select id="f-copiar">
              <option value="">— No copiar —</option>
              ${tripOptions}
            </select>
          </div>` : ''}
        </div>

        <div class="card stack" style="margin-top:14px">
          <div class="rf-head">
            <h3 style="margin:0">Presupuesto por rubro</h3>
          </div>
          <p class="small muted" style="margin:-4px 0 0">
            Cada rubro es una fila del vale de viáticos (pasajes, hotel, comidas, etc). Si marcas <b>"repartir por día"</b>, se crea un registro por cada día del viaje para que puedas controlarlo día a día.
          </p>
          <div id="rubros-container" class="stack"></div>
          <div class="btn-row">
            <button type="button" class="btn btn-secondary btn-sm" data-action="add-rubro-row">+ Agregar rubro</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="load-example">Cargar ejemplo</button>
          </div>
          <div class="divider"></div>
          <div class="rf-head">
            <span class="muted small">Total del presupuesto</span>
            <span class="rf-total" id="rubros-total-display">0.00</span>
          </div>
        </div>

        <div style="margin-top:16px">
          <button type="submit" class="btn btn-primary">Crear viaje</button>
        </div>
      </form>
    </div>
  `;

  renderRubroRows();
  bindNewTripEvents();
}

function currentMoneda() {
  const sel = document.getElementById('f-moneda');
  return sel ? sel.value : 'C$';
}

function renderRubroRows() {
  const container = document.getElementById('rubros-container');
  container.innerHTML = newTripRubros.map(rowHTML).join('');
  updateRubrosTotal();
}

function rowHTML(r) {
  return `
    <div class="rubro-form-row" data-key="${r._key}">
      <div class="field">
        <input type="text" class="rf-nombre" placeholder="Nombre del rubro (ej. Desayuno)" value="${esc(r.nombre)}">
      </div>
      <div class="row2">
        <div class="field">
          <label>Precio unitario</label>
          <input type="number" class="rf-precio" min="0" step="0.01" inputmode="decimal" value="${r.precioUnitario}">
        </div>
        <div class="field">
          <label># veces</label>
          <input type="number" class="rf-cantidad" min="1" step="1" inputmode="numeric" value="${r.cantidad}">
        </div>
      </div>
      <div class="field">
        <label>Tipo</label>
        <select class="rf-tipo">
          <option value="ahorro" ${r.tipo === 'ahorro' ? 'selected' : ''}>Ahorro (si no lo uso, es mío)</option>
          <option value="reembolsable" ${r.tipo === 'reembolsable' ? 'selected' : ''}>Reembolsable (se ajusta con la empresa)</option>
        </select>
      </div>
      <div class="rf-head">
        <label class="checkline"><input type="checkbox" class="rf-pordia" ${r.porDia ? 'checked' : ''}> Repartir por día</label>
        <button type="button" class="btn-sm btn-ghost" data-action="remove-rubro-row" style="padding:4px 8px;color:var(--danger)">Quitar</button>
      </div>
      <div class="rf-head">
        <span class="rubro-legend ${r.tipo}">${r.tipo === 'ahorro' ? 'Si no lo usas, es tuyo' : 'Diferencia se ajusta con la empresa'}</span>
        <span class="rf-total rf-row-total">${money(r.precioUnitario * r.cantidad || 0, currentMoneda())}</span>
      </div>
    </div>`;
}

function readRowFromDOM(rowEl) {
  return {
    _key: rowEl.dataset.key,
    nombre: rowEl.querySelector('.rf-nombre').value.trim(),
    precioUnitario: parseFloat(rowEl.querySelector('.rf-precio').value) || 0,
    cantidad: Math.max(1, parseInt(rowEl.querySelector('.rf-cantidad').value, 10) || 1),
    porDia: rowEl.querySelector('.rf-pordia').checked,
    tipo: rowEl.querySelector('.rf-tipo').value
  };
}

function syncRubrosFromDOM() {
  const rows = document.querySelectorAll('#rubros-container .rubro-form-row');
  newTripRubros = Array.from(rows).map(readRowFromDOM);
}

function updateRubrosTotal() {
  const rows = document.querySelectorAll('#rubros-container .rubro-form-row');
  let total = 0;
  const symbol = currentMoneda();
  rows.forEach(row => {
    const precio = parseFloat(row.querySelector('.rf-precio').value) || 0;
    const cant = parseFloat(row.querySelector('.rf-cantidad').value) || 0;
    const rowTotal = precio * cant;
    total += rowTotal;
    row.querySelector('.rf-row-total').textContent = money(rowTotal, symbol);
    const legend = row.querySelector('.rubro-legend');
    const tipo = row.querySelector('.rf-tipo').value;
    legend.className = 'rubro-legend ' + tipo;
    legend.textContent = tipo === 'ahorro' ? 'Si no lo usas, es tuyo' : 'Diferencia se ajusta con la empresa';
  });
  const totalDisplay = document.getElementById('rubros-total-display');
  if (totalDisplay) totalDisplay.textContent = money(total, symbol);
}

function bindNewTripEvents() {
  const form = document.getElementById('new-trip-form');

  form.addEventListener('input', (e) => {
    if (e.target.closest('.rubro-form-row')) updateRubrosTotal();
    if (e.target.id === 'f-moneda') updateRubrosTotal();
  });
  form.addEventListener('change', (e) => {
    if (e.target.closest('.rubro-form-row')) updateRubrosTotal();
    if (e.target.id === 'f-moneda') updateRubrosTotal();
  });

  document.getElementById('f-moneda').addEventListener('change', updateRubrosTotal);

  const copiarSel = document.getElementById('f-copiar');
  if (copiarSel) {
    copiarSel.addEventListener('change', () => {
      if (!copiarSel.value) return;
      const src = getTrip(copiarSel.value);
      if (!src) return;
      newTripRubros = src.rubros.map(r => ({
        _key: uid(), nombre: r.nombre, precioUnitario: r.precioUnitario,
        cantidad: r.cantidad, porDia: r.porDia, tipo: r.tipo
      }));
      renderRubroRows();
      showToast('Presupuesto copiado de "' + src.nombre + '"');
    });
  }

  form.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-action="add-rubro-row"]');
    if (addBtn) {
      syncRubrosFromDOM();
      newTripRubros.push(blankRubro());
      renderRubroRows();
      return;
    }
    const loadEx = e.target.closest('[data-action="load-example"]');
    if (loadEx) {
      newTripRubros = RUBRO_PRESETS.map(p => ({ _key: uid(), ...p }));
      renderRubroRows();
      showToast('Ejemplo cargado');
      return;
    }
    const removeBtn = e.target.closest('[data-action="remove-rubro-row"]');
    if (removeBtn) {
      syncRubrosFromDOM();
      const key = removeBtn.closest('.rubro-form-row').dataset.key;
      newTripRubros = newTripRubros.filter(r => r._key !== key);
      if (newTripRubros.length === 0) newTripRubros.push(blankRubro());
      renderRubroRows();
      return;
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    syncRubrosFromDOM();
    const nombre = document.getElementById('f-nombre').value.trim();
    const destino = document.getElementById('f-destino').value.trim();
    const fechaInicio = document.getElementById('f-inicio').value;
    const fechaFinPlan = document.getElementById('f-fin').value;
    const moneda = document.getElementById('f-moneda').value;

    if (!nombre) { showToast('Ponle un nombre al viaje'); return; }
    if (!fechaInicio || !fechaFinPlan) { showToast('Selecciona las fechas del viaje'); return; }
    if (fechaFinPlan < fechaInicio) { showToast('La fecha fin no puede ser antes del inicio'); return; }

    const rubrosValidos = newTripRubros.filter(r => r.nombre && r.precioUnitario > 0 && r.cantidad > 0);
    if (rubrosValidos.length === 0) { showToast('Agrega al menos un rubro de presupuesto'); return; }

    const trip = {
      id: uid(),
      nombre, destino, moneda,
      fechaInicio, fechaFinPlan, fechaFinReal: null,
      cerrado: false,
      createdAt: Date.now(),
      rubros: [],
      items: []
    };
    rubrosValidos.forEach(r => {
      const rubro = { id: uid(), nombre: r.nombre, precioUnitario: r.precioUnitario, cantidad: r.cantidad, porDia: r.porDia, tipo: r.tipo };
      trip.rubros.push(rubro);
      trip.items.push(...generateItemsForRubro(trip, rubro));
    });

    state.trips.push(trip);
    saveState();
    newTripRubros = [];
    nav.view = 'trip';
    nav.tripId = trip.id;
    nav.tab = 'resumen';
    render();
    showToast('Viaje creado');
  });
}

/* ---------------- Vista: Detalle de viaje ---------------- */

function renderTripDetail() {
  const trip = getTrip(nav.tripId);
  if (!trip) { nav.view = 'home'; return renderHome(); }
  const totals = computeTotals(trip);

  appEl.innerHTML = `
    <div class="appbar">
      <button class="icon-btn" data-action="go-home">←</button>
      <h1>${esc(trip.nombre)}<span class="sub">${esc(trip.destino || '')}</span></h1>
      <button class="icon-btn" data-action="open-trip-menu">⋮</button>
    </div>
    <div class="tabs">
      <button class="tab ${nav.tab === 'resumen' ? 'active' : ''}" data-action="tab" data-tab="resumen">Resumen</button>
      <button class="tab ${nav.tab === 'registrar' ? 'active' : ''}" data-action="tab" data-tab="registrar">Registrar</button>
      <button class="tab ${nav.tab === 'presupuesto' ? 'active' : ''}" data-action="tab" data-tab="presupuesto">Presupuesto</button>
    </div>
    <div class="content" id="tab-content">
      ${nav.tab === 'resumen' ? renderResumenTab(trip, totals) : ''}
      ${nav.tab === 'registrar' ? renderRegistrarTab(trip) : ''}
      ${nav.tab === 'presupuesto' ? renderPresupuestoTab(trip) : ''}
    </div>
  `;
}

function renderResumenTab(trip, t) {
  const symbol = trip.moneda;
  const finTxt = trip.fechaFinReal
    ? `${formatDateShort(trip.fechaInicio)} — ${formatDateShort(trip.fechaFinReal)} <span class="badge devolver">Acortado</span>`
    : `${formatDateShort(trip.fechaInicio)} — ${formatDateShort(trip.fechaFinPlan)}`;

  return `
    <div class="card">
      <div class="small muted">Periodo del viaje</div>
      <div style="font-weight:700;margin-top:2px">${finTxt}</div>
    </div>

    <div class="summary-grid">
      <div class="stat primary wide">
        <div class="label">Recibido de la empresa</div>
        <div class="value">${money(t.recibido, symbol)}</div>
      </div>
      <div class="stat info">
        <div class="label">Gastado y comprobado</div>
        <div class="value">${money(t.gastoComprobado, symbol)}</div>
      </div>
      <div class="stat">
        <div class="label">Pendiente de registrar</div>
        <div class="value">${money(t.pendienteMonto, symbol)}</div>
      </div>
      <div class="stat success">
        <div class="label">Tuyo (ahorro, no se devuelve)</div>
        <div class="value">${money(t.ahorroPersonal, symbol)}</div>
      </div>
      <div class="stat danger">
        <div class="label">A devolver a la empresa</div>
        <div class="value">${money(t.aDevolver, symbol)}</div>
      </div>
      ${t.aReembolsar > 0 ? `
      <div class="stat info wide">
        <div class="label">La empresa te debe reembolsar</div>
        <div class="value">${money(t.aReembolsar, symbol)}</div>
      </div>` : ''}
      ${t.gastoPropioExtra > 0 ? `
      <div class="stat wide">
        <div class="label">Gastaste de más (sin reembolso)</div>
        <div class="value">${money(t.gastoPropioExtra, symbol)}</div>
      </div>` : ''}
    </div>

    <div class="card">
      <h3>Detalle por rubro</h3>
      <div class="list">
        ${trip.rubros.map(r => {
          const rt = rubroTotals(trip, r);
          return `<div class="rubro-row" style="cursor:default">
            <div class="top">
              <span class="title">${esc(r.nombre)}</span>
              <span class="rubro-legend ${r.tipo}">${r.tipo === 'ahorro' ? 'Ahorro' : 'Reembolsable'}</span>
            </div>
            <div class="meta">
              <span>Presupuesto: ${money(rt.presupuestado, symbol)}</span>
              <span>·</span>
              <span>${rt.registrados}/${rt.total} registrados</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <button class="btn btn-secondary" data-action="share-summary">📤 Compartir liquidación</button>
    ${!trip.cerrado ? `<button class="btn btn-primary" data-action="mark-closed">Marcar viaje como liquidado</button>` : `<button class="btn btn-secondary" data-action="reopen-trip">Reabrir viaje</button>`}
  `;
}

function estadoBadge(item) {
  const map = {
    pendiente: ['pendiente', 'Pendiente'],
    consumido: ['consumido', 'Consumido'],
    ahorro: ['ahorro', 'Es tuyo'],
    devolver: ['devolver', item.auto ? 'Devolver (viaje acortado)' : 'A devolver']
  };
  const [cls, label] = map[item.estado] || map.pendiente;
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderRegistrarTab(trip) {
  const items = [...trip.items].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.index - b.index);
  const grouped = {};
  items.forEach(i => { (grouped[i.fecha] = grouped[i.fecha] || []).push(i); });
  const dates = Object.keys(grouped).sort();

  if (items.length === 0) {
    return `<div class="empty-state"><span class="emoji">🧾</span><p>Todavía no hay rubros de presupuesto. Ve a la pestaña <b>Presupuesto</b> para agregarlos.</p></div>`;
  }

  return `
    ${!trip.fechaFinReal ? `<button class="btn btn-secondary" data-action="open-shorten">✂️ Acortar / cerrar viaje antes de lo planeado</button>` :
      `<div class="card small"><b>Viaje acortado.</b> Termina el ${formatDateShort(trip.fechaFinReal)}. <button class="link-btn" data-action="undo-shorten">Deshacer</button></div>`}
    ${dates.map(date => `
      <div class="date-group">
        <div class="dg-header">
          <span>${formatDateHuman(date)} · ${formatDateShort(date)}</span>
        </div>
        <div class="list">
          ${grouped[date].map(item => itemRowHTML(trip, item)).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function itemRowHTML(trip, item) {
  const rubro = rubroMapOf(trip)[item.rubroId];
  const tipo = rubro ? rubro.tipo : 'ahorro';
  let realLine = '';
  if (item.estado === 'consumido') {
    const diff = item.presupuesto - Number(item.montoReal);
    if (Math.abs(diff) > 0.005) {
      realLine = `<div class="real up">Gastó ${money(item.montoReal, trip.moneda)} (${diff > 0 ? (tipo === 'ahorro' ? 'ahorró ' : 'devuelve ') : (tipo === 'ahorro' ? 'extra propio ' : 'le reembolsan ')}${money(Math.abs(diff), trip.moneda)})</div>`;
    } else if (item.detalle && item.detalle.length > 1) {
      realLine = `<div class="real up">Gastó ${money(item.montoReal, trip.moneda)}</div>`;
    }
  }
  const detalleLine = (item.detalle && item.detalle.length > 1)
    ? `<div class="real small">${item.detalle.map(d => esc(d.concepto) || 'Gasto').join(' + ')}</div>`
    : '';
  return `
    <div class="item-row" data-action="open-item" data-id="${item.id}">
      <div class="top">
        <span class="title">${esc(itemLabel(trip, item))}</span>
        ${estadoBadge(item)}
      </div>
      <div class="meta">
        <span>Presupuesto: ${money(item.presupuesto, trip.moneda)}</span>
        <span class="rubro-legend ${tipo}" style="padding:1px 7px">${tipo === 'ahorro' ? 'Ahorro' : 'Reembolsable'}</span>
      </div>
      ${realLine}
      ${detalleLine}
    </div>`;
}

function renderPresupuestoTab(trip) {
  const symbol = trip.moneda;
  const total = trip.rubros.reduce((s, r) => s + r.precioUnitario * r.cantidad, 0);
  return `
    <div class="list">
      ${trip.rubros.map(r => {
        const rt = rubroTotals(trip, r);
        return `
        <div class="rubro-row" data-action="rubro-menu" data-id="${r.id}">
          <div class="top">
            <span class="title">${esc(r.nombre)}</span>
            <span class="rubro-legend ${r.tipo}">${r.tipo === 'ahorro' ? 'Ahorro' : 'Reembolsable'}</span>
          </div>
          <div class="meta">
            <span>${money(r.precioUnitario, symbol)} × ${r.cantidad}${r.porDia ? ' (por día)' : ''}</span>
            <span>·</span>
            <span>Total: ${money(r.precioUnitario * r.cantidad, symbol)}</span>
          </div>
          <div class="meta"><span>${rt.registrados}/${rt.total} registrados</span></div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="rf-head">
        <span class="muted small">Total presupuesto del viaje</span>
        <span class="rf-total">${money(total, symbol)}</span>
      </div>
    </div>
    <button class="btn btn-secondary" data-action="add-rubro-existing">+ Agregar rubro</button>
  `;
}

/* ---------------- Sheets (modales inferiores) ---------------- */

const sheetEl = document.getElementById('sheet-root');
const backdropEl = document.getElementById('sheet-backdrop');

let sheetClearTimer = null;
function openSheet(html) {
  clearTimeout(sheetClearTimer);
  sheetEl.innerHTML = `<div class="handle"></div>${html}`;
  sheetEl.classList.add('open');
  backdropEl.classList.add('open');
}
function closeSheet() {
  sheetEl.classList.remove('open');
  backdropEl.classList.remove('open');
  clearTimeout(sheetClearTimer);
  sheetClearTimer = setTimeout(() => { sheetEl.innerHTML = ''; }, 200);
}
backdropEl.addEventListener('click', closeSheet);

function openTripMenuSheet(trip) {
  openSheet(`
    <h2>${esc(trip.nombre)}</h2>
    <div class="actions" style="margin-top:8px">
      <button class="btn btn-secondary" data-action="share-summary">📤 Compartir liquidación</button>
      ${!trip.cerrado ? `<button class="btn btn-secondary" data-action="mark-closed">✅ Marcar como liquidado</button>` : `<button class="btn btn-secondary" data-action="reopen-trip">↩️ Reabrir viaje</button>`}
      <button class="btn btn-danger" data-action="delete-trip">🗑 Eliminar viaje</button>
      <button class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
    </div>
  `);
}

function openShortenSheet(trip) {
  const defaultDate = trip.fechaFinReal || trip.fechaFinPlan;
  openSheet(`
    <h2>Acortar viaje</h2>
    <div class="sheet-sub">Si regresaste antes de lo planeado, indica hasta qué día realmente viajaste. Los gastos pendientes de días posteriores se marcarán automáticamente como "a devolver".</div>
    <div class="field">
      <label for="sh-fecha">Último día del viaje (real)</label>
      <input type="date" id="sh-fecha" value="${defaultDate}" min="${trip.fechaInicio}">
    </div>
    <div id="sh-preview" class="note"></div>
    <div class="actions" style="margin-top:12px">
      <button class="btn btn-primary" data-action="confirm-shorten">Confirmar</button>
      <button class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
    </div>
  `);
  const input = document.getElementById('sh-fecha');
  const updatePreview = () => {
    const val = input.value;
    const prev = shortenTripPreview(trip, val);
    document.getElementById('sh-preview').textContent = prev.count
      ? `Se marcarán ${prev.count} registro(s) pendientes como "a devolver" por un total de ${money(prev.monto, trip.moneda)}.`
      : 'No hay registros pendientes después de esa fecha.';
  };
  input.addEventListener('change', updatePreview);
  updatePreview();
}

let detalleDraft = [];

function detalleTotal() {
  return detalleDraft.reduce((s, d) => s + (Number(d.monto) || 0), 0);
}

function renderDetalleList(trip) {
  const list = document.getElementById('detalle-list');
  const totalEl = document.getElementById('detalle-total');
  if (!list) return;
  list.innerHTML = detalleDraft.map((d, i) => `
    <div class="rubro-form-row" style="padding:8px 10px;flex-direction:row;align-items:center;justify-content:space-between">
      <span class="small">${esc(d.concepto) || 'Gasto'} — ${money(d.monto, trip.moneda)}</span>
      <button type="button" class="btn-sm btn-ghost" data-action="detalle-remove" data-idx="${i}" style="padding:2px 6px;color:var(--danger)">Quitar</button>
    </div>`).join('');
  if (totalEl) totalEl.textContent = money(detalleTotal(), trip.moneda);
}

function openItemSheet(trip, item) {
  currentItemId = item.id;
  const rubro = rubroMapOf(trip)[item.rubroId];
  const tipo = rubro ? rubro.tipo : 'ahorro';
  const nombre = itemLabel(trip, item);
  detalleDraft = item.detalle && item.detalle.length ? item.detalle.map(d => ({ ...d })) : [];

  const noUsadoBtn = tipo === 'ahorro'
    ? `<button class="btn btn-success" data-action="reg-ahorro">😊 No lo usé — es mío (ahorro)</button>`
    : '';

  openSheet(`
    <h2>${esc(nombre)}</h2>
    <div class="sheet-sub">Presupuesto: ${money(item.presupuesto, trip.moneda)} · ${TIPO_LABEL[tipo]}</div>
    <div class="field">
      <label for="item-fecha-edit">Fecha</label>
      <input type="date" id="item-fecha-edit" value="${item.fecha}">
    </div>

    <div class="actions">
      <button class="btn btn-primary" data-action="reg-igual">✅ Gasté igual (${money(item.presupuesto, trip.moneda)})</button>
      <button class="btn btn-secondary" data-action="reg-diferente-toggle">✏️ Registrar lo que gasté (puedes agregar varios)</button>
      <div id="diferente-box" style="display:none" class="stack">
        <div id="detalle-list" class="stack"></div>
        <div class="row2">
          <div class="field"><label for="detalle-concepto">Concepto (opcional)</label><input type="text" id="detalle-concepto" placeholder="Ej. Café"></div>
          <div class="field"><label for="detalle-monto">Monto</label><input type="number" id="detalle-monto" min="0" step="0.01" inputmode="decimal"></div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="detalle-add">+ Agregar gasto</button>
        <div class="rf-head"><span class="muted small">Total gastado</span><span class="rf-total" id="detalle-total">${money(0, trip.moneda)}</span></div>
        <button class="btn btn-primary" data-action="reg-diferente-confirm">Guardar</button>
      </div>
      ${noUsadoBtn}
      <button class="btn btn-danger" data-action="reg-devolver">↩️ No lo usé — debo devolverlo</button>
      ${item.estado !== 'pendiente' ? `<button class="btn btn-ghost" data-action="reg-undo">Volver a pendiente</button>` : ''}
      <button class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
    </div>
    <div class="note">
      Puedes registrar más de un gasto contra este rubro (ej. almuerzo + un café) — se suman para el total. Si el total pasa el presupuesto,
      ${tipo === 'ahorro'
        ? ' esa diferencia queda de tu bolsillo, no te la reembolsan.'
        : ' la empresa te reembolsa la diferencia (este rubro es reembolsable).'}
    </div>
    <div class="note">
      ${tipo === 'ahorro'
        ? 'Este rubro es de tipo <b>ahorro</b>: si no lo usas mientras el viaje sigue en pie, el dinero se queda contigo. Si el viaje termina antes, ese día se marca para devolver.'
        : 'Este rubro es <b>reembolsable</b>: si gastas menos, devuelves la diferencia; si gastas más, la empresa te la reembolsa.'}
    </div>
  `);

  renderDetalleList(trip);

  document.querySelector('[data-action="reg-diferente-toggle"]').addEventListener('click', () => {
    const box = document.getElementById('diferente-box');
    box.style.display = box.style.display === 'none' ? 'flex' : 'none';
    box.style.flexDirection = 'column';
    box.style.gap = '10px';
    if (box.style.display !== 'none') document.getElementById('detalle-concepto').focus();
  });

  document.getElementById('item-fecha-edit').addEventListener('change', (e) => {
    if (!e.target.value) return;
    item.fecha = e.target.value;
    saveState();
    render();
  });
}

/* ---------------- Acciones globales (delegación de eventos) ---------------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'new-trip':
      newTripRubros = [];
      nav.view = 'newTrip';
      render();
      break;
    case 'go-home':
      nav.view = 'home';
      render();
      break;
    case 'toggle-closed':
      nav.showClosed = !nav.showClosed;
      render();
      break;
    case 'open-trip':
      nav.view = 'trip';
      nav.tripId = el.dataset.id;
      nav.tab = 'resumen';
      render();
      break;
    case 'tab':
      nav.tab = el.dataset.tab;
      render();
      break;
    case 'open-trip-menu': {
      const trip = getTrip(nav.tripId);
      openTripMenuSheet(trip);
      break;
    }
    case 'close-sheet':
      closeSheet();
      break;
    case 'open-shorten': {
      const trip = getTrip(nav.tripId);
      openShortenSheet(trip);
      break;
    }
    case 'confirm-shorten': {
      const trip = getTrip(nav.tripId);
      const val = document.getElementById('sh-fecha').value;
      if (!val) { showToast('Selecciona una fecha'); break; }
      applyShortenTrip(trip, val);
      saveState();
      closeSheet();
      render();
      showToast('Viaje acortado. Se actualizaron los pendientes.');
      break;
    }
    case 'undo-shorten': {
      const trip = getTrip(nav.tripId);
      undoShortenTrip(trip);
      saveState();
      render();
      showToast('Se deshizo el acortamiento del viaje');
      break;
    }
    case 'mark-closed': {
      const trip = getTrip(nav.tripId);
      trip.cerrado = true;
      saveState();
      closeSheet();
      render();
      showToast('Viaje marcado como liquidado');
      break;
    }
    case 'reopen-trip': {
      const trip = getTrip(nav.tripId);
      trip.cerrado = false;
      saveState();
      closeSheet();
      render();
      break;
    }
    case 'delete-trip': {
      const trip = getTrip(nav.tripId);
      if (confirm(`¿Eliminar el viaje "${trip.nombre}"? Esta acción no se puede deshacer.`)) {
        state.trips = state.trips.filter(t => t.id !== trip.id);
        saveState();
        closeSheet();
        nav.view = 'home';
        render();
        showToast('Viaje eliminado');
      }
      break;
    }
    case 'share-summary': {
      const trip = getTrip(nav.tripId);
      shareSummary(trip);
      break;
    }
    case 'open-item': {
      const trip = getTrip(nav.tripId);
      const item = trip.items.find(i => i.id === el.dataset.id);
      openItemSheet(trip, item);
      break;
    }
    case 'reg-igual': registrarDesdeSheet('igual'); break;
    case 'reg-diferente-confirm': registrarDesdeSheet('diferente'); break;
    case 'reg-ahorro': registrarDesdeSheet('ahorro'); break;
    case 'reg-devolver': registrarDesdeSheet('devolver'); break;
    case 'reg-undo': registrarDesdeSheet('undo'); break;
    case 'detalle-add': {
      const trip = getTrip(nav.tripId);
      const monto = parseFloat(document.getElementById('detalle-monto').value);
      if (isNaN(monto) || monto <= 0) { showToast('Ingresa un monto válido'); break; }
      const concepto = document.getElementById('detalle-concepto').value.trim();
      detalleDraft.push({ concepto, monto });
      document.getElementById('detalle-concepto').value = '';
      document.getElementById('detalle-monto').value = '';
      document.getElementById('detalle-concepto').focus();
      renderDetalleList(trip);
      break;
    }
    case 'detalle-remove': {
      const trip = getTrip(nav.tripId);
      detalleDraft.splice(Number(el.dataset.idx), 1);
      renderDetalleList(trip);
      break;
    }
    case 'add-rubro-existing': {
      const trip = getTrip(nav.tripId);
      openAddRubroSheet(trip);
      break;
    }
    case 'confirm-add-rubro': confirmAddRubro(); break;
    case 'rubro-menu': {
      const trip = getTrip(nav.tripId);
      const rubro = trip.rubros.find(r => r.id === el.dataset.id);
      openRubroMenuSheet(trip, rubro);
      break;
    }
    case 'delete-rubro': {
      const trip = getTrip(nav.tripId);
      const rubroId = el.dataset.id;
      const rubro = trip.rubros.find(r => r.id === rubroId);
      if (confirm(`¿Eliminar el rubro "${rubro.nombre}" y sus ${trip.items.filter(i=>i.rubroId===rubroId).length} registro(s)?`)) {
        trip.rubros = trip.rubros.filter(r => r.id !== rubroId);
        trip.items = trip.items.filter(i => i.rubroId !== rubroId);
        saveState();
        closeSheet();
        render();
        showToast('Rubro eliminado');
      }
      break;
    }
  }
});

let currentItemId = null;

function registrarDesdeSheet(kind) {
  const trip = getTrip(nav.tripId);
  const item = trip.items.find(i => i.id === currentItemId);
  if (!item) return;

  if (kind === 'igual') {
    item.estado = 'consumido'; item.montoReal = item.presupuesto; item.detalle = []; item.auto = false;
  } else if (kind === 'diferente') {
    if (detalleDraft.length === 0) { showToast('Agrega al menos un gasto'); return; }
    item.estado = 'consumido'; item.montoReal = detalleDraft.reduce((s, d) => s + (Number(d.monto) || 0), 0);
    item.detalle = detalleDraft.map(d => ({ ...d })); item.auto = false;
  } else if (kind === 'ahorro') {
    item.estado = 'ahorro'; item.montoReal = 0; item.detalle = []; item.auto = false;
  } else if (kind === 'devolver') {
    item.estado = 'devolver'; item.montoReal = 0; item.detalle = []; item.auto = false;
  } else if (kind === 'undo') {
    item.estado = 'pendiente'; item.montoReal = null; item.detalle = []; item.auto = false;
  }
  saveState();
  closeSheet();
  render();
}

function openAddRubroSheet(trip) {
  const draft = blankRubro();
  openSheet(`
    <h2>Agregar rubro</h2>
    <div class="stack" id="add-rubro-box">
      <div class="field"><input type="text" id="ar-nombre" placeholder="Nombre (ej. Almuerzo)"></div>
      <div class="row2">
        <div class="field"><label>Precio unitario</label><input type="number" id="ar-precio" min="0" step="0.01" value="0"></div>
        <div class="field"><label># veces</label><input type="number" id="ar-cantidad" min="1" step="1" value="1"></div>
      </div>
      <div class="field"><label>Tipo</label>
        <select id="ar-tipo">
          <option value="ahorro">Ahorro (si no lo uso, es mío)</option>
          <option value="reembolsable">Reembolsable (se ajusta con la empresa)</option>
        </select>
      </div>
      <label class="checkline"><input type="checkbox" id="ar-pordia" checked> Repartir por día</label>
    </div>
    <div class="actions" style="margin-top:12px">
      <button class="btn btn-primary" data-action="confirm-add-rubro">Agregar</button>
      <button class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
    </div>
  `);
}

function confirmAddRubro() {
  const trip = getTrip(nav.tripId);
  const nombre = document.getElementById('ar-nombre').value.trim();
  const precioUnitario = parseFloat(document.getElementById('ar-precio').value) || 0;
  const cantidad = Math.max(1, parseInt(document.getElementById('ar-cantidad').value, 10) || 1);
  const tipo = document.getElementById('ar-tipo').value;
  const porDia = document.getElementById('ar-pordia').checked;
  if (!nombre || precioUnitario <= 0) { showToast('Completa nombre y precio'); return; }
  const rubro = { id: uid(), nombre, precioUnitario, cantidad, porDia, tipo };
  trip.rubros.push(rubro);
  trip.items.push(...generateItemsForRubro(trip, rubro));
  saveState();
  closeSheet();
  render();
  showToast('Rubro agregado');
}

function openRubroMenuSheet(trip, rubro) {
  const rt = rubroTotals(trip, rubro);
  openSheet(`
    <h2>${esc(rubro.nombre)}</h2>
    <div class="sheet-sub">${money(rubro.precioUnitario, trip.moneda)} × ${rubro.cantidad} = ${money(rubro.precioUnitario * rubro.cantidad, trip.moneda)} · ${rt.registrados}/${rt.total} registrados</div>
    <div class="actions">
      <button class="btn btn-danger" data-action="delete-rubro" data-id="${rubro.id}">🗑 Eliminar rubro</button>
      <button class="btn btn-ghost" data-action="close-sheet">Cerrar</button>
    </div>
  `);
}

/* ---------------- Compartir / exportar resumen ---------------- */

function buildSummaryText(trip) {
  const t = computeTotals(trip);
  const symbol = trip.moneda;
  const lines = [];
  lines.push(`📋 Liquidación de viáticos — ${trip.nombre}`);
  if (trip.destino) lines.push(trip.destino);
  const fin = trip.fechaFinReal || trip.fechaFinPlan;
  lines.push(`${formatDateShort(trip.fechaInicio)} — ${formatDateShort(fin)}${trip.fechaFinReal ? ' (viaje acortado)' : ''}`);
  lines.push('');
  lines.push('Detalle por rubro:');
  trip.rubros.forEach(r => {
    const rt = rubroTotals(trip, r);
    lines.push(`- ${r.nombre}: presupuesto ${money(rt.presupuestado, symbol)} · gastado ${money(rt.consumidoReal, symbol)} (${rt.registrados}/${rt.total} registrados)`);
  });
  lines.push('');
  lines.push('Resumen:');
  lines.push(`Recibido: ${money(t.recibido, symbol)}`);
  lines.push(`Gastado y comprobado: ${money(t.gastoComprobado, symbol)}`);
  lines.push(`Tuyo (ahorro, no se devuelve): ${money(t.ahorroPersonal, symbol)}`);
  lines.push(`A devolver a la empresa: ${money(t.aDevolver, symbol)}`);
  if (t.aReembolsar > 0) lines.push(`La empresa te debe reembolsar: ${money(t.aReembolsar, symbol)}`);
  if (t.gastoPropioExtra > 0) lines.push(`Gastado de más (sin reembolso): ${money(t.gastoPropioExtra, symbol)}`);
  if (t.pendienteMonto > 0) lines.push(`Pendiente de registrar: ${money(t.pendienteMonto, symbol)} (${t.pendienteCount})`);
  return lines.join('\n');
}

async function shareSummary(trip) {
  const text = buildSummaryText(trip);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Liquidación de viáticos - ' + trip.nombre, text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Resumen copiado al portapapeles');
  } catch (err) {
    showToast('No se pudo compartir. Copia manualmente desde el resumen.');
  }
}

/* ---------------- Toasts ---------------- */

let toastTimer = null;
function showToast(msg) {
  const root = document.getElementById('toast-root');
  root.innerHTML = `<div class="toast" id="active-toast">${esc(msg)}</div>`;
  const t = document.getElementById('active-toast');
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { root.innerHTML = ''; }, 200);
  }, 2500);
}

/* ---------------- Arranque ---------------- */

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
