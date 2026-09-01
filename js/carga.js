/* ========================================
   CARGA — Formulario, patrones, autocomplete, fijos, resumen
   carga.js — Usa registry.cargarDatos y registry.renderHistorial
======================================== */
import { $, S, sb, registry, MONEDA_DEFAULT } from './state.js';
import { safeNumber, formatearNumero, formatImporte, localDateStr, localMesStr, getMesKey, uniqueSorted, escapeHtml, escapeAttr, formatMesLabel, enqueueOperation, saveCache, debounce, showLoading, buildDismissalsMap, addDismissal, clearDismissalsForKey, evalExpresion } from './utils.js';
import { toast, toastWarn, toastError, modalConfirm } from './ui.js';
import { pendientesDelMes, detectadosSinPresupuestar, presupuestarDetectado, itemsActivos, itemsSinAncla, avanceFijosDelMes, FRECUENCIAS } from './presupuesto.js';

function fijoKey(concepto, centro, moneda) {
  return `${concepto}|${centro}|${moneda || 'ARS'}`;
}

export function setMoneda(m) {
  const moneda = (m === 'USD') ? 'USD' : 'ARS';
  const input = $('moneda'); if (input) input.value = moneda;
  document.querySelectorAll('.moneda-btn').forEach(btn => {
    const active = btn.dataset.moneda === moneda;
    btn.classList.toggle('moneda-btn-active', active);
  });
  const lbl = $('importe-moneda-label');
  if (lbl) lbl.textContent = moneda === 'USD' ? 'Importe (U$S)' : 'Importe ($)';
  S.formDirty = true;
}

function getMonedaForm() {
  return $('moneda')?.value === 'USD' ? 'USD' : 'ARS';
}

/* Si el importe contiene operadores, evalúa al perder foco y reemplaza el texto
   por el resultado. Si la expresión es inválida deja el texto como está. */
export function evaluarImporteOnBlur() {
  const input = $('importe'); if (!input) return;
  const raw = input.value.trim();
  if (!raw || !/[+\-*/]/.test(raw)) return;
  const v = evalExpresion(raw);
  if (Number.isFinite(v)) input.value = String(v);
}

