/* ========================================
   APP — Inicialización y event listeners globales
   app.js — Se carga último
======================================== */

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  updateCacheLabel();
  updatePendingBadge();
  updateNetworkStatus(navigator.onLine ? 'En línea' : 'Sin conexión', navigator.onLine ? 'ok' : 'warn');
  setFechaHoy();

  const appVersionEl = $('app-version');
  if (appVersionEl) appVersionEl.textContent = `Versión ${APP_VERSION}`;

  showTab(currentTab);

  /* Service Worker con notificación de actualización */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') showUpdateBanner();
    });
  }

  window.addEventListener('online', () => { updateNetworkStatus('En línea', 'ok'); syncPendingQueue(true); });
  window.addEventListener('offline', () => { updateNetworkStatus('Sin conexión', 'warn'); });

  /* Auth listener con detección de sesión expirada */
  sb.auth.onAuthStateChange((event, session) => {
    console.log('[Auth]', event, session ? session.user.email : 'no session');
    if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
      if (currentUserId) {
        currentUserId = null;
        allData = []; dbCentros = []; dbMetodos = [];
        toastWarn('Sesión finalizada');
        showAuth();
      }
      return;
    }
    if (session) {
      currentUserId = session.user.id;
      hideAuth();
      if ($('config-user-email')) $('config-user-email').textContent = session.user.email || '';
      if (allData.length === 0) setTimeout(() => cargarDatos(), 100);
    } else {
      currentUserId = null;
      showAuth();
    }
  });

  /* Form dirty tracking — event delegation en inputs del formulario */
  ['fecha','centro','concepto','importe'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', markFormDirty);
  });
  ['tipo','metodo'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', markFormDirty);
  });
});

/* Cerrar sugerencias al hacer click fuera */
document.addEventListener('click', e => {
  if (!e.target.closest('#concepto') && !e.target.closest('#suggestions'))
    $('suggestions')?.classList.add('hidden');
});

/* Re-render al cambiar tamaño de ventana — solo si el ancho cambió */
window.addEventListener('resize', function() {
  clearTimeout(window.__rt);
  window.__rt = setTimeout(() => {
    const newWidth = window.innerWidth;
    if (newWidth === _lastWindowWidth) return;
    _lastWindowWidth = newWidth;
    try {
      if (!$('section-historial')?.classList.contains('hidden')) renderHistorial();
      if (!$('section-dashboard')?.classList.contains('hidden')) renderDashboard();
      if (!$('section-comparar')?.classList.contains('hidden')) renderComparar();
    } catch(e) {}
  }, 400);
});
