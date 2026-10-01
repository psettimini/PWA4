/* ========================================
   HOGAR — Libros compartidos, pills, aprobación y pases
   hogar.js

   Modelo (ver supabase/migrations/20261001_hogar_libros_ingresos.sql):
   - Un hogar tiene miembros (alias + color del pill) y libros (Pablo, Raquel, Consultorio).
   - Cada movimiento tiene libro (de quién es) y user_id (quién lo cargó → pill).
   - Lo que alguien carga en un libro ajeno queda 'pendiente' hasta que lo apruebe el titular.
   - Pase: gasto del libro origen con pase_libro_id; del lado destino hay un movimiento
     con pase_origen_id (ingreso = aporte, gasto = pago por cuenta).

   Usuarios sin hogar: S.libros vacío y todo funciona como antes.
======================================== */
import { $, S, sb, registry, STORAGE_KEYS } from './state.js';
import { escapeHtml, escapeAttr, formatImporteSigned, formatFechaCorta, showLoading } from './utils.js';
import { toast, toastError, toastWarn, modalConfirm } from './ui.js';

export const HOGAR = 'hogar';

/* ── Consultas básicas ── */
export const tieneHogar = () => S.libros.length > 0;
export const libroPorId = id => S.libros.find(l => l.id === id) || null;
export const misLibros = () => S.libros.filter(l => l.titular_id === S.currentUserId);
export const esTitular = libroId => libroPorId(libroId)?.titular_id === S.currentUserId;
const estadoDe = m => m.Estado || 'aprobado';

/* Libro donde va lo que se carga en el formulario. */
export function libroCarga() {
  if (!tieneHogar()) return null;
  const sel = $('libro-carga')?.value;
  if (sel && esTitular(sel)) return sel;
  if (esTitular(S.libroActivo)) return S.libroActivo;
  return misLibros()[0]?.id || null;
}

/* Libro personal propio: contra él se calculan presupuesto, fijos pendientes y duplicados. */
export const libroPersonalPropio = () => misLibros().find(l => l.tipo === 'personal')?.id || misLibros()[0]?.id || null;

/* Gastos de un libro (sin rechazados). Sin hogar devuelve todo lo cargado. */
export function gastosDeLibro(libroId) {
  if (!tieneHogar() || !libroId) return S.gastosTodos;
  return S.gastosTodos.filter(g => g.Libro === libroId && estadoDe(g) !== 'rechazado');
}

/* Gastos aprobados del libro personal propio (base del presupuesto). */
export function gastosPropios() {
  if (!tieneHogar()) return S.allData;
  const id = libroPersonalPropio();
  return S.gastosTodos.filter(g => g.Libro === id && estadoDe(g) === 'aprobado');
}

export function puedoEditar(m) {
  if (S.userRole === 'viewer') return false;
  if (!m.Libro) return !m.User || m.User === S.currentUserId;
  return esTitular(m.Libro) || (m.User === S.currentUserId && estadoDe(m) === 'pendiente');
}

/* ── Carga del hogar (con caché para arrancar offline) ── */
export async function cargarHogar() {
  try {
    const [lib, mie] = await Promise.all([
      sb.from('libros').select('id, nombre, tipo, titular_id, orden').order('orden'),
      sb.from('hogar_miembros').select('user_id, alias, color'),
    ]);
    if (lib.error) throw lib.error;
    if (mie.error) throw mie.error;
    S.libros = lib.data || [];
    S.miembros = Object.fromEntries((mie.data || []).map(m => [m.user_id, m]));
    try { localStorage.setItem(STORAGE_KEYS.hogarCache, JSON.stringify({ libros: S.libros, miembros: S.miembros })); } catch {}
  } catch {
    try {
      const c = JSON.parse(localStorage.getItem(STORAGE_KEYS.hogarCache) || 'null');
      if (c) { S.libros = c.libros || []; S.miembros = c.miembros || {}; }
    } catch {}
  }
  const saved = localStorage.getItem(STORAGE_KEYS.libroActivo);
  if (saved === HOGAR || S.libros.some(l => l.id === saved)) S.libroActivo = saved;
  else S.libroActivo = misLibros()[0]?.id || (tieneHogar() ? HOGAR : null);
}

