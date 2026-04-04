/* ========================================
   UI — Toast, Modal, Dark Mode, Tabs, Pull-to-Refresh
   ui.js
======================================== */

function toast(msg, duration = 1800) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, duration - 300);
  setTimeout(() => t.remove(), duration);
}

function toastError(msg) {
  const t = document.createElement('div');
  t.className = 'toast toast-error'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2700);
  setTimeout(() => t.remove(), 3000);
}

function toastWarn(msg) {
  const t = document.createElement('div');
  t.className = 'toast toast-warn'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2200);
  setTimeout(() => t.remove(), 2500);
}

function modalConfirm(msg) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box"><p class="modal-msg">${escapeHtml(msg)}</p><div class="modal-btns"><button class="modal-btn-cancel" id="modal-no">Cancelar</button><button class="modal-btn-ok" id="modal-si">Confirmar</button></div></div>`;
    document.body.appendChild(overlay);
    const close = (val) => { overlay.style.opacity = '0'; overlay.style.transition = 'opacity .2s'; setTimeout(() => overlay.remove(), 200); resolve(val); };
    overlay.querySelector('#modal-no').onclick = () => close(false);
    overlay.querySelector('#modal-si').onclick = () => close(true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

/* ── Dark Mode ── */
function initDarkMode() {
  const saved = localStorage.getItem(STORAGE_KEYS.dark);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyDarkMode(saved !== null ? saved === '1' : prefersDark);
}

function applyDarkMode(dark) {
  document.documentElement.classList.toggle('dark', dark);
  const dot = $('dark-toggle-dot'), toggle = $('dark-toggle');
  if (dot) dot.style.transform = dark ? 'translateX(1.5rem)' : 'translateX(0)';
  if (toggle) toggle.style.background = dark ? '#3b82f6' : 'var(--input-border)';
  const icon = $('dark-icon');
  if (icon) icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0f172a' : '#ffffff';
  if (window.Chart) {
    const c = dark ? '#94a3b8' : '#64748b';
    Chart.defaults.color = c;
    Chart.defaults.borderColor = dark ? 'rgba(148,163,184,.1)' : 'rgba(0,0,0,.1)';
    Chart.defaults.plugins.legend.labels.color = c;
  }
}

function toggleDarkMode() {
  const isDark = !document.documentElement.classList.contains('dark');
  localStorage.setItem(STORAGE_KEYS.dark, isDark ? '1' : '0');
  applyDarkMode(isDark);
  if (!$('section-dashboard')?.classList.contains('hidden')) renderDashboard();
  if (!$('section-comparar')?.classList.contains('hidden')) renderComparar();
}

/* ── Tabs ── */
function showTab(tab) {
  /* Dirty form check: warn when leaving Carga with unsaved data */
  if (currentTab === 'carga' && tab !== 'carga' && _formDirty) {
    const hasContent = ($('concepto')?.value || '').trim() || ($('importe')?.value || '').trim();
    if (hasContent && !confirm('Tenés cambios sin guardar en el formulario. ¿Salir igual?')) return;
  }
  _formDirty = false;

  currentTab = tab;
  localStorage.setItem('gastos_tab', tab);
  ['carga','historial','dashboard','comparar','config'].forEach(t => {
    $('section-'+t)?.classList.add('hidden');
    const b = $('tab-'+t); if (b) { b.classList.remove('tab-active'); b.classList.add('text-slate-600'); }
    const bn = $('bnav-'+t); if (bn) bn.classList.remove('bnav-active');
  });
  $('section-'+tab)?.classList.remove('hidden');
  const b = $('tab-'+tab); if (b) { b.classList.add('tab-active'); b.classList.remove('text-slate-600'); }
  const bn = $('bnav-'+tab); if (bn) bn.classList.add('bnav-active');
  if (tab==='historial') { _historialPage = 0; restoreHistoryFilters(); renderHistorial(); }
  if (tab==='dashboard') renderDashboard();
  if (tab==='comparar') initComparar();
  if (tab==='config') renderABM();
}

/* ── SW Update Banner ── */
function showUpdateBanner() {
  const banner = $('sw-update-banner');
  if (!banner) return;
  banner.classList.remove('hidden');
  requestAnimationFrame(() => { banner.style.transform = 'translateY(0)'; });
}
function dismissUpdateBanner() {
  const banner = $('sw-update-banner');
  if (!banner) return;
  banner.style.transform = 'translateY(-100%)';
  setTimeout(() => banner.classList.add('hidden'), 300);
}

/* ── Pull to Refresh ── */
const _ptr = { startY: 0, pulling: false, threshold: 80 };

document.addEventListener('touchstart', (e) => {
  if (window.scrollY === 0 && $('auth-overlay')?.classList.contains('hidden')) {
    _ptr.startY = e.touches[0].clientY;
    _ptr.pulling = true;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!_ptr.pulling || window.scrollY > 0) { _ptr.pulling = false; return; }
  const dy = e.touches[0].clientY - _ptr.startY;
  if (dy > 0 && dy < 150) {
    const pct = Math.min(dy / _ptr.threshold, 1);
    $('pull-indicator').style.transform = `translateY(${-100 + pct * 100}%)`;
    $('pull-text').textContent = dy >= _ptr.threshold ? 'Soltar para actualizar' : 'Deslizá para actualizar';
    $('pull-arrow').style.transform = dy >= _ptr.threshold ? 'rotate(180deg)' : '';
    $('pull-arrow').style.display = '';
    $('pull-spin').style.display = 'none';
  }
}, { passive: true });

document.addEventListener('touchend', async () => {
  if (!_ptr.pulling) return;
  const indicator = $('pull-indicator');
  const dy = parseFloat(indicator.style.transform.replace(/[^0-9.-]/g, ''));
  if (dy >= -10) {
    $('pull-arrow').style.display = 'none';
    $('pull-spin').style.display = '';
    $('pull-text').textContent = 'Actualizando...';
    indicator.style.transform = 'translateY(0)';
    await cargarDatos();
    toast('Datos actualizados');
  }
  setTimeout(() => { indicator.style.transform = 'translateY(-100%)'; }, 300);
  _ptr.pulling = false;
});
