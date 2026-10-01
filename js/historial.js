/* ========================================
   HISTORIAL — Tabla, filtros, swipe cards, export
   historial.js
======================================== */
import { $, S, sb, HISTORIAL_PAGE_SIZE, registry } from './state.js';
import { escapeHtml, escapeAttr, formatearNumero, formatImporte, formatImporteSigned, formatFechaCorta, getDateGroupLabel, csvEscape, descargarCSV, safeNumber, debounce, persistHistoryFilters, showLoading } from './utils.js';
import { toast, toastError, modalConfirm } from './ui.js';
import { setMoneda, setModoCarga, marcarEdicion, editarIngreso } from './carga.js';
import { pillsMovimiento, puedoEditar, esTitular, tieneHogar } from './hogar.js';

/* Botón de pase: solo sobre gastos aprobados de un libro propio que todavía no se pasaron. */
const puedePasar = g => tieneHogar() && !g._ingreso && esTitular(g.Libro) && !g.PaseLibro && !g.PaseOrigen && !g._pending;

function getFiltrados() {
  const txt=($('buscar-historial')?.value||'').toLowerCase(), mes=$('filtro-mes-historial')?.value||'todos',
    centro=$('filtro-centro')?.value||'todos', tipo=$('filtro-tipo')?.value||'todos', metodo=$('filtro-metodo')?.value||'todos',
    moneda=$('filtro-moneda')?.value||'todos';
  /* Los ingresos del libro activo se mezclan con los gastos; Tipo 'I' los distingue en el filtro. */
  const movs = S.ingresos.length ? [...S.allData, ...S.ingresos.map(i => ({ ...i, Tipo: 'I', _ingreso: true }))] : S.allData;
  return movs.filter(g=>{
    if(txt&&!(g.Concepto||'').toLowerCase().includes(txt)&&!(g.Centro||'').toLowerCase().includes(txt)) return false;
    if(mes!=='todos'&&(!g.Fecha||!g.Fecha.startsWith(mes))) return false;
    if(centro!=='todos'&&g.Centro!==centro) return false;
    if(tipo!=='todos'&&g.Tipo!==tipo) return false;
    if(metodo!=='todos'&&g.Metodo!==metodo) return false;
    if(moneda!=='todos'&&(g.Moneda||'ARS')!==moneda) return false;
    return true;
  }).sort((a,b)=>(b.Fecha||'').localeCompare(a.Fecha||''));
}

