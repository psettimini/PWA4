/* ========================================
   UTILIDADES — Funciones puras y helpers
   utils.js
======================================== */
import { $, S, STORAGE_KEYS } from './state.js';

export const safeNumber = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const formatearNumero = n => parseInt(n || 0, 10).toLocaleString('es-AR');

export function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function localMesStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
export function setFechaHoy() { if ($('fecha')) $('fecha').value = localDateStr(); }

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const escapeHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export const escapeAttr = s => escapeHtml(s);
export const csvEscape = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export const getMesKey = f => f ? String(f).slice(0, 7) : '';
export const uniqueSorted = vals => [...new Set(vals.filter(Boolean))].sort();
export const destroyChart = n => { if (S.charts[n]) { S.charts[n].destroy(); S.charts[n] = null; } };
export const showLoading = show => $('loading')?.classList.toggle('hidden', !show);

export function formatMesLabel(m) {
  if (!m) return '';
  const n = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const [a, ms] = m.split('-');
  return `${n[parseInt(ms,10)-1]} ${a}`;
}

export function getDateGroupLabel(fechaStr) {
  if (!fechaStr) return 'Sin fecha';
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const fecha = new Date(fechaStr + 'T00:00:00'); fecha.setHours(0,0,0,0);
  const diffDays = Math.floor((hoy - fecha) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays >= 2 && diffDays <= 6) return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][fecha.getDay()];
  if (diffDays >= 7 && diffDays <= 13) return 'Semana pasada';
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if (fecha.getFullYear() === hoy.getFullYear()) return meses[fecha.getMonth()];
  return `${meses[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

export function formatFechaCorta(fechaStr) {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr + 'T00:00:00');
  return `${fecha.getDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][fecha.getMonth()]}`;
}

export function aggregateBy(items, keyFn, valFn = x => safeNumber(x.Importe)) {
  const acc = Object.create(null);
  for (const i of items) { const k = keyFn(i); acc[k] = (acc[k]||0) + valFn(i); }
  return acc;
}

/* ── Cache y cola offline ── */
export function getPendingQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.pendingQueue) || '[]'); } catch { return []; }
}
export function setPendingQueue(queue) {
  localStorage.setItem(STORAGE_KEYS.pendingQueue, JSON.stringify(queue));
  updatePendingBadge();
}
export function enqueueOperation(item) {
  const queue = getPendingQueue();
  queue.push({ ...item, queuedAt: new Date().toISOString() });
  setPendingQueue(queue);
}

export function saveCache(data) {
  try {
    localStorage.setItem(STORAGE_KEYS.dataCache, JSON.stringify(data || []));
    localStorage.setItem(STORAGE_KEYS.cacheMeta, JSON.stringify({ savedAt: new Date().toISOString(), count: Array.isArray(data) ? data.length : 0 }));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      try { localStorage.removeItem(STORAGE_KEYS.dataCache); localStorage.setItem(STORAGE_KEYS.dataCache, JSON.stringify(data || [])); localStorage.setItem(STORAGE_KEYS.cacheMeta, JSON.stringify({ savedAt: new Date().toISOString(), count: Array.isArray(data) ? data.length : 0 })); } catch {}
    }
  }
  updateCacheLabel();
}
export function loadCache() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.dataCache) || '[]'); } catch { return []; }
}

export function updateCacheLabel() {
  const el = $('cache-label'); if (!el) return;
  try {
    const meta = JSON.parse(localStorage.getItem(STORAGE_KEYS.cacheMeta) || 'null');
    if (!meta?.savedAt) { el.textContent = 'Sin caché'; return; }
    const d = new Date(meta.savedAt);
    el.textContent = `Caché: ${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch { el.textContent = 'Caché disponible'; }
}

export function updateNetworkStatus(label, tone = 'ok') {
  const dot = $('network-dot'), text = $('network-label');
  if (text) text.textContent = label;
  if (dot) dot.className = 'inline-block w-2.5 h-2.5 rounded-full ' + (tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-red-500');
}

export function updatePendingBadge() {
  const n = getPendingQueue().length;
  const badge = $('pending-badge'), btn = $('btn-sync-pending');
  if (!badge || !btn) return;
  badge.textContent = `${n} pendiente${n === 1 ? '' : 's'}`;
  badge.classList.toggle('hidden', n === 0);
  btn.classList.toggle('hidden', n === 0);
}

export function persistHistoryFilters() {
  localStorage.setItem(STORAGE_KEYS.historyFilters, JSON.stringify({
    buscar: $('buscar-historial')?.value || '', centro: $('filtro-centro')?.value || 'todos',
    tipo: $('filtro-tipo')?.value || 'todos', metodo: $('filtro-metodo')?.value || 'todos',
    mes: $('filtro-mes-historial')?.value || 'todos'
  }));
}
export function restoreHistoryFilters() {
  try {
    const f = JSON.parse(localStorage.getItem(STORAGE_KEYS.historyFilters) || 'null'); if (!f) return;
    if ($('buscar-historial')) $('buscar-historial').value = f.buscar || '';
    if ($('filtro-centro')) $('filtro-centro').value = f.centro || 'todos';
    if ($('filtro-tipo')) $('filtro-tipo').value = f.tipo || 'todos';
    if ($('filtro-metodo')) $('filtro-metodo').value = f.metodo || 'todos';
    if ($('filtro-mes-historial')) $('filtro-mes-historial').value = f.mes || 'todos';
  } catch {}
}

export function descargarCSV(nombre, contenido) {
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = nombre; link.click();
}
