/* ========================================
   DATA — Carga, cache, sincronización
   data.js — Usa registry.refreshUI para evitar deps circulares
======================================== */
import { $, S, sb, registry, STORAGE_KEYS } from './state.js';
import { saveCache, loadCache, updateNetworkStatus, getPendingQueue, setPendingQueue, showLoading } from './utils.js';
import { toastError, toastWarn, toast } from './ui.js';
import { showAuth } from './auth.js';
import { cargarPresupuesto } from './presupuesto.js';
import { cargarHogar, tieneHogar, aplicarLibro } from './hogar.js';

function isAuthError(e) {
  if (!e) return false;
  const msg = String(e.message || '').toLowerCase();
  const code = String(e.code || '');
  return code === 'PGRST301' || msg.includes('jwt expired') || msg.includes('invalid jwt')
    || msg.includes('not authenticated') || msg.includes('refresh_token_not_found');
}

function handleSessionExpired() {
  S.currentUserId = null;
  toastError('Tu sesión expiró. Volvé a iniciar sesión.');
  showAuth();
}

async function fetchGastos() {
  const { data, error } = await sb.from('gastos').select('*').order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

function transformGastos(raw) {
  return raw.map(g => ({
    Fecha: g.fecha, Centro: g.centro, Tipo: g.tipo, Concepto: g.concepto,
    Metodo: g.metodo, Importe: Number(g.importe), Moneda: g.moneda || 'ARS',
    ID: g.id, User: g.user_id, Libro: g.libro_id || null, Estado: g.estado || 'aprobado',
    PaseLibro: g.pase_libro_id || null, PaseOrigen: g.pase_origen_id || null, _raw: g
  }));
}

async function fetchIngresos() {
  if (!tieneHogar()) return [];
  const { data, error } = await sb.from('ingresos').select('*').order('fecha', { ascending: false });
  if (error) throw error;
  return (data || []).map(i => ({
    Fecha: i.fecha, Centro: i.centro, Concepto: i.concepto, Metodo: i.metodo || '',
    Importe: Number(i.importe), Moneda: i.moneda || 'ARS', ID: i.id, User: i.user_id,
    Libro: i.libro_id, Estado: i.estado || 'aprobado', PaseOrigen: i.pase_origen_id || null, _raw: i
  }));
}

function saveIngresosCache() {
  try { localStorage.setItem(STORAGE_KEYS.ingresosCache, JSON.stringify(S.ingresosTodos)); } catch {}
}
function loadIngresosCache() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ingresosCache) || '[]'); } catch { return []; }
}

export async function loadCentrosFromDB() {
  try { const { data } = await sb.from('centros').select('nombre').order('nombre'); S.dbCentros = data?.map(c => c.nombre) || []; } catch {}
}
export async function loadMetodosFromDB() {
  try { const { data } = await sb.from('metodos_pago').select('nombre').order('nombre'); S.dbMetodos = data?.map(m => m.nombre) || []; } catch {}
}

function updateConnectionUI(count, isCache) {
  const el = $('connection-status'); if (!el) return;
  el.textContent = isCache ? `${count} reg. (caché)` : `${count} reg.`;
  el.className = isCache
    ? 'text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full'
    : 'text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full';
}

export async function cargarDatos() {
  if (!S.currentUserId) return;
  showLoading(true);
  try {
    await cargarHogar();
    const [raw, ingresos] = await Promise.all([fetchGastos(), fetchIngresos()]);
    S.gastosTodos = transformGastos(raw);
    S.ingresosTodos = ingresos;
    aplicarLibro();
    await loadCentrosFromDB();
    await loadMetodosFromDB();
    await cargarPresupuesto();
    saveCache(S.gastosTodos);
    saveIngresosCache();
    updateConnectionUI(S.gastosTodos.length, false);
    updateNetworkStatus('Datos actualizados', 'ok');
    registry.refreshUI?.();
    if (getPendingQueue().length) await syncPendingQueue(false);
  } catch (e) {
    console.error('[cargarDatos]', e.message || e, e);
    if (isAuthError(e)) { handleSessionExpired(); return; }
    const cache = loadCache();
    if (Array.isArray(cache) && cache.length) {
      S.gastosTodos = cache;
      S.ingresosTodos = loadIngresosCache();
      aplicarLibro();
      updateConnectionUI(S.gastosTodos.length, true);
      updateNetworkStatus('Mostrando caché local', 'warn');
      registry.refreshUI?.();
      toastWarn('Sin conexión al servidor. Se muestra la última copia local.');
    } else {
      const el = $('connection-status');
      if (el) { el.textContent = 'Sin conexión'; el.className = 'text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full'; }
      updateNetworkStatus('No se pudo conectar', 'error');
    }
  } finally { showLoading(false); }
}

export async function syncPendingQueue(showFeedback = false) {
  if (S.userRole === 'viewer') return; // viewers no escriben → no sincronizan
  const queue = getPendingQueue();
  if (!queue.length || !navigator.onLine || S.syncInProgress || !S.currentUserId) return;
  S.syncInProgress = true;
  if (showFeedback) updateNetworkStatus('Sincronizando pendientes…', 'warn');
  const remaining = [];
  for (const item of queue) {
    try {
      if (item.action === 'add') {
        const r = item.payload.data;
        const { error } = await sb.from('gastos').insert({ user_id: S.currentUserId, libro_id: r.Libro || null, fecha: r.Fecha, centro: r.Centro, tipo: r.Tipo, concepto: r.Concepto, metodo: r.Metodo, importe: r.Importe, moneda: r.Moneda || 'ARS' });
        if (error) throw error;
      } else if (item.action === 'update') {
        const r = item.payload.record;
        const { error } = await sb.from('gastos').update({ fecha: r.Fecha, centro: r.Centro, tipo: r.Tipo, concepto: r.Concepto, metodo: r.Metodo, importe: r.Importe, moneda: r.Moneda || 'ARS' }).eq('id', item.payload.id);
        if (error) throw error;
      } else if (item.action === 'delete') {
        const { error } = await sb.from('gastos').delete().eq('id', item.payload.id);
        if (error) throw error;
      }
    } catch { remaining.push(item); }
  }
  setPendingQueue(remaining);
  S.syncInProgress = false;
  if (!remaining.length) { if (showFeedback) toast('Pendientes sincronizados'); await cargarDatos(); }
  else if (showFeedback) toastWarn(`Quedaron ${remaining.length} pendientes`);
}
