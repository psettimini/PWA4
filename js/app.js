/* ========================================
   APP — Entry point, imports, registry, event delegation
   app.js — Se carga como <script type="module">
======================================== */
import { $, S, sb, APP_VERSION, registry } from './state.js';
import { setFechaHoy, updateCacheLabel, updatePendingBadge, updateNetworkStatus, restoreHistoryFilters, debounce } from './utils.js';
import { initDarkMode, showTab, showUpdateBanner, dismissUpdateBanner, toast, toastWarn, toggleDarkMode } from './ui.js';
import { showAuth, hideAuth, showAuthMode, doLogin, doRegister, doResetPassword, doLogout, loadUserProfile, applyRoleUI } from './auth.js';
import { cargarDatos, syncPendingQueue } from './data.js';
import { guardarGasto, cancelarEdicion, borrarGasto, procesarPatrones, actualizarSugerencias, actualizarResumen, seleccionarPatron, seleccionarFijo, guardarFijoRapido, filtrarSugerencias, mostrarSugerenciasDebounced, navegarSugerencias, setMoneda, dismissFijoPendiente, evaluarImporteOnBlur } from './carga.js';
import { renderHistorial, filtrarHistorial, filtrarHistorialDebounced, limpiarFiltros, exportarHistorialFiltrado, exportarCSV, editarGasto, cargarMasHistorial } from './historial.js';
import { renderDashboard, renderEvolucionCentro, renderEvolucionConcepto } from './dashboard.js';
import { initComparar, renderComparar } from './comparar.js';
import { renderPresupuesto, presupDetectar, presupToggleDetectado, presupTodosDetectados, presupEditarDetectado,
         presupCancelarDeteccion, presupConfirmarDeteccion, presupEditarImporte, presupEditarFrecuencia,
         presupEditarAncla, presupToggleActivo, presupBorrar, presupNuevoToggle, presupGuardarNuevo } from './presupuesto.js';
import { renderABM, updateMetodoSelect, abmAdd, abmRename, abmMerge, abmRemoveCustom } from './abm.js';
import { abrirImportador, cerrarImportador, aprobarImportacion, descartarTodo, setFiltro, descartarFila, restaurarFila, volverAArchivo, cancelarLectura, importarTexto, initImportador } from './importar/index.js';

/* ── Populate Registry (breaks circular dependencies) ── */
registry.cargarDatos = cargarDatos;
registry.showTab = showTab;
registry.renderHistorial = renderHistorial;
registry.refreshUI = () => {
  procesarPatrones();
  restoreHistoryFilters();
  actualizarSugerencias();
  actualizarResumen();
  updateMetodoSelect();
};
registry.onTabChange = (tab) => {
  if (tab === 'historial') { S.historialPage = 0; restoreHistoryFilters(); renderHistorial(); }
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'comparar') initComparar();
  if (tab === 'presupuesto') renderPresupuesto();
  if (tab === 'config') renderABM();
};

/* ══════════════════════════════════════════
   EVENT DELEGATION — Reemplaza todos los onclick inline
   ══════════════════════════════════════════ */

const clickActions = {
  /* Auth */
  doLogin, doRegister, doResetPassword, doLogout,
  showAuthMode: (d) => showAuthMode(d.mode),
  /* Nav */
  showTab: (d) => showTab(d.tab),
  toggleDarkMode: () => toggleDarkMode(),
  /* Carga */
  guardarGasto: () => guardarGasto(),
  cancelarEdicion: () => cancelarEdicion(),
  setMoneda: (d) => setMoneda(d.moneda),
  seleccionarPatron: (d) => seleccionarPatron(d.concepto, d.centro, d.moneda),
  seleccionarFijo: (d) => seleccionarFijo(d.concepto, d.centro, d.tipo, d.metodo, Number(d.importe), d.moneda),
  guardarFijoRapido: (d, e, el) => { e.stopPropagation(); guardarFijoRapido(d.concepto, d.centro, d.tipo, d.metodo, Number(d.importe), d.moneda, el); },
  dismissFijoPendiente: (d, e) => { e.stopPropagation(); dismissFijoPendiente(d.concepto, d.centro, d.moneda); },
  /* Historial */
  editarGasto: (d) => editarGasto(d.id),
  borrarGasto: (d) => borrarGasto(d.id, d.concepto),
  cargarMasHistorial: () => cargarMasHistorial(),
  limpiarFiltros: () => limpiarFiltros(),
  exportarHistorialFiltrado: () => exportarHistorialFiltrado(),
  exportarCSV: () => exportarCSV(),
  /* Dashboard */
  renderEvolucionCentro: () => renderEvolucionCentro(),
  renderEvolucionConcepto: () => renderEvolucionConcepto(),
  /* Config */
  cargarDatos: () => cargarDatos(),
  syncPending: () => syncPendingQueue(true),
  abmAdd: (d) => abmAdd(d.field),
  abmRename: (d) => abmRename(d.field, d.value),
  abmMerge: (d) => abmMerge(d.field, d.value),
  abmRemoveCustom: (d) => abmRemoveCustom(d.field, d.value),
  /* Importar */
  abrirImportador: () => abrirImportador(),
  cerrarImportador: () => cerrarImportador(),
  aprobarImportacion: () => aprobarImportacion(),
  descartarImportacion: () => descartarTodo(),
  importFiltro: (d) => setFiltro(d.filtro),
  importDescartar: (d) => descartarFila(d.fid),
  importRestaurar: (d) => restaurarFila(d.fid),
  volverAArchivo: () => volverAArchivo(),
  cancelarLectura: () => cancelarLectura(),
  importarTexto: () => importarTexto(),
  /* Presupuesto */
  presupDetectar: () => presupDetectar(),
  presupTodosDetectados: (d) => presupTodosDetectados(d.valor === '1'),
  presupCancelarDeteccion: () => presupCancelarDeteccion(),
  presupConfirmarDeteccion: () => presupConfirmarDeteccion(),
  presupToggleActivo: (d) => presupToggleActivo(d.id),
  presupBorrar: (d) => presupBorrar(d.id, d.concepto),
  presupNuevoToggle: () => presupNuevoToggle(),
  presupGuardarNuevo: () => presupGuardarNuevo(),
  /* PWA */
  reload: () => location.reload(),
  dismissUpdateBanner: () => dismissUpdateBanner(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = clickActions[el.dataset.action];
  if (fn) {
    if (fn.length === 0) fn();
    else fn(el.dataset, e, el);
  }
});

