/* ========================================
   HISTORIAL — Tabla, filtros, swipe cards, export
   historial.js
======================================== */

function getFiltrados() {
  const txt=($('buscar-historial')?.value||'').toLowerCase(), mes=$('filtro-mes-historial')?.value||'todos',
    centro=$('filtro-centro')?.value||'todos', tipo=$('filtro-tipo')?.value||'todos', metodo=$('filtro-metodo')?.value||'todos';
  return allData.filter(g=>{
    if(txt&&!(g.Concepto||'').toLowerCase().includes(txt)&&!(g.Centro||'').toLowerCase().includes(txt)) return false;
    if(mes!=='todos'&&(!g.Fecha||!g.Fecha.startsWith(mes))) return false;
    if(centro!=='todos'&&g.Centro!==centro) return false;
    if(tipo!=='todos'&&g.Tipo!==tipo) return false;
    if(metodo!=='todos'&&g.Metodo!==metodo) return false;
    return true;
  }).sort((a,b)=>(b.Fecha||'').localeCompare(a.Fecha||''));
}

function renderHistorial() {
  const f = getFiltrados(), top = f.slice(0,100);
  $('resultados-count').textContent = `${f.length} registros${f.length>100?' (100 mostrados)':''}`;
  const tbody = $('tabla-historial'), mob = $('historial-cards-mobile');
  if (!f.length) { tbody.innerHTML='<tr><td colspan="7" class="py-8 text-center text-slate-400">Sin resultados</td></tr>'; if(mob)mob.innerHTML=''; return; }

  tbody.innerHTML = top.map(g=>{
    const isNeg = g.Importe < 0, impColor = isNeg ? 'text-red-500' : '';
    return `<tr class="hover:bg-slate-50"><td class="py-3 px-4">${escapeHtml(g.Fecha)||'-'}</td><td class="py-3 px-4 font-medium">${escapeHtml(g.Centro)}</td><td class="py-3 px-4">${escapeHtml(g.Concepto)}${g._pending?' <span class="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Pendiente</span>':''}</td><td class="py-3 px-4"><span class="px-2 py-1 rounded text-xs ${g.Tipo==='F'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">${escapeHtml(g.Tipo)}</span></td><td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(g.Metodo)}</td><td class="py-3 px-4 text-right font-mono ${impColor}">${isNeg?'-':''}$${formatearNumero(Math.abs(g.Importe))}</td><td class="py-3 px-4 text-center"><button onclick="editarGasto('${escapeAttr(g.ID)}')" class="text-blue-600 mr-2"><i class="fas fa-edit"></i></button><button onclick="borrarGasto('${escapeAttr(g.ID)}','${escapeAttr(g.Concepto)}')" class="text-red-600"><i class="fas fa-trash"></i></button></td></tr>`;
  }).join('');

  if (mob) {
    let lastGroup = '', html = '';
    for (const g of top) {
      const group = getDateGroupLabel(g.Fecha);
      if (group !== lastGroup) {
        html += `<div class="flex items-center gap-2 mt-3 mb-1 first:mt-0"><span class="text-xs font-bold text-slate-500 uppercase tracking-wide">${group}</span><span class="flex-1 border-t border-slate-200"></span></div>`;
        lastGroup = group;
      }
      const isNeg = g.Importe < 0;
      const amountColor = isNeg ? 'text-red-500' : (g.Tipo==='F'?'text-emerald-700':'text-amber-700');
      const amountDisplay = `${isNeg?'-':''}$${formatearNumero(Math.abs(g.Importe))}`;
      html += `<div class="hist-swipe-wrapper"><div class="hist-swipe-bg"><div class="hist-swipe-bg-edit"><i class="fas fa-edit"></i> Editar</div><div class="hist-swipe-bg-delete">Borrar <i class="fas fa-trash"></i></div></div><div class="hist-card" data-id="${escapeAttr(g.ID)}" data-concepto="${escapeAttr(g.Concepto)}"><div class="hist-card-top"><div><div class="hist-card-title">${escapeHtml(g.Concepto)}${g._pending?'<span class="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>':''}</div><div class="hist-card-sub">${formatFechaCorta(g.Fecha)} · ${escapeHtml(g.Centro)}</div></div><div class="hist-card-amount ${amountColor}">${amountDisplay}</div></div><div class="hist-card-meta"><span class="hist-pill">${g.Tipo==='F'?'Fijo':'Variable'}</span><span class="hist-pill">${escapeHtml(g.Metodo)}</span></div></div></div>`;
    }
    mob.innerHTML = html;
    initSwipeCards();
  }
}