export function renderHistorial() {
  const f = getFiltrados();
  const visibleCount = (S.historialPage + 1) * HISTORIAL_PAGE_SIZE;
  const top = f.slice(0, visibleCount);
  const hasMore = f.length > visibleCount;
  const remaining = f.length - top.length;

  $('resultados-count').textContent = `${f.length} registros${hasMore ? ` (${top.length} mostrados)` : ''}`;
  const tbody = $('tabla-historial'), mob = $('historial-cards-mobile');
  if (!f.length) { tbody.innerHTML='<tr><td colspan="7" class="py-8 text-center text-slate-400">Sin resultados</td></tr>'; if(mob)mob.innerHTML=''; return; }

  tbody.innerHTML = top.map(g=>{
    const isNeg = g.Importe < 0, impColor = isNeg ? 'text-red-500' : (g._ingreso ? 'text-emerald-600' : '');
    const moneda = g.Moneda || 'ARS';
    const monedaTag = moneda === 'USD' ? ' <span class="ml-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold">U$S</span>' : '';
    return `<tr class="hover:bg-slate-50"><td class="py-3 px-4">${escapeHtml(g.Fecha)||'-'}</td><td class="py-3 px-4 font-medium">${escapeHtml(g.Centro)}</td><td class="py-3 px-4">${escapeHtml(g.Concepto)}${monedaTag}${pillsMovimiento(g)}${g._pending?' <span class="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Pendiente</span>':''}</td><td class="py-3 px-4">${g._ingreso?'<span class="pill-ingreso">Ingreso</span>':`<span class="px-2 py-1 rounded text-xs ${g.Tipo==='F'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">${escapeHtml(g.Tipo)}</span>`}</td><td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(g.Metodo)}</td><td class="py-3 px-4 text-right font-mono ${impColor}">${g._ingreso&&!isNeg?'+':''}${formatImporteSigned(g.Importe, moneda)}</td><td class="py-3 px-4 text-center owner-only whitespace-nowrap">${puedePasar(g)?`<button data-action="abrirPase" data-id="${escapeAttr(g.ID)}" class="text-violet-600 mr-2" title="Registrar pase a otro libro"><i class="fas fa-right-left"></i></button>`:''}${puedoEditar(g)?`<button data-action="${g._ingreso?'editarIngreso':'editarGasto'}" data-id="${escapeAttr(g.ID)}" class="text-blue-600 mr-2"><i class="fas fa-edit"></i></button><button data-action="${g._ingreso?'borrarIngreso':'borrarGasto'}" data-id="${escapeAttr(g.ID)}" data-concepto="${escapeAttr(g.Concepto)}" class="text-red-600"><i class="fas fa-trash"></i></button>`:''}</td></tr>`;
  }).join('');
  if (hasMore) tbody.innerHTML += `<tr><td colspan="7" class="py-4 text-center"><button data-action="cargarMasHistorial" class="px-6 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200 transition-colors"><i class="fas fa-chevron-down mr-1"></i>Cargar más (${remaining} restantes)</button></td></tr>`;

  if (mob) {
    let lastGroup = '', html = '';
    for (const g of top) {
      const group = getDateGroupLabel(g.Fecha);
      if (group !== lastGroup) { html += `<div class="flex items-center gap-2 mt-3 mb-1 first:mt-0"><span class="text-xs font-bold text-slate-500 uppercase tracking-wide">${group}</span><span class="flex-1 border-t border-slate-200"></span></div>`; lastGroup = group; }
      const isNeg = g.Importe < 0;
      const moneda = g.Moneda || 'ARS';
      const amountColor = isNeg ? 'text-red-500' : g._ingreso ? 'text-emerald-600' : (g.Tipo==='F'?'text-emerald-700':'text-amber-700');
      const amountDisplay = (g._ingreso && !isNeg ? '+' : '') + formatImporteSigned(g.Importe, moneda);
      const monedaTag = moneda === 'USD' ? '<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold">U$S</span>' : '';
      html += `<div class="hist-swipe-wrapper"><div class="hist-swipe-bg"><div class="hist-swipe-bg-edit"><i class="fas fa-edit"></i> Editar</div><div class="hist-swipe-bg-delete">Borrar <i class="fas fa-trash"></i></div></div><div class="hist-card" data-id="${escapeAttr(g.ID)}" data-concepto="${escapeAttr(g.Concepto)}" data-editable="${puedoEditar(g)?'1':''}" data-tabla="${g._ingreso?'ingresos':'gastos'}"><div class="hist-card-top"><div><div class="hist-card-title">${escapeHtml(g.Concepto)}${monedaTag}${g._pending?'<span class="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>':''}</div><div class="hist-card-sub">${formatFechaCorta(g.Fecha)} · ${escapeHtml(g.Centro)}</div></div><div class="hist-card-amount ${amountColor}">${amountDisplay}</div></div><div class="hist-card-meta">${g._ingreso?'<span class="pill-ingreso">Ingreso</span>':`<span class="hist-pill">${g.Tipo==='F'?'Fijo':'Variable'}</span>`}<span class="hist-pill">${escapeHtml(g.Metodo)}</span>${pillsMovimiento(g)}${puedePasar(g)?`<button data-action="abrirPase" data-id="${escapeAttr(g.ID)}" class="hist-pill hist-pill-btn ml-auto" title="Registrar pase"><i class="fas fa-right-left mr-1"></i>Pase</button>`:''}</div></div></div>`;
    }
    if (hasMore) html += `<div class="text-center py-4"><button data-action="cargarMasHistorial" class="px-6 py-2.5 bg-blue-100 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-200 transition-colors"><i class="fas fa-chevron-down mr-1"></i>Cargar más (${remaining})</button></div>`;
    mob.innerHTML = html;
    initSwipeCards();
  }
}

export function cargarMasHistorial() { S.historialPage++; renderHistorial(); }
export function filtrarHistorial() { S.historialPage = 0; persistHistoryFilters(); renderHistorial(); }
export const filtrarHistorialDebounced = debounce(filtrarHistorial, 200);

export function limpiarFiltros() {
  $('buscar-historial').value=''; $('filtro-centro').value='todos'; $('filtro-tipo').value='todos';
  $('filtro-metodo').value='todos'; $('filtro-mes-historial').value='todos';
  if ($('filtro-moneda')) $('filtro-moneda').value='todos';
  S.historialPage = 0; persistHistoryFilters(); renderHistorial();
}