export function resetHogar() {
  S.libros = []; S.miembros = {}; S.libroActivo = null;
  S.gastosTodos = []; S.ingresosTodos = []; S.ingresos = [];
  localStorage.removeItem(STORAGE_KEYS.hogarCache);
}

/* ── Vista por libro ──
   S.gastosTodos / S.ingresosTodos → todo lo visible.
   S.allData / S.ingresos → lo aprobado del libro activo. El resto de la app
   (historial, dashboard, comparar) trabaja sobre S.allData sin enterarse.
   En la vista Hogar un pase se cuenta una sola vez: si el destino ya está
   aprobado, se excluye el gasto origen (y el ingreso-aporte, que es interno). */
export function aplicarLibro() {
  if (!tieneHogar() || !S.libroActivo) {
    S.allData = S.gastosTodos;
    S.ingresos = [];
    return;
  }
  const aprobado = m => estadoDe(m) === 'aprobado';
  if (S.libroActivo === HOGAR) {
    const destinosAprobados = new Set(
      [...S.gastosTodos, ...S.ingresosTodos].filter(m => m.PaseOrigen && aprobado(m)).map(m => m.PaseOrigen)
    );
    S.allData = S.gastosTodos.filter(g => aprobado(g) && !(g.PaseLibro && destinosAprobados.has(g.ID)));
    S.ingresos = S.ingresosTodos.filter(i => aprobado(i) && !i.PaseOrigen);
  } else {
    S.allData = S.gastosTodos.filter(g => aprobado(g) && g.Libro === S.libroActivo);
    S.ingresos = S.ingresosTodos.filter(i => aprobado(i) && i.Libro === S.libroActivo);
  }
}

export function setLibroActivo(id) {
  if (id !== HOGAR && !libroPorId(id)) return;
  S.libroActivo = id;
  localStorage.setItem(STORAGE_KEYS.libroActivo, id);
  aplicarLibro();
  renderSelectorLibro();
  registry.refreshUI?.();
  registry.onTabChange?.(S.currentTab);
}

/* ── Pills ── */
export function pillPersona(userId) {
  const m = S.miembros[userId];
  if (!m) return '';
  return `<span class="pill-persona" style="--pc:${escapeAttr(m.color)}" title="Cargó ${escapeAttr(m.alias)}">${escapeHtml(m.alias)}</span>`;
}

export function pillLibro(libroId) {
  const l = libroPorId(libroId);
  if (!l) return '';
  return `<span class="pill-libro"><i class="fas ${l.tipo === 'negocio' ? 'fa-briefcase' : 'fa-book'} mr-1"></i>${escapeHtml(l.nombre)}</span>`;
}

const ESTADO_LABEL = { pendiente: 'por aprobar', aprobado: 'aprobado', rechazado: 'rechazado' };

/* Estado del destino de cada pase, indexado por el id del gasto origen. */
function estadoPases() {
  const map = new Map();
  for (const m of [...S.gastosTodos, ...S.ingresosTodos]) if (m.PaseOrigen) map.set(m.PaseOrigen, estadoDe(m));
  return map;
}

/* Todos los pills de un movimiento: quién cargó (siempre), libro (en vista Hogar), pase. */
export function pillsMovimiento(m) {
  if (!tieneHogar()) return '';
  let html = pillPersona(m.User);
  /* En Hogar el libro solo aporta si no es el personal de quien cargó (ej. Consultorio, o un pase). */
  const l = libroPorId(m.Libro);
  if (S.libroActivo === HOGAR && l && (l.tipo !== 'personal' || l.titular_id !== m.User)) html += pillLibro(m.Libro);
  if (m.PaseLibro) {
    const est = estadoPases().get(m.ID);
    const dest = libroPorId(m.PaseLibro)?.nombre || '?';
    html += `<span class="pill-pase pill-pase-${est || 'pendiente'}"><i class="fas fa-right-left mr-1"></i>${escapeHtml(dest)}${est && est !== 'aprobado' ? ' · ' + ESTADO_LABEL[est] : ''}</span>`;
  }
  if (m.PaseOrigen) html += `<span class="pill-pase pill-pase-aprobado"><i class="fas fa-right-left mr-1"></i>pase</span>`;
  return html;
}

