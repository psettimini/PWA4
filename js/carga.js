/* ========================================
   CARGA — Formulario, patrones, autocomplete, fijos, resumen
   carga.js
======================================== */

async function guardarGasto() {
  const btn = $('btn-guardar');
  const record = {
    Fecha: $('fecha').value, Centro: $('centro').value.trim(), Tipo: $('tipo').value,
    Concepto: $('concepto').value.trim(), Metodo: $('metodo').value, Importe: safeNumber($('importe').value)
  };
  if (!record.Fecha || !record.Centro || !record.Concepto || record.Importe === 0) { toastWarn('Completá los campos (importe no puede ser cero)'); return; }

  if (!editingId) {
    const mesActual = record.Fecha ? record.Fecha.slice(0,7) : localMesStr();
    const conceptoLow = record.Concepto.toLowerCase(), centroLow = record.Centro.toLowerCase();
    const repetibles = ['transferencia','transfer','envío','envio','retiro','carga'];
    const esRepetible = repetibles.some(r => conceptoLow.includes(r));
    const dupes = allData.filter(g => g.Fecha && g.Fecha.startsWith(mesActual) && (g.Concepto||'').toLowerCase() === conceptoLow && (g.Centro||'').toLowerCase() === centroLow);
    if (dupes.length > 0) {
      const importesDupes = dupes.map(d => '$' + formatearNumero(d.Importe)).join(', ');
      const msg = esRepetible
        ? `Ya tenés ${dupes.length} "${record.Concepto}" este mes (${importesDupes}). ¿Cargar otro?`
        : `Ya existe "${record.Concepto}" en ${record.Centro} este mes (${importesDupes}). ¿Cargar igual?`;
      if (!await modalConfirm(msg)) return;
    }
  }

  const prevHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Guardando';
  showLoading(true);
  try {
    if (!navigator.onLine) throw new Error('offline');
    if (editingId) {
      const { error } = await sb.from('gastos').update({ fecha: record.Fecha, centro: record.Centro, tipo: record.Tipo, concepto: record.Concepto, metodo: record.Metodo, importe: record.Importe }).eq('id', editingId);
      if (error) throw error;
    } else {
      const { error } = await sb.from('gastos').insert({ user_id: currentUserId, fecha: record.Fecha, centro: record.Centro, tipo: record.Tipo, concepto: record.Concepto, metodo: record.Metodo, importe: record.Importe });
      if (error) throw error;
    }
    const wasEdit = !!editingId;
    limpiarFormulario(); await cargarDatos();
    if (navigator.vibrate) navigator.vibrate(50);
    toast(wasEdit ? '¡Actualizado!' : '¡Guardado!');
  } catch (e) {
    if (editingId) {
      enqueueOperation({ action: 'update', payload: { id: editingId, record } });
      const idx = allData.findIndex(x => x.ID === editingId);
      if (idx >= 0) allData[idx] = { ...allData[idx], ...record, _pending: true };
      toastWarn('Sin conexión. Edición en cola.');
    } else {
      enqueueOperation({ action: 'add', payload: { data: record } });
      allData.unshift({ ...record, ID: 'local-' + Date.now(), _pending: true });
      toastWarn('Sin conexión. Gasto guardado localmente.');
    }
    saveCache(allData); procesarPatrones(); actualizarSugerencias(); actualizarResumen(); renderHistorial();
    limpiarFormulario();
  } finally { btn.disabled = false; btn.innerHTML = prevHtml; showLoading(false); }
}

function limpiarFormulario() {
  editingId = null;
  $('concepto').value = ''; $('importe').value = '';
  $('avg-suggestion')?.classList.add('hidden');
  $('btn-guardar').innerHTML = '<i class="fas fa-save mr-2"></i>Guardar';
  $('btn-guardar').className = 'flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all';
  $('btn-cancelar').classList.add('hidden');
  $('edit-indicator').classList.add('hidden');
}

function cancelarEdicion() {
  limpiarFormulario(); setFechaHoy();
  $('centro').value = ''; $('tipo').value = 'F';
  $('metodo').value = dbMetodos.length ? dbMetodos[0] : 'Efectivo';
  toast('Edición cancelada');
}