export function exportarHistorialFiltrado() {
  const f=getFiltrados(); let csv='Fecha,Centro,Tipo,Concepto,Metodo,Moneda,Importe\n'; /* Tipo I = ingreso */
  for(const g of f) csv+=[csvEscape(g.Fecha),csvEscape(g.Centro),csvEscape(g.Tipo),csvEscape(g.Concepto),csvEscape(g.Metodo),csvEscape(g.Moneda||'ARS'),csvEscape(g.Importe||0)].join(',')+"\n";
  descargarCSV('historial.csv',csv);
}

export function editarGasto(id) {
  const g=S.gastosTodos.find(x=>x.ID===id) || S.allData.find(x=>x.ID===id); if(!g) return;
  if (!puedoEditar(g)) return;
  S.editingId = null;
  setModoCarga('gasto');
  S.editingId = id; S.editingTabla = 'gastos';
  $('fecha').value=g.Fecha||''; $('centro').value=g.Centro||''; $('concepto').value=g.Concepto||'';
  $('tipo').value=g.Tipo||'V'; $('metodo').value=g.Metodo||'Efectivo'; $('importe').value=g.Importe||'';
  setMoneda(g.Moneda || 'ARS');
  marcarEdicion();
  registry.showTab?.('carga');
}

export function exportarCSV() {
  let csv='Fecha,Centro,Tipo,Concepto,Metodo,Moneda,Importe,ID\n';
  for(const g of S.allData) csv+=[csvEscape(g.Fecha),csvEscape(g.Centro),csvEscape(g.Tipo),csvEscape(g.Concepto),csvEscape(g.Metodo),csvEscape(g.Moneda||'ARS'),csvEscape(g.Importe||0),csvEscape(g.ID)].join(',')+"\n";
  descargarCSV('gastos.csv',csv);
}

/* ── Swipe Cards ── */
const _swipe = { card: null, startX: 0, currentX: 0, threshold: 80, maxSwipe: 120 };
function initSwipeCards() {
  if (S.userRole === 'viewer') return; // viewers no editan ni borran
  const mob = $('historial-cards-mobile'); if (!mob || mob._swipeInit) return;
  mob._swipeInit = true;
  mob.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.hist-card[data-editable="1"]'); if (!card) return;
    _swipe.card = card; _swipe.startX = e.touches[0].clientX; _swipe.currentX = 0; card.classList.add('swiping');
  }, { passive: true });
  mob.addEventListener('touchmove', (e) => {
    if (!_swipe.card) return;
    _swipe.currentX = e.touches[0].clientX - _swipe.startX;
    const clamped = _swipe.currentX > 0 ? Math.min(_swipe.currentX * 0.7, _swipe.maxSwipe) : Math.max(_swipe.currentX * 0.7, -_swipe.maxSwipe);
    _swipe.card.style.transform = `translateX(${clamped}px)`;
  }, { passive: true });
  mob.addEventListener('touchend', async () => {
    const card = _swipe.card; if (!card) return;
    card.classList.remove('swiping'); _swipe.card = null;
    const moved = _swipe.currentX * 0.7;
    if (moved > _swipe.threshold) {
      card.style.transform = `translateX(${_swipe.maxSwipe}px)`;
      setTimeout(() => { card.style.transform = ''; (card.dataset.tabla === 'ingresos' ? editarIngreso : editarGasto)(card.dataset.id); }, 200);
    } else if (moved < -_swipe.threshold) {
      card.style.transform = `translateX(-${_swipe.maxSwipe}px)`;
      const ok = await modalConfirm(`¿Borrar "${card.dataset.concepto}"?`);
      if (ok) { card.style.transform = 'translateX(-100%)'; card.style.opacity = '0'; await borrarGastoDirect(card.dataset.id, card.dataset.tabla); }
      else card.style.transform = '';
    } else card.style.transform = '';
  });
}

async function borrarGastoDirect(id, tabla = 'gastos') {
  showLoading(true);
  try { const { error } = await sb.from(tabla === 'ingresos' ? 'ingresos' : 'gastos').delete().eq('id', id); if (error) throw error; await registry.cargarDatos?.(); toast('Borrado'); }
  catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}