/* ── Selector de libro ── */
export function renderSelectorLibro() {
  document.body.classList.toggle('con-hogar', tieneHogar());
  const cont = $('libro-selector'); if (!cont) return;
  cont.classList.toggle('hidden', !tieneHogar());
  if (!tieneHogar()) return;
  const chip = (id, label, icon) => `<button type="button" data-action="setLibroActivo" data-libro="${escapeAttr(id)}" class="libro-chip ${S.libroActivo === id ? 'libro-chip-active' : ''}"><i class="fas ${icon} mr-1.5"></i>${escapeHtml(label)}</button>`;
  const n = porAprobar().length;
  cont.innerHTML = `<div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
    ${S.libros.map(l => chip(l.id, l.nombre, l.tipo === 'negocio' ? 'fa-briefcase' : 'fa-book')).join('')}
    ${chip(HOGAR, 'Hogar', 'fa-house')}
    ${n ? `<button type="button" data-action="irABandeja" class="libro-chip libro-chip-alerta"><i class="fas fa-inbox mr-1.5"></i>${n} por aprobar</button>` : ''}
  </div>`;
}

/* ── Bandeja de aprobación ── */
const movimientosPendientes = () => [
  ...S.gastosTodos.filter(g => estadoDe(g) === 'pendiente').map(g => ({ ...g, _tabla: 'gastos' })),
  ...S.ingresosTodos.filter(i => estadoDe(i) === 'pendiente').map(i => ({ ...i, _tabla: 'ingresos' })),
].sort((a, b) => (a.Fecha || '').localeCompare(b.Fecha || ''));

export const porAprobar = () => movimientosPendientes().filter(m => esTitular(m.Libro));
const esperandoAlOtro = () => movimientosPendientes().filter(m => !esTitular(m.Libro) && m.User === S.currentUserId);

function filaBandeja(m, titular) {
  const esIngreso = m._tabla === 'ingresos';
  const signo = esIngreso ? 'text-emerald-600' : '';
  const acciones = titular
    ? `<button data-action="editarPendiente" data-tabla="${m._tabla}" data-id="${escapeAttr(m.ID)}" class="bandeja-btn" title="Editar antes de aprobar"><i class="fas fa-pen"></i></button>
       <button data-action="rechazarMovimiento" data-tabla="${m._tabla}" data-id="${escapeAttr(m.ID)}" class="bandeja-btn bandeja-btn-no" title="Rechazar"><i class="fas fa-times"></i></button>
       <button data-action="aprobarMovimiento" data-tabla="${m._tabla}" data-id="${escapeAttr(m.ID)}" class="bandeja-btn bandeja-btn-ok" title="Aprobar"><i class="fas fa-check"></i></button>`
    : `<button data-action="cancelarPendiente" data-tabla="${m._tabla}" data-id="${escapeAttr(m.ID)}" class="bandeja-btn bandeja-btn-no" title="Retirar"><i class="fas fa-trash"></i></button>`;
  return `<div class="bandeja-fila">
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold truncate">${esIngreso ? '<span class="pill-ingreso">Ingreso</span>' : ''}${escapeHtml(m.Concepto)}</div>
      <div class="text-xs flex flex-wrap items-center gap-1 mt-0.5" style="color:var(--text3)">${formatFechaCorta(m.Fecha)} · ${escapeHtml(m.Centro)} ${pillLibro(m.Libro)} ${pillPersona(m.User)}</div>
      ${m._raw?.nota_revision ? `<div class="text-xs mt-1 text-amber-700"><i class="fas fa-circle-exclamation mr-1"></i>${escapeHtml(m._raw.nota_revision)}</div>` : ''}
    </div>
    <div class="text-sm font-bold font-mono whitespace-nowrap ${signo}">${formatImporteSigned(m.Importe, m.Moneda)}</div>
    <div class="flex gap-1">${acciones}</div>
  </div>`;
}

