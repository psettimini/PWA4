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

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  window.addEventListener('online', () => { updateNetworkStatus('En línea', 'ok'); syncPendingQueue(true); });
  window.addEventListener('offline', () => { updateNetworkStatus('Sin conexión', 'warn'); });

  /* Auth listener */
  sb.auth.onAuthStateChange((event, session) => {
    console.log('[Auth]', event, session ? session.user.email : 'no session');
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
});

/* Cerrar sugerencias al hacer click fuera */
document.addEventListener('click', e => {
  if (!e.target.closest('#concepto') && !e.target.closest('#suggestions'))
    $('suggestions')?.classList.add('hidden');
});

/* Re-render al cambiar tamaño de ventana */
window.addEventListener('resize', function() {
  clearTimeout(window.__rt);
  window.__rt = setTimeout(() => {
    try {
      if (!$('section-historial')?.classList.contains('hidden')) renderHistorial();
      if (!$('section-dashboard')?.classList.contains('hidden')) renderDashboard();
      if (!$('section-comparar')?.classList.contains('hidden')) renderComparar();
    } catch(e) {}
  }, 180);
});
