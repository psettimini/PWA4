/* ========================================
   DATA — Carga, cache, sincronización
   data.js — Refactorizado en funciones más pequeñas
======================================== */

/* ── Helpers de sesión ── */
function isAuthError(e) {
  if (!e) return false;
  const msg = String(e.message || '').toLowerCase();
  const code = String(e.code || '');
  return code === 'PGRST301' || msg.includes('jwt expired') || msg.includes('invalid jwt')
    || msg.includes('not authenticated') || msg.includes('refresh_token_not_found');
}

function handleSessionExpired() {
  currentUserId = null;
  toastError('Tu sesión expiró. Volvé a iniciar sesión.');
  showAuth();
}

/* ── Sub-funciones de carga ── */
async function fetchGastos() {
  const { data, error } = await sb.from('gastos').select('*').order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

function transformGastos(raw) {
  return raw.map(g => ({
    Fecha: g.fecha, Centro: g.centro, Tipo: g.tipo, Concepto: g.concepto,
    Metodo: g.metodo, Importe: Number(g.importe), ID: g.id, _raw: g
  }));
}

async function loadCentrosFromDB() {
  try { const { data } = await sb.from('centros').select('nombre').order('nombre'); dbCentros = data?.map(c => c.nombre) || []; } catch {}
}
async function loadMetodosFromDB() {
  try { const { data } = await sb.from('metodos_pago').select('nombre').order('nombre'); dbMetodos = data?.map(m => m.nombre) || []; } catch {}
}

function updateConnectionUI(count, isCache) {
  const el = $('connection-status');
  if (!el) return;
  if (isCache) {
    el.textContent = `${count} reg. (caché)`;
    el.className = 'text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full';
  } else {
    el.textContent = `${count} reg.`;
    el.className = 'text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full';
  }
}

function refreshUI() {
  procesarPatrones();
  restoreHistoryFilters();
  actualizarSugerencias();
  actualizarResumen();
  updateMetodoSelect();
}

/* ── Función principal ── */
async function cargarDatos() {
  if (!currentUserId) return;
  showLoading(true);
  try {
    const raw = await fetchGastos();
    allData = transformGastos(raw);
    await loadCentrosFromDB();
    await loadMetodosFromDB();

    saveCache(allData);
    updateConnectionUI(allData.length, false);
    updateNetworkStatus('Datos actualizados', 'ok');
    refreshUI();
    if (getPendingQueue().length) await syncPendingQueue(false);
  } catch (e) {
    console.error('[cargarDatos] Error:', e.message || e, e);

    /* Detectar sesión expirada */
    if (isAuthError(e)) {
      handleSessionExpired();
      return;
    }

    const cache = loadCache();
    if (Array.isArray(cache) && cache.length) {
      allData = cache;
      updateConnectionUI(allData.length, true);
      updateNetworkStatus('Mostrando caché local', 'warn');
      refreshUI();
      toastWarn('Sin conexión al servidor. Se muestra la última copia local.');
    } else {
      const el = $('connection-status');
      if (el) { el.textContent = 'Sin conexión'; el.className = 'text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full'; }
      updateNetworkStatus('No se pudo conectar', 'error');
    }
  } finally { showLoading(false); }
}

async function syncPendingQueue(showFeedback = false) {
  const queue = getPendingQueue();
  if (!queue.length || !navigator.onLine || syncInProgress || !currentUserId) return;
  syncInProgress = true;
  if (showFeedback) updateNetworkStatus('Sincronizando pendientes…', 'warn');
  const remaining = [];
  for (const item of queue) {
    try {
      if (item.action === 'add') {
        const r = item.payload.data;
        const { error } = await sb.from('gastos').insert({ user_id: currentUserId, fecha: r.Fecha, centro: r.Centro, tipo: r.Tipo, concepto: r.Concepto, metodo: r.Metodo, importe: r.Importe });
        if (error) throw error;
      } else if (item.action === 'update') {
        const r = item.payload.record;
        const { error } = await sb.from('gastos').update({ fecha: r.Fecha, centro: r.Centro, tipo: r.Tipo, concepto: r.Concepto, metodo: r.Metodo, importe: r.Importe }).eq('id', item.payload.id);
        if (error) throw error;
      } else if (item.action === 'delete') {
        const { error } = await sb.from('gastos').delete().eq('id', item.payload.id);
        if (error) throw error;
      }
    } catch { remaining.push(item); }
  }
  setPendingQueue(remaining);
  syncInProgress = false;
  if (!remaining.length) { if (showFeedback) toast('Pendientes sincronizados'); await cargarDatos(); }
  else if (showFeedback) toastWarn(`Quedaron ${remaining.length} pendientes`);
}