async function borrarGasto(id, concepto) {
  if (!await modalConfirm(`¿Borrar "${concepto}"?`)) return;
  showLoading(true);
  try {
    const { error } = await sb.from('gastos').delete().eq('id', id);
    if (error) throw error;
    await cargarDatos(); toast('Borrado');
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

/* ── Patrones ── */
function procesarPatrones() {
  const map = new Map();
  const centrosSet = new Set(), metodosSet = new Set(), mesesSet = new Set();
  for (const g of allData) {
    const key = `${g.Concepto||''}|${g.Centro||''}`;
    if (!map.has(key)) map.set(key, { concepto:g.Concepto, centro:g.Centro, tipo:g.Tipo, metodo:g.Metodo, freq:0, importes:[] });
    const p = map.get(key); p.freq++; const imp = safeNumber(g.Importe); if (imp>0) p.importes.push(imp);
    if (g.Centro) centrosSet.add(g.Centro);
    if (g.Metodo) metodosSet.add(g.Metodo);
    const mk = getMesKey(g.Fecha); if (mk) mesesSet.add(mk);
  }
  patrones = [];
  for (const p of map.values()) {
    const avg = p.importes.length ? Math.round(p.importes.reduce((a,b)=>a+b,0)/p.importes.length) : 0;
    patrones.push({ concepto:p.concepto, centro:p.centro, tipo:p.tipo, metodo:p.metodo, frecuencia:p.freq, promedio:avg });
  }
  patrones.sort((a,b)=>b.frecuencia-a.frecuencia);

  const centros = uniqueSorted([...centrosSet, ...dbCentros]);
  const metodos = uniqueSorted([...metodosSet, ...dbMetodos]);
  const meses = [...mesesSet].sort();

  $('centros-list').innerHTML = centros.map(c=>`<option value="${escapeAttr(c)}">`).join('');
  $('filtro-centro').innerHTML = '<option value="todos">Todos los centros</option>' + centros.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  $('filtro-metodo').innerHTML = '<option value="todos">Todos los métodos</option>' + metodos.map(m=>`<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('');
  $('filtro-mes-historial').innerHTML = '<option value="todos">Todos los meses</option>' + meses.map(m=>`<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('');
  updateMetodoSelect();
}

/* ── Autocomplete ── */
function mostrarSugerencias(v) {
  const div = $('suggestions'); suggestionIndex = -1;
  if (!v || v.length < 2) { div.classList.add('hidden'); return; }
  const q = v.toLowerCase();
  const m = patrones.filter(p=>(p.concepto||'').toLowerCase().includes(q)||(p.centro||'').toLowerCase().includes(q)).slice(0,6);
  if (!m.length) { div.classList.add('hidden'); return; }
  div.innerHTML = m.map(p=>`<div class="suggestion-item" onclick="seleccionarPatron('${escapeAttr(p.concepto)}','${escapeAttr(p.centro)}')"><div class="flex justify-between"><div><div class="font-semibold">${escapeHtml(p.concepto)}</div><div class="text-xs text-slate-500">${escapeHtml(p.centro)}</div></div><div class="text-right"><div class="text-xs font-bold text-blue-600">${p.frecuencia}x</div>${p.promedio>0?`<div class="text-xs text-slate-500">~$${formatearNumero(p.promedio)}</div>`:''}</div></div></div>`).join('');
  div.classList.remove('hidden');
}
function navegarSugerencias(e) {
  const items = document.querySelectorAll('.suggestion-item'); if (!items.length) return;
  if (e.key==='ArrowDown'){e.preventDefault();suggestionIndex=Math.min(suggestionIndex+1,items.length-1);}
  else if(e.key==='ArrowUp'){e.preventDefault();suggestionIndex=Math.max(suggestionIndex-1,0);}
  else if(e.key==='Enter'&&suggestionIndex>=0){e.preventDefault();items[suggestionIndex].click();return;}
  else if(e.key==='Escape'){$('suggestions').classList.add('hidden');return;}
  items.forEach((it,i)=>{it.classList.toggle('active',i===suggestionIndex);if(i===suggestionIndex)it.scrollIntoView({block:'nearest'});});
}
function seleccionarPatron(concepto,centro) {
  const p = patrones.find(x=>x.concepto===concepto&&x.centro===centro); if(!p) return;
  $('concepto').value=p.concepto; $('centro').value=p.centro; $('tipo').value=p.tipo; $('metodo').value=p.metodo;
  $('suggestions').classList.add('hidden');
  if(p.promedio>0){$('avg-suggestion').textContent='Promedio: $'+formatearNumero(p.promedio);$('avg-suggestion').classList.remove('hidden');}
  $('importe').focus();
}
function filtrarSugerencias() { if ($('concepto').value.length >= 2) mostrarSugerencias($('concepto').value); }
const mostrarSugerenciasDebounced = debounce(mostrarSugerencias, 120);

/* ── Fijos Pendientes ── */
function actualizarSugerencias() {
  const hoy = new Date(), mesActual = localMesStr();
  const prev1 = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1), mesAnterior = `${prev1.getFullYear()}-${String(prev1.getMonth()+1).padStart(2,'0')}`;
  const prev2 = new Date(hoy.getFullYear(), hoy.getMonth()-2, 1), mes2Atras = `${prev2.getFullYear()}-${String(prev2.getMonth()+1).padStart(2,'0')}`;
  const label = formatMesLabel(mesAnterior);
  const ANUAL = 'pagado por el año';

  const fijos = new Map();
  let excluidos = 0, impExcluido = 0;
  for (const g of allData) {
    if (g.Tipo!=='F'||!g.Fecha||!g.Fecha.startsWith(mesAnterior)) continue;
    if ((g.Metodo||'').trim().toLowerCase()===ANUAL) { excluidos++; impExcluido+=safeNumber(g.Importe); continue; }
    const key = `${g.Concepto}|${g.Centro}`;
    if (fijos.has(key)) fijos.get(key).importe += safeNumber(g.Importe);
    else fijos.set(key, { concepto:g.Concepto, centro:g.Centro, tipo:g.Tipo, metodo:g.Metodo, importe:safeNumber(g.Importe) });
  }
  const fijos2 = new Map();
  for (const g of allData) {
    if (g.Tipo!=='F'||!g.Fecha||!g.Fecha.startsWith(mes2Atras)) continue;
    if ((g.Metodo||'').trim().toLowerCase()===ANUAL) continue;
    const key = `${g.Concepto}|${g.Centro}`;
    if (fijos2.has(key)) fijos2.get(key).importe += safeNumber(g.Importe);
    else fijos2.set(key, { importe: safeNumber(g.Importe) });
  }
  const cargados = new Set();
  for (const g of allData) { if (g.Fecha&&g.Fecha.startsWith(mesActual)) cargados.add(`${g.Concepto}|${g.Centro}`); }

  const pend = [];
  for (const [k,v] of fijos) {
    if (cargados.has(k)) continue;
    const ant = fijos2.get(k);
    v.impAnterior = ant?.importe > 0 ? ant.importe : null;
    v.variacion = v.impAnterior ? ((v.importe - v.impAnterior) / v.impAnterior * 100) : null;
    pend.push(v);
  }
  pend.sort((a,b)=>b.importe-a.importe);

  $('count-sugerencias').textContent = pend.length;
  const div = $('lista-sugerencias');
  if (!pend.length) { div.innerHTML = `<p class="text-sm text-emerald-600"><i class="fas fa-check-circle mr-2"></i>¡Todos los fijos de ${label} cargados!</p>`; return; }

  const tot = pend.reduce((s,p)=>s+p.importe,0);
  div.innerHTML =
    `<div class="text-xs text-slate-500 mb-2 flex justify-between"><span>Pendientes vs ${label}</span><span class="font-bold text-red-600">$${formatearNumero(tot)}</span></div>` +
    (excluidos>0?`<div class="text-xs text-slate-400 mb-2 italic"><i class="fas fa-info-circle mr-1"></i>${excluidos} anual(es) excluidos ($${formatearNumero(impExcluido)})</div>`:'')+
    pend.map(s => {
      let varHtml = '';
      if (s.variacion !== null) {
        const up = s.variacion > 0, down = s.variacion < 0;
        const arrow = up ? '↑' : down ? '↓' : '=';
        const color = up ? 'text-red-500' : down ? 'text-emerald-500' : 'text-slate-400';
        varHtml = `<span class="text-xs ${color} ml-1">${arrow}${Math.abs(s.variacion).toFixed(0)}%</span>`;
      }
      return `<div class="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors" onclick="seleccionarFijo('${escapeAttr(s.concepto)}','${escapeAttr(s.centro)}','${escapeAttr(s.tipo)}','${escapeAttr(s.metodo)}',${s.importe})">
        <div class="flex-1 min-w-0"><div class="text-sm font-bold truncate">${escapeHtml(s.concepto)}</div><div class="text-xs text-amber-800">${escapeHtml(s.centro)}</div></div>
        <div class="text-right whitespace-nowrap"><div class="text-sm font-bold text-amber-700">$${formatearNumero(s.importe)}${varHtml}</div></div>
        <button onclick="event.stopPropagation();guardarFijoRapido('${escapeAttr(s.concepto)}','${escapeAttr(s.centro)}','${escapeAttr(s.tipo)}','${escapeAttr(s.metodo)}',${s.importe},this)" class="ml-1 w-9 h-9 flex-shrink-0 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm" title="Cargar directo"><i class="fas fa-bolt"></i></button>
      </div>`;
    }).join('');
}

function seleccionarFijo(c,ce,t,m,i) {
  $('concepto').value=c; $('centro').value=ce; $('tipo').value=t; $('metodo').value=m; $('importe').value=i;
  $('suggestions').classList.add('hidden'); $('avg-suggestion').classList.add('hidden'); $('importe').focus();
}

async function guardarFijoRapido(concepto, centro, tipo, metodo, importe, btn) {
  const fecha = localDateStr(), originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
  try {
    const { error } = await sb.from('gastos').insert({ user_id: currentUserId, fecha, centro, tipo, concepto, metodo, importe });
    if (error) throw error;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.className = btn.className.replace('bg-emerald-500 hover:bg-emerald-600','bg-slate-300');
    if (navigator.vibrate) navigator.vibrate(50);
    toast(`${concepto} guardado`);
    setTimeout(() => cargarDatos(), 600);
  } catch (e) { btn.innerHTML = originalHtml; btn.disabled = false; toastError(e.message); }
}

function actualizarResumen() {
  const mes = localMesStr(); let total=0, cant=0;
  for (const g of allData) { if (g.Fecha&&g.Fecha.startsWith(mes)) { total+=safeNumber(g.Importe); cant++; } }
  $('resumen-total').textContent = '$'+formatearNumero(total);
  $('resumen-cantidad').textContent = cant;
  $('resumen-promedio').textContent = '$'+formatearNumero(cant?total/cant:0);
}