export function renderBandeja() {
  const cont = $('bandeja-pendientes'); if (!cont) return;
  const mios = porAprobar(), espera = esperandoAlOtro();
  cont.classList.toggle('hidden', !mios.length && !espera.length);
  if (!mios.length && !espera.length) { cont.innerHTML = ''; return; }
  let html = '';
  if (mios.length) {
    html += `<div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
      <h3 class="font-bold"><i class="fas fa-inbox text-amber-500 mr-2"></i>Por aprobar <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-1">${mios.length}</span></h3>
      <button type="button" data-action="aprobarTodos" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"><i class="fas fa-check-double mr-1"></i>Aprobar todos</button>
    </div>
    <div class="space-y-2 max-h-[28rem] overflow-y-auto">${mios.map(m => filaBandeja(m, true)).join('')}</div>`;
  }
  if (espera.length) {
    html += `<h3 class="font-bold text-sm ${mios.length ? 'mt-5' : ''} mb-2" style="color:var(--text2)"><i class="fas fa-hourglass-half mr-2"></i>Esperando aprobación (${espera.length})</h3>
    <div class="space-y-2 max-h-64 overflow-y-auto">${espera.map(m => filaBandeja(m, false)).join('')}</div>`;
  }
  cont.innerHTML = html;
}

export function irABandeja() {
  registry.showTab?.('carga');
  setTimeout(() => $('bandeja-pendientes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

async function cambiarEstado(tabla, ids, estado) {
  if (!ids.length) return;
  showLoading(true);
  try {
    const { error } = await sb.from(tabla).update({ estado }).in('id', ids);
    if (error) throw error;
  } finally { showLoading(false); }
}

export async function aprobarMovimiento(tabla, id) {
  try { await cambiarEstado(tabla, [id], 'aprobado'); toast('Aprobado'); await registry.cargarDatos?.(); }
  catch (e) { toastError(e.message); }
}

export async function rechazarMovimiento(tabla, id) {
  if (!await modalConfirm('¿Rechazar este movimiento? Queda registrado como rechazado y no suma en ningún libro.')) return;
  try { await cambiarEstado(tabla, [id], 'rechazado'); toast('Rechazado'); await registry.cargarDatos?.(); }
  catch (e) { toastError(e.message); }
}

export async function aprobarTodos() {
  const mios = porAprobar();
  if (!mios.length) return;
  if (!await modalConfirm(`¿Aprobar los ${mios.length} movimientos pendientes?`)) return;
  try {
    await cambiarEstado('gastos', mios.filter(m => m._tabla === 'gastos').map(m => m.ID), 'aprobado');
    await cambiarEstado('ingresos', mios.filter(m => m._tabla === 'ingresos').map(m => m.ID), 'aprobado');
    toast(`${mios.length} aprobados`);
    await registry.cargarDatos?.();
  } catch (e) { toastError(e.message); }
}

/* Quien cargó retira un pendiente. Si era un pase, el gasto origen deja de estar marcado. */
export async function cancelarPendiente(tabla, id) {
  const lista = tabla === 'ingresos' ? S.ingresosTodos : S.gastosTodos;
  const m = lista.find(x => x.ID === id); if (!m) return;
  if (!await modalConfirm(`¿Retirar "${m.Concepto}"?`)) return;
  showLoading(true);
  try {
    const { error } = await sb.from(tabla).delete().eq('id', id);
    if (error) throw error;
    if (m.PaseOrigen) {
      const origen = S.gastosTodos.find(g => g.ID === m.PaseOrigen);
      if (origen && esTitular(origen.Libro)) await sb.from('gastos').update({ pase_libro_id: null }).eq('id', origen.ID);
    }
    toast('Retirado');
    await registry.cargarDatos?.();
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

/* ── Pases ──
   El gasto origen queda en su libro (es plata que salió de ahí) marcado con el
   libro destino. Del otro lado se crea el movimiento que corresponda:
   - Aporte: ingreso del libro destino (ej. "X Pablo 1.000.000").
   - Pago por cuenta: gasto del libro destino (ej. Telecom del consultorio pagado con la AMEX de Pablo). */
export function abrirPase(id) {
  const g = S.gastosTodos.find(x => x.ID === id);
  if (!g || !esTitular(g.Libro) || g.PaseLibro) return;
  const destinos = S.libros.filter(l => l.id !== g.Libro);
  if (!destinos.length) return;
  const alias = S.miembros[S.currentUserId]?.alias || 'otro libro';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box pase-box">
    <h3 class="font-bold text-lg mb-1">Registrar pase</h3>
    <p class="text-xs mb-4" style="color:var(--text3)">${escapeHtml(g.Concepto)} · ${formatImporteSigned(g.Importe, g.Moneda)} · ${formatFechaCorta(g.Fecha)}</p>
    <label class="pase-label">Va al libro</label>
    <select id="pase-destino" class="pase-input">${destinos.map(l => `<option value="${escapeAttr(l.id)}">${escapeHtml(l.nombre)}</option>`).join('')}</select>
    <label class="pase-label">Cómo lo registra el otro libro</label>
    <div class="pase-modos">
      <label><input type="radio" name="pase-modo" value="ingreso" checked> <span><strong>Aporte</strong><br><small>Ingreso: plata que le pasaste</small></span></label>
      <label><input type="radio" name="pase-modo" value="gasto"> <span><strong>Pago por cuenta</strong><br><small>Gasto suyo que pagaste vos</small></span></label>
    </div>
    <label class="pase-label">Centro en el libro destino</label>
    <input id="pase-centro" class="pase-input" list="centros-list" value="${escapeAttr('Aportes ' + alias)}">
    <label class="pase-label">Concepto</label>
    <input id="pase-concepto" class="pase-input" value="${escapeAttr(g.Concepto)}">
    <div class="modal-btns mt-4"><button class="modal-btn-cancel" id="pase-no">Cancelar</button><button class="modal-btn-ok pase-ok" id="pase-si">Registrar</button></div>
  </div>`;
  document.body.appendChild(overlay);

  const centro = overlay.querySelector('#pase-centro');
  overlay.querySelectorAll('input[name="pase-modo"]').forEach(r => r.addEventListener('change', () => {
    centro.value = r.value === 'ingreso' ? 'Aportes ' + alias : '';
    if (r.value === 'gasto') centro.focus();
  }));
  const close = () => overlay.remove();
  overlay.querySelector('#pase-no').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#pase-si').onclick = async () => {
    const destino = overlay.querySelector('#pase-destino').value;
    const modo = overlay.querySelector('input[name="pase-modo"]:checked').value;
    const c = centro.value.trim(), concepto = overlay.querySelector('#pase-concepto').value.trim();
    if (!c || !concepto) { toastWarn('Completá centro y concepto'); return; }
    close();
    await registrarPase(g, destino, modo, c, concepto);
  };
}

async function registrarPase(g, destino, modo, centro, concepto) {
  showLoading(true);
  try {
    const base = {
      user_id: S.currentUserId, libro_id: destino, fecha: g.Fecha, centro, concepto,
      metodo: g.Metodo, importe: g.Importe, moneda: g.Moneda || 'ARS',
      estado: esTitular(destino) ? 'aprobado' : 'pendiente', pase_origen_id: g.ID,
    };
    const fila = modo === 'gasto' ? { ...base, tipo: g.Tipo || 'V' } : base;
    const { error } = await sb.from(modo === 'gasto' ? 'gastos' : 'ingresos').insert(fila);
    if (error) throw error;
    const { error: e2 } = await sb.from('gastos').update({ pase_libro_id: destino }).eq('id', g.ID);
    if (e2) throw e2;
    toast(base.estado === 'pendiente' ? 'Pase registrado, queda por aprobar' : 'Pase registrado');
    await registry.cargarDatos?.();
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

/* Para el formulario: opciones de libro en el que el usuario puede cargar. */
export function renderLibroCarga() {
  const wrap = $('libro-carga-wrap'), sel = $('libro-carga');
  if (!wrap || !sel) return;
  const mios = misLibros();
  wrap.classList.toggle('hidden', mios.length < 2 || !!S.editingId);
  const actual = sel.value;
  sel.innerHTML = mios.map(l => `<option value="${escapeAttr(l.id)}">${escapeHtml(l.nombre)}</option>`).join('');
  const preferido = esTitular(S.libroActivo) ? S.libroActivo : (mios.some(l => l.id === actual) ? actual : mios[0]?.id);
  if (preferido) sel.value = preferido;
}