export async function guardarGasto() {
  const btn = $('btn-guardar');
  const importeEval = evalExpresion($('importe').value);
  if (Number.isNaN(importeEval)) { toastWarn('Importe inválido. Usá números y operadores + - * / (ej: 100+50)'); return; }
  if (Number.isFinite(importeEval) && /[+\-*/]/.test($('importe').value.trim())) $('importe').value = String(importeEval);
  const record = {
    Fecha: $('fecha').value, Centro: $('centro').value.trim(), Tipo: $('tipo').value,
    Concepto: $('concepto').value.trim(), Metodo: $('metodo').value, Importe: importeEval,
    Moneda: getMonedaForm()
  };
  if (!record.Fecha || !record.Centro || !record.Concepto || record.Importe === 0) { toastWarn('Completá los campos (importe no puede ser cero)'); return; }

  if (!S.editingId) {
    const mesFecha = record.Fecha ? record.Fecha.slice(0,7) : localMesStr();
    const conceptoLow = record.Concepto.toLowerCase(), centroLow = record.Centro.toLowerCase();
    const repetibles = ['transferencia','transfer','envío','envio','retiro','carga'];
    const esRepetible = repetibles.some(r => conceptoLow.includes(r));
    const dupes = S.allData.filter(g => g.Fecha && g.Fecha.startsWith(mesFecha) && (g.Concepto||'').toLowerCase() === conceptoLow && (g.Centro||'').toLowerCase() === centroLow && (g.Moneda || 'ARS') === record.Moneda);
    if (dupes.length > 0) {
      const importesDupes = dupes.map(d => formatImporte(d.Importe, d.Moneda || 'ARS')).join(', ');
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
    if (S.editingId) {
      const { error } = await sb.from('gastos').update({ fecha: record.Fecha, centro: record.Centro, tipo: record.Tipo, concepto: record.Concepto, metodo: record.Metodo, importe: record.Importe, moneda: record.Moneda }).eq('id', S.editingId);
      if (error) throw error;
    } else {
      const { error } = await sb.from('gastos').insert({ user_id: S.currentUserId, fecha: record.Fecha, centro: record.Centro, tipo: record.Tipo, concepto: record.Concepto, metodo: record.Metodo, importe: record.Importe, moneda: record.Moneda });
      if (error) throw error;
    }
    const wasEdit = !!S.editingId;
    if (!wasEdit) clearDismissalsForKey(fijoKey(record.Concepto, record.Centro, record.Moneda));
    limpiarFormulario(); await registry.cargarDatos?.();
    if (navigator.vibrate) navigator.vibrate(50);
    toast(wasEdit ? '¡Actualizado!' : '¡Guardado!');
  } catch (e) {
    if (S.editingId) {
      enqueueOperation({ action: 'update', payload: { id: S.editingId, record } });
      const idx = S.allData.findIndex(x => x.ID === S.editingId);
      if (idx >= 0) S.allData[idx] = { ...S.allData[idx], ...record, _pending: true };
      toastWarn('Sin conexión. Edición en cola.');
    } else {
      enqueueOperation({ action: 'add', payload: { data: record } });
      S.allData.unshift({ ...record, ID: 'local-' + Date.now(), _pending: true });
      clearDismissalsForKey(fijoKey(record.Concepto, record.Centro, record.Moneda));
      toastWarn('Sin conexión. Gasto guardado localmente.');
    }
    saveCache(S.allData); procesarPatrones(); actualizarSugerencias(); actualizarResumen();
    registry.renderHistorial?.();
    limpiarFormulario();
  } finally { btn.disabled = false; btn.innerHTML = prevHtml; showLoading(false); }
}

export function limpiarFormulario() {
  S.editingId = null;
  $('concepto').value = ''; $('importe').value = '';
  setMoneda(MONEDA_DEFAULT);
  $('avg-suggestion')?.classList.add('hidden');
  $('btn-guardar').innerHTML = '<i class="fas fa-save mr-2"></i>Guardar';
  $('btn-guardar').className = 'flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all';
  $('btn-cancelar').classList.add('hidden');
  $('edit-indicator').classList.add('hidden');
  S.formDirty = false;
}

export function cancelarEdicion() {
  limpiarFormulario();
  $('fecha').value = localDateStr();
  $('centro').value = ''; $('tipo').value = 'F';
  $('metodo').value = S.dbMetodos.length ? S.dbMetodos[0] : 'Efectivo';
  setMoneda(MONEDA_DEFAULT);
  toast('Edición cancelada');
}

export async function borrarGasto(id, concepto) {
  if (!await modalConfirm(`¿Borrar "${concepto}"?`)) return;
  showLoading(true);
  try {
    const { error } = await sb.from('gastos').delete().eq('id', id);
    if (error) throw error;
    await registry.cargarDatos?.(); toast('Borrado');
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

/* ── Patrones ── */
export function procesarPatrones() {
  const map = new Map();
  const centrosSet = new Set(), metodosSet = new Set(), mesesSet = new Set();
  for (const g of S.allData) {
    const moneda = g.Moneda || 'ARS';
    const key = `${g.Concepto||''}|${g.Centro||''}|${moneda}`;
    if (!map.has(key)) map.set(key, { concepto:g.Concepto, centro:g.Centro, tipo:g.Tipo, metodo:g.Metodo, moneda, freq:0, importes:[] });
    const p = map.get(key); p.freq++; const imp = safeNumber(g.Importe); if (imp>0) p.importes.push(imp);
    if (g.Centro) centrosSet.add(g.Centro);
    if (g.Metodo) metodosSet.add(g.Metodo);
    const mk = getMesKey(g.Fecha); if (mk) mesesSet.add(mk);
  }
  S.patrones = [];
  for (const p of map.values()) {
    const avg = p.importes.length ? Math.round(p.importes.reduce((a,b)=>a+b,0)/p.importes.length) : 0;
    S.patrones.push({ concepto:p.concepto, centro:p.centro, tipo:p.tipo, metodo:p.metodo, moneda:p.moneda, frecuencia:p.freq, promedio:avg });
  }
  S.patrones.sort((a,b)=>b.frecuencia-a.frecuencia);

  const centros = uniqueSorted([...centrosSet, ...S.dbCentros]);
  const metodos = uniqueSorted([...metodosSet, ...S.dbMetodos]);
  const meses = [...mesesSet].sort();

  $('centros-list').innerHTML = centros.map(c=>`<option value="${escapeAttr(c)}">`).join('');
  $('filtro-centro').innerHTML = '<option value="todos">Todos los centros</option>' + centros.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  $('filtro-metodo').innerHTML = '<option value="todos">Todos los métodos</option>' + metodos.map(m=>`<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('');
  $('filtro-mes-historial').innerHTML = '<option value="todos">Todos los meses</option>' + meses.map(m=>`<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('');
}

/* ── Autocomplete ── */
export function mostrarSugerencias(v) {
  const div = $('suggestions'); S.suggestionIndex = -1;
  if (!v || v.length < 2) { div.classList.add('hidden'); return; }
  const q = v.toLowerCase();
  const m = S.patrones.filter(p=>(p.concepto||'').toLowerCase().includes(q)||(p.centro||'').toLowerCase().includes(q)).slice(0,6);
  if (!m.length) { div.classList.add('hidden'); return; }
  div.innerHTML = m.map(p=>{
    const moneda = p.moneda || 'ARS';
    const monedaTag = moneda === 'USD' ? '<span class="ml-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold">U$S</span>' : '';
    return `<div class="suggestion-item" data-action="seleccionarPatron" data-concepto="${escapeAttr(p.concepto)}" data-centro="${escapeAttr(p.centro)}" data-moneda="${escapeAttr(moneda)}"><div class="flex justify-between"><div><div class="font-semibold">${escapeHtml(p.concepto)}${monedaTag}</div><div class="text-xs text-slate-500">${escapeHtml(p.centro)}</div></div><div class="text-right"><div class="text-xs font-bold text-blue-600">${p.frecuencia}x</div>${p.promedio>0?`<div class="text-xs text-slate-500">~${formatImporte(p.promedio, moneda)}</div>`:''}</div></div></div>`;
  }).join('');
  div.classList.remove('hidden');
}

export function navegarSugerencias(e) {
  const items = document.querySelectorAll('.suggestion-item'); if (!items.length) return;
  if (e.key==='ArrowDown'){e.preventDefault();S.suggestionIndex=Math.min(S.suggestionIndex+1,items.length-1);}
  else if(e.key==='ArrowUp'){e.preventDefault();S.suggestionIndex=Math.max(S.suggestionIndex-1,0);}
  else if(e.key==='Enter'&&S.suggestionIndex>=0){e.preventDefault();items[S.suggestionIndex].click();return;}
  else if(e.key==='Escape'){$('suggestions').classList.add('hidden');return;}
  items.forEach((it,i)=>{it.classList.toggle('active',i===S.suggestionIndex);if(i===S.suggestionIndex)it.scrollIntoView({block:'nearest'});});
}

export function seleccionarPatron(concepto, centro, moneda) {
  const m = moneda || 'ARS';
  const p = S.patrones.find(x=>x.concepto===concepto&&x.centro===centro&&(x.moneda||'ARS')===m); if(!p) return;
  $('concepto').value=p.concepto; $('centro').value=p.centro; $('tipo').value=p.tipo; $('metodo').value=p.metodo;
  setMoneda(p.moneda || 'ARS');
  $('suggestions').classList.add('hidden');
  if(p.promedio>0){$('avg-suggestion').textContent='Promedio: '+formatImporte(p.promedio, p.moneda || 'ARS');$('avg-suggestion').classList.remove('hidden');}
  S.formDirty = true; $('importe').focus();
}

export function filtrarSugerencias() { if ($('concepto').value.length >= 2) mostrarSugerencias($('concepto').value); }
export const mostrarSugerenciasDebounced = debounce((v) => mostrarSugerencias(v), 120);

/* ── Fijos Pendientes ──
   El presupuesto es la fuente de verdad: un ítem aparece solo el mes en que
   vence. Debajo, plegada, la detección sobre el historial actúa de red de
   seguridad para lo que todavía no se presupuestó. */
let mostrarDetectados = false;

export function toggleDetectadosCarga() {
  mostrarDetectados = !mostrarDetectados;
  actualizarSugerencias();
}

const monedaTag = m => m === 'USD'
  ? '<span class="ml-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold">U$S</span>' : '';

function filaPendiente(s) {
  let varHtml = '';
  if (s.variacion !== null && Math.abs(s.variacion) >= 5) {
    const up = s.variacion > 0;
    varHtml = `<span class="text-xs ${up ? 'text-red-500' : 'text-emerald-500'} ml-1">${up ? '↑' : '↓'}${Math.abs(s.variacion).toFixed(0)}%</span>`;
  }
  const frec = FRECUENCIAS[s.Frecuencia];
  const frecTag = frec && frec.meses > 1
    ? `<span class="ml-1 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">${escapeHtml(frec.label)}</span>` : '';
  const ultimo = s.ultimoPago !== null
    ? `<span class="text-xs text-slate-400 ml-1">último ${formatImporte(s.ultimoPago, s.Moneda)}</span>` : '';
  return `<div class="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors" data-action="seleccionarFijo" data-concepto="${escapeAttr(s.Concepto)}" data-centro="${escapeAttr(s.Centro)}" data-tipo="F" data-metodo="${escapeAttr(s.Metodo)}" data-moneda="${escapeAttr(s.Moneda)}" data-importe="${s.Importe}">
    <div class="flex-1 min-w-0"><div class="text-sm font-bold truncate">${escapeHtml(s.Concepto)}${monedaTag(s.Moneda)}${frecTag}</div><div class="text-xs text-amber-800">${escapeHtml(s.Centro)}${ultimo}</div></div>
    <div class="text-right whitespace-nowrap"><div class="text-sm font-bold text-amber-700">${formatImporte(s.Importe, s.Moneda)}${varHtml}</div></div>
    <button data-action="dismissFijoPendiente" data-concepto="${escapeAttr(s.Concepto)}" data-centro="${escapeAttr(s.Centro)}" data-moneda="${escapeAttr(s.Moneda)}" class="ml-1 w-7 h-7 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md text-xs" title="Descartar solo este mes (para darlo de baja, editalo en Presupuesto)"><i class="fas fa-times"></i></button>
    <button data-action="guardarFijoRapido" data-concepto="${escapeAttr(s.Concepto)}" data-centro="${escapeAttr(s.Centro)}" data-tipo="F" data-metodo="${escapeAttr(s.Metodo)}" data-moneda="${escapeAttr(s.Moneda)}" data-importe="${s.Importe}" class="ml-1 w-9 h-9 flex-shrink-0 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm" title="Cargar directo"><i class="fas fa-bolt"></i></button>
  </div>`;
}

function filaDetectado(d) {
  const frec = FRECUENCIAS[d.frecuencia];
  const frecTag = frec.meses > 1
    ? `<span class="ml-1 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">${escapeHtml(frec.label)}</span>` : '';
  return `<div class="flex items-center gap-2 p-2 rounded-lg border" style="border-color:var(--border-solid);background:var(--kpi-bg)">
    <div class="flex-1 min-w-0"><div class="text-sm font-medium truncate" style="color:var(--text)">${escapeHtml(d.concepto)}${monedaTag(d.moneda)}${frecTag}</div><div class="text-xs" style="color:var(--text3)">${escapeHtml(d.centro)} · último ${formatMesLabel(d.ultimoMes)}</div></div>
    <div class="text-right whitespace-nowrap text-sm font-bold" style="color:var(--text)">${formatImporte(d.importe, d.moneda)}</div>
    <button data-action="presupuestarDetectado" data-key="${escapeAttr(d.key)}" class="ml-1 w-9 h-9 flex-shrink-0 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm" title="Agregar al presupuesto"><i class="fas fa-bullseye"></i></button>
  </div>`;
}

export function actualizarSugerencias() {
  const div = $('lista-sugerencias'); if (!div) return;
  const mesActual = localMesStr();
  const dismissals = buildDismissalsMap();
  const descartado = k => dismissals.get(k)?.has(mesActual);

  const hayPresupuesto = itemsActivos().length > 0;
  const pend = pendientesDelMes(mesActual).filter(p => !descartado(fijoKey(p.Concepto, p.Centro, p.Moneda)));
  const detectados = detectadosSinPresupuestar(mesActual).filter(d => !descartado(d.key));
  const sinAncla = itemsSinAncla();

  $('count-sugerencias').textContent = pend.length;

  const totales = { ARS: 0, USD: 0 };
  for (const p of pend) totales[p.Moneda] = (totales[p.Moneda] || 0) + safeNumber(p.Importe);
  const totHtml = ['ARS','USD'].filter(m => totales[m] !== 0)
    .map(m => `<span class="font-bold text-red-600 ml-2">${formatImporte(totales[m], m)}</span>`).join('');

  let html = '';
  if (!hayPresupuesto) {
    html += `<div class="text-xs p-2 mb-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800"><i class="fas fa-bullseye mr-1"></i>Armá tu presupuesto en la pestaña <strong>Presupuesto</strong> para que los pendientes salgan del mes que corresponde.</div>`;
  } else {
    html += `<div class="text-xs text-slate-500 mb-2 flex justify-between items-center"><span>Vencen en ${formatMesLabel(mesActual)}</span><span>${totHtml}</span></div>`;
    html += pend.length
      ? pend.map(filaPendiente).join('')
      : `<p class="text-sm text-emerald-600"><i class="fas fa-check-circle mr-2"></i>¡Todos los fijos del mes cargados!</p>`;
    if (sinAncla.length) {
      html += `<div class="text-xs mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800"><i class="fas fa-triangle-exclamation mr-1"></i>${sinAncla.length} ítem(s) no mensual(es) sin mes asignado: no se pueden avisar hasta definirlo en <strong>Presupuesto</strong>.</div>`;
    }
  }

  if (detectados.length) {
    const totDet = { ARS: 0, USD: 0 };
    for (const d of detectados) totDet[d.moneda] += d.importe;
    const detTot = ['ARS','USD'].filter(m => totDet[m] !== 0).map(m => formatImporte(totDet[m], m)).join(' · ');
    html += `<button type="button" data-action="toggleDetectadosCarga" class="w-full mt-3 pt-2 border-t text-xs flex items-center justify-between" style="border-color:var(--border-solid);color:var(--text3)">
      <span><i class="fas fa-chevron-${mostrarDetectados ? 'down' : 'right'} mr-1"></i>Detectados sin presupuestar (${detectados.length})</span><span>${detTot}</span></button>`;
    if (mostrarDetectados) html += `<div class="space-y-2 mt-2">${detectados.map(filaDetectado).join('')}</div>`;
  }

  div.innerHTML = html;
}

export async function presupuestarDetectadoCarga(key) {
  if (await presupuestarDetectado(key)) actualizarSugerencias();
}

export function seleccionarFijo(concepto, centro, tipo, metodo, importe, moneda) {
  $('concepto').value=concepto; $('centro').value=centro; $('tipo').value=tipo; $('metodo').value=metodo; $('importe').value=importe;
  setMoneda(moneda || 'ARS');
  $('suggestions').classList.add('hidden'); $('avg-suggestion').classList.add('hidden');
  S.formDirty = true; $('importe').focus();
}

export function dismissFijoPendiente(concepto, centro, moneda) {
  /* Solo por este mes. La baja definitiva se hace desactivando el ítem en
     Presupuesto: es explícita, reversible y sincroniza entre dispositivos. */
  addDismissal(fijoKey(concepto, centro, moneda), localMesStr());
  actualizarSugerencias();
  toast(`"${concepto}" descartado este mes`);
}

export async function guardarFijoRapido(concepto, centro, tipo, metodo, importe, moneda, btn) {
  const fecha = localDateStr(), originalHtml = btn.innerHTML;
  const m = moneda === 'USD' ? 'USD' : 'ARS';
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
  try {
    const { error } = await sb.from('gastos').insert({ user_id: S.currentUserId, fecha, centro, tipo, concepto, metodo, importe, moneda: m });
    if (error) throw error;
    clearDismissalsForKey(fijoKey(concepto, centro, m));
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.className = btn.className.replace('bg-emerald-500 hover:bg-emerald-600','bg-slate-300');
    if (navigator.vibrate) navigator.vibrate(50);
    toast(`${concepto} guardado`);
    setTimeout(() => registry.cargarDatos?.(), 600);
  } catch (e) { btn.innerHTML = originalHtml; btn.disabled = false; toastError(e.message); }
}

export function actualizarResumen() {
  const mes = localMesStr();
  const tot = { ARS: 0, USD: 0 };
  const cnt = { ARS: 0, USD: 0 };
  for (const g of S.allData) {
    if (!g.Fecha || !g.Fecha.startsWith(mes)) continue;
    const m = g.Moneda || 'ARS';
    tot[m] += safeNumber(g.Importe); cnt[m]++;
  }
  $('resumen-total').textContent = formatImporte(tot.ARS, 'ARS');
  $('resumen-total-usd').textContent = formatImporte(tot.USD, 'USD');
  $('resumen-cantidad').textContent = cnt.ARS + cnt.USD;
  $('resumen-promedio').textContent = formatImporte(cnt.ARS ? tot.ARS / cnt.ARS : 0, 'ARS');
  $('resumen-promedio-usd').textContent = formatImporte(cnt.USD ? tot.USD / cnt.USD : 0, 'USD');
  $('resumen-total-usd-row')?.classList.toggle('hidden', tot.USD === 0);
  $('resumen-promedio-usd-row')?.classList.toggle('hidden', tot.USD === 0 && cnt.USD === 0);
  renderAvanceFijos();
}

function renderAvanceFijos() {
  const cont = $('resumen-fijos'); if (!cont) return;
  const a = avanceFijosDelMes();
  cont.classList.toggle('hidden', a.total === 0);
  if (!a.total) return;
  const pct = Math.round(a.hechos / a.total * 100);
  const falta = ['ARS','USD'].filter(m => a['falta' + m] !== 0)
    .map(m => formatImporte(a['falta' + m], m)).join(' · ');
  cont.innerHTML = `<div class="flex justify-between items-baseline"><span class="text-slate-600 text-sm">Fijos del mes:</span><span class="font-bold text-sm">${a.hechos} de ${a.total}</span></div>
    <div class="h-1.5 rounded-full mt-1.5 overflow-hidden" style="background:var(--border-solid)"><div class="h-full rounded-full bg-emerald-500" style="width:${pct}%"></div></div>
    ${falta ? `<div class="text-xs mt-1.5" style="color:var(--text3)">Falta pagar <span class="font-semibold text-red-600">${falta}</span></div>` : '<div class="text-xs mt-1.5 text-emerald-600">Todo cargado</div>'}`;
}