function filtrarHistorial() { persistHistoryFilters(); renderHistorial(); }
const filtrarHistorialDebounced = debounce(filtrarHistorial, 200);

function limpiarFiltros() {
  $('buscar-historial').value=''; $('filtro-centro').value='todos'; $('filtro-tipo').value='todos';
  $('filtro-metodo').value='todos'; $('filtro-mes-historial').value='todos';
  persistHistoryFilters(); renderHistorial();
}

function exportarHistorialFiltrado() {
  const f=getFiltrados(); let csv='Fecha,Centro,Tipo,Concepto,Metodo,Importe\n';
  for(const g of f) csv+=[csvEscape(g.Fecha),csvEscape(g.Centro),csvEscape(g.Tipo),csvEscape(g.Concepto),csvEscape(g.Metodo),csvEscape(g.Importe||0)].join(',')+"\n";
  descargarCSV('historial.csv',csv);
}

function editarGasto(id) {
  const g=allData.find(x=>x.ID===id); if(!g) return;
  editingId = id;
  $('fecha').value=g.Fecha||''; $('centro').value=g.Centro||''; $('concepto').value=g.Concepto||'';
  $('tipo').value=g.Tipo||'V'; $('metodo').value=g.Metodo||'Efectivo'; $('importe').value=g.Importe||'';
  $('btn-guardar').innerHTML='<i class="fas fa-check mr-2"></i>Actualizar';
  $('btn-guardar').className='flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-lg transition-all';
  $('btn-cancelar').classList.remove('hidden');
  $('edit-indicator').classList.remove('hidden');
  showTab('carga');
}

function exportarCSV() {
  let csv='Fecha,Centro,Tipo,Concepto,Metodo,Importe,ID\n';
  for(const g of allData) csv+=[csvEscape(g.Fecha),csvEscape(g.Centro),csvEscape(g.Tipo),csvEscape(g.Concepto),csvEscape(g.Metodo),csvEscape(g.Importe||0),csvEscape(g.ID)].join(',')+"\n";
  descargarCSV('gastos.csv',csv);
}

/* ── Swipe Cards (mobile) — Event Delegation ── */
const _swipe = { card: null, startX: 0, currentX: 0, threshold: 80, maxSwipe: 120 };

function initSwipeCards() {
  const mob = $('historial-cards-mobile');
  if (!mob || mob._swipeInit) return;
  mob._swipeInit = true;

  mob.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.hist-card[data-id]'); if (!card) return;
    _swipe.card = card; _swipe.startX = e.touches[0].clientX; _swipe.currentX = 0;
    card.classList.add('swiping');
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
      setTimeout(() => { card.style.transform = ''; editarGasto(card.dataset.id); }, 200);
    } else if (moved < -_swipe.threshold) {
      card.style.transform = `translateX(-${_swipe.maxSwipe}px)`;
      const ok = await modalConfirm(`¿Borrar "${card.dataset.concepto}"?`);
      if (ok) { card.style.transform = 'translateX(-100%)'; card.style.opacity = '0'; await borrarGasto_direct(card.dataset.id); }
      else card.style.transform = '';
    } else card.style.transform = '';
  });
}

async function borrarGasto_direct(id) {
  showLoading(true);
  try {
    const { error } = await sb.from('gastos').delete().eq('id', id);
    if (error) throw error;
    await cargarDatos(); toast('Borrado');
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}