/* Change delegation */
const changeActions = {
  filtrarHistorial: () => filtrarHistorial(),
  renderComparar: () => renderComparar(),
  renderDashboard: () => renderDashboard(),
  renderEvolucionCentro: () => renderEvolucionCentro(),
  renderEvolucionConcepto: () => renderEvolucionConcepto(),
  /* Presupuesto — reciben (dataset, event, elemento) */
  presupToggleDetectado: (d) => presupToggleDetectado(d.idx),
  presupEditarDetectadoImporte: (d, e, el) => presupEditarDetectado(d.idx, 'importe', el.value),
  presupEditarDetectadoFrecuencia: (d, e, el) => presupEditarDetectado(d.idx, 'frecuencia', el.value),
  presupEditarDetectadoAncla: (d, e, el) => presupEditarDetectado(d.idx, 'ancla', el.value),
  presupEditarImporte: (d, e, el) => presupEditarImporte(d.id, el.value),
  presupEditarFrecuencia: (d, e, el) => presupEditarFrecuencia(d.id, el.value),
  presupEditarAncla: (d, e, el) => presupEditarAncla(d.id, el.value),
};

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = changeActions[el.dataset.change];
  if (fn) {
    if (fn.length === 0) fn();
    else fn(el.dataset, e, el);
  }
});

/* ══════════════════════════════════════════
   INITIALIZATION
   ══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  updateCacheLabel();
  updatePendingBadge();
  updateNetworkStatus(navigator.onLine ? 'En línea' : 'Sin conexión', navigator.onLine ? 'ok' : 'warn');
  setFechaHoy();
  const appVersionEl = $('app-version');
  if (appVersionEl) appVersionEl.textContent = `Versión ${APP_VERSION}`;
  showTab(S.currentTab);

  /* Service Worker */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') showUpdateBanner();
    });
  }

  window.addEventListener('online', () => { updateNetworkStatus('En línea', 'ok'); syncPendingQueue(true); });
  window.addEventListener('offline', () => { updateNetworkStatus('Sin conexión', 'warn'); });

  /* Auth listener */
  sb.auth.onAuthStateChange((event, session) => {
    console.log('[Auth]', event, session ? session.user.email : 'no session');
    if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
      if (S.currentUserId) {
        S.currentUserId = null; S.allData = []; S.dbCentros = []; S.dbMetodos = [];
        toastWarn('Sesión finalizada');
        showAuth();
      }
      return;
    }
    if (session) {
      S.currentUserId = session.user.id;
      hideAuth();
      if ($('config-user-email')) $('config-user-email').textContent = session.user.email || '';
      if (S.allData.length === 0) setTimeout(async () => {
        await loadUserProfile();
        applyRoleUI();
        cargarDatos();
      }, 100);
    } else {
      S.currentUserId = null; showAuth();
    }
  });

  /* ── Direct input/keydown listeners (not delegated) ── */
  const conceptoInput = $('concepto');
  if (conceptoInput) {
    conceptoInput.addEventListener('input', (e) => { S.formDirty = true; mostrarSugerenciasDebounced(e.target.value); });
    conceptoInput.addEventListener('keydown', navegarSugerencias);
  }
  const centroInput = $('centro');
  if (centroInput) centroInput.addEventListener('input', () => { S.formDirty = true; filtrarSugerencias(); });

  const buscarInput = $('buscar-historial');
  if (buscarInput) buscarInput.addEventListener('input', filtrarHistorialDebounced);

  /* Auth enter-to-submit */
  $('auth-password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('auth-reg-password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });
  $('auth-reset-email')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doResetPassword(); });

  /* Form dirty tracking */
  ['fecha','importe'].forEach(id => { $(id)?.addEventListener('input', () => { S.formDirty = true; }); });
  ['tipo','metodo'].forEach(id => { $(id)?.addEventListener('change', () => { S.formDirty = true; }); });

  /* Importe: evaluar expresión aritmética al perder foco (ej: 100+50 → 150) */
  $('importe')?.addEventListener('blur', evaluarImporteOnBlur);

  initImportador();

  /* Form submit prevention */
  document.querySelector('#section-carga form')?.addEventListener('submit', e => e.preventDefault());
});

/* Close suggestions on outside click */
document.addEventListener('click', e => {
  if (!e.target.closest('#concepto') && !e.target.closest('#suggestions'))
    $('suggestions')?.classList.add('hidden');
});

/* Resize — only if width changed, debounce 400ms */
window.addEventListener('resize', (() => {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const newWidth = window.innerWidth;
      if (newWidth === S.lastWindowWidth) return;
      S.lastWindowWidth = newWidth;
      try { registry.onTabChange?.(S.currentTab); } catch {}
    }, 400);
  };
})());
