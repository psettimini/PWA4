/* ========================================
   DATA — Carga, cache, sincronización
   data.js
======================================== */

async function cargarDatos() {
  if (!currentUserId) return;
  showLoading(true);
  try {
    const { data, error } = await sb.from('gastos').select('*').order('fecha', { ascending: false });
    if (error) throw error;

    allData = (data || []).map(g => ({
      Fecha: g.fecha, Centro: g.centro, Tipo: g.tipo, Concepto: g.concepto,
      Metodo: g.metodo, Importe: Number(g.importe), ID: g.id, _raw: g
    }));

    await loadCentrosFromDB();
    await loadMetodosFromDB();

    saveCache(allData);
    $('connection-status').textContent = `${allData.length} reg.`;
    $('connection-status').className = 'text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full';
    updateNetworkStatus('Datos actualizados', 'ok');
    procesarPatrones();
    restoreHistoryFilters();
    actualizarSugerencias();
    actualizarResumen();
    updateMetodoSelect();
    if (getPendingQueue().length) await syncPendingQueue(false);
  } catch (e) {
    console.error('[cargarDatos] Error:', e.message || e, e);
    const cache = loadCache();
    if (Array.isArray(cache) && cache.length) {
      allData = cache;
      $('connection-status').textContent = `${allData.length} reg. (caché)`;
      $('connection-status').className = 'text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full';
      updateNetworkStatus('Mostrando caché local', 'warn');
      procesarPatrones(); restoreHistoryFilters(); actualizarSugerencias(); actualizarResumen(); updateMetodoSelect();
      toastWarn('Sin conexión al servidor. Se muestra la última copia local.');
    } else {
      $('connection-status').textContent = 'Sin conexión';
      $('connection-status').className = 'text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full';
      updateNetworkStatus('No se pudo conectar', 'error');
    }
  } finally { showLoading(false); }
}

async function loadCentrosFromDB() {
  try { const { data } = await sb.from('centros').select('nombre').order('nombre'); dbCentros = data?.map(c => c.nombre) || []; } catch {}
}
async function loadMetodosFromDB() {
  try { const { data } = await sb.from('metodos_pago').select('nombre').order('nombre'); dbMetodos = data?.map(m => m.nombre) || []; } catch {}
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
