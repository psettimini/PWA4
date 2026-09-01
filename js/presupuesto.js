/* ========================================
   PRESUPUESTO — Costo fijo mensual y baseline para comparar
   presupuesto.js

   Un ítem de presupuesto es un gasto fijo recurrente identificado por
   concepto + centro + moneda (la misma clave que usa "fijos pendientes").
   `Importe` es el monto POR OCURRENCIA; `Frecuencia` define cómo se
   mensualiza. Así un seguro anual pesa 1/12 por mes y un pago que este
   mes cayó dos veces no distorsiona la comparación.
======================================== */
import { $, S, sb, STORAGE_KEYS, registry } from './state.js';
import { safeNumber, formatImporte, formatImporteSigned, localMesStr, getMesKey,
         formatMesLabel, escapeHtml, escapeAttr, showLoading } from './utils.js';
import { toast, toastError, toastWarn, modalConfirm } from './ui.js';

export const FRECUENCIAS = {
  mensual:       { meses: 1,  label: 'Mensual' },
  bimestral:     { meses: 2,  label: 'Bimestral' },
  trimestral:    { meses: 3,  label: 'Trimestral' },
  cuatrimestral: { meses: 4,  label: 'Cuatrimestral' },
  semestral:     { meses: 6,  label: 'Semestral' },
  anual:         { meses: 12, label: 'Anual' },
};
/* Todas las frecuencias dividen a 12 → el mes ancla (1-12) alcanza para saber si vence. */
const MESES_A_FRECUENCIA = { 1:'mensual', 2:'bimestral', 3:'trimestral', 4:'cuatrimestral', 6:'semestral', 12:'anual' };
const NOMBRES_MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const VENTANA_DETECCION = 24;   /* 24 meses: un gasto anual necesita 2 ocurrencias para inferir su frecuencia */
const METODO_ANUAL = 'pagado por el año';

export const PRESUP_KEY = '__presupuesto__';

export const mesesDe = it => FRECUENCIAS[it?.Frecuencia]?.meses || 1;
export const importeMensual = it => safeNumber(it.Importe) / mesesDe(it);
const mesIndex = m => { const [a, x] = String(m).split('-').map(Number); return a * 12 + (x - 1); };
const claveDe = it => `${it.Concepto}|${it.Centro}|${it.Moneda}`;

/* ── Carga / persistencia ── */
function transform(raw) {
  return raw.map(p => ({
    ID: p.id, Concepto: p.concepto, Centro: p.centro, Moneda: p.moneda || 'ARS',
    Metodo: p.metodo || '', Importe: Number(p.importe), Frecuencia: p.frecuencia || 'mensual',
    MesAncla: p.mes_ancla || null, DiaVencimiento: p.dia_vencimiento || null,
    CuotasRestantes: p.cuotas_restantes ?? null, Activo: p.activo !== false, Notas: p.notas || ''
  }));
}

export async function cargarPresupuesto() {
  try {
    const { data, error } = await sb.from('presupuesto_fijos').select('*');
    if (error) throw error;
    S.presupuesto = transform(data || []).sort((a, b) => Math.abs(importeMensual(b)) - Math.abs(importeMensual(a)));
    try { localStorage.setItem(STORAGE_KEYS.presupuestoCache, JSON.stringify(S.presupuesto)); } catch {}
  } catch (e) {
    console.error('[cargarPresupuesto]', e.message || e);
    try {
      const c = JSON.parse(localStorage.getItem(STORAGE_KEYS.presupuestoCache) || '[]');
      if (Array.isArray(c)) S.presupuesto = c;
    } catch {}
  }
}

/* ── Cálculos ── */
export const itemsActivos = () => (S.presupuesto || []).filter(p => p.Activo);

export function venceEnMes(it, mesKey) {
  const n = mesesDe(it);
  if (n === 1) return true;
  if (!it.MesAncla) return false;   // sin ancla no se puede ubicar: solo cuenta como devengado
  const mes = Number(String(mesKey).split('-')[1]);
  return (((mes - it.MesAncla) % n) + n) % n === 0;
}

export const costoFijoMensual = moneda =>
  itemsActivos().filter(p => p.Moneda === moneda).reduce((s, p) => s + importeMensual(p), 0);

export const aPagarEnMes = (mesKey, moneda) =>
  itemsActivos().filter(p => p.Moneda === moneda && venceEnMes(p, mesKey))
                .reduce((s, p) => s + safeNumber(p.Importe), 0);

/* Convierte el presupuesto en pseudo-movimientos para que Comparar lo trate como un mes más.
   modo 'devengado' → importe mensualizado; modo 'caja' → lo que efectivamente vence en mesKey. */
export function presupuestoComoMovimientos(moneda, modo = 'devengado', mesKey = null) {
  const mes = mesKey || localMesStr();
  return itemsActivos()
    .filter(p => p.Moneda === moneda)
    .filter(p => modo === 'devengado' || venceEnMes(p, mes))
    .map(p => ({
      Fecha: null, Centro: p.Centro, Tipo: 'F', Concepto: p.Concepto,
      Metodo: p.Metodo || 'Sin método', Moneda: p.Moneda,
      Importe: modo === 'devengado' ? importeMensual(p) : safeNumber(p.Importe),
      _presupuesto: true
    }));
}

/* ── Detección automática desde el historial ── */
const mediana = arr => {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

function frecuenciaDesdeGaps(meses) {
  if (meses.length < 2) return 'mensual';
  const gaps = [];
  for (let i = 1; i < meses.length; i++) gaps.push(mesIndex(meses[i]) - mesIndex(meses[i - 1]));
  const g = Math.round(mediana(gaps));
  const permitidos = [1, 2, 3, 4, 6, 12];
  const cercano = permitidos.reduce((best, p) => Math.abs(p - g) < Math.abs(best - g) ? p : best, 1);
  return MESES_A_FRECUENCIA[cercano];
}

export function detectarFijos() {
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - (VENTANA_DETECCION - 1), 1);
  const desdeKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const mesActual = localMesStr();

  const grupos = new Map();
  for (const g of S.allData) {
    if (g.Tipo !== 'F' || !g.Fecha) continue;
    const mes = getMesKey(g.Fecha);
    if (mes < desdeKey) continue;
    const moneda = g.Moneda || 'ARS';
    const key = `${g.Concepto}|${g.Centro}|${moneda}`;
    if (!grupos.has(key)) grupos.set(key, { key, concepto: g.Concepto, centro: g.Centro, moneda, movs: [] });
    grupos.get(key).movs.push({ mes, fecha: g.Fecha, importe: safeNumber(g.Importe), metodo: g.Metodo || '' });
  }

  const yaCargados = new Set((S.presupuesto || []).map(claveDe));
  const out = [];
  for (const grp of grupos.values()) {
    if (yaCargados.has(grp.key)) continue;
    grp.movs.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);

    const porMes = new Map();
    for (const m of grp.movs) {
      if (!porMes.has(m.mes)) porMes.set(m.mes, []);
      porMes.get(m.mes).push(m.importe);
    }
    const meses = [...porMes.keys()].sort();
    const ultimo = grp.movs[grp.movs.length - 1];
    const esAnualPrepago = (ultimo.metodo || '').trim().toLowerCase() === METODO_ANUAL;
    /* Una sola aparición no alcanza para hablar de recurrencia, salvo que el método
       declare explícitamente que es un pago anual. */
    if (meses.length < 2 && !esAnualPrepago) continue;

    /* Si la mayoría de los meses tiene varios cargos, el ítem es multi-cargo por
       naturaleza (ej. Apple) y la unidad correcta es el total del mes. Si los
       duplicados son ocasionales, son ruido de calendario (ej. Osde pagado dos
       veces en un mes) y la unidad correcta es un pago individual. */
    const mesesDuplicados = meses.filter(m => porMes.get(m).length > 1).length;
    const multiCargo = mesesDuplicados / meses.length >= 0.5;
    const ultimoMes = meses[meses.length - 1];
    const unidades = multiCargo
      ? meses.map(m => porMes.get(m).reduce((s, v) => s + v, 0))
      : grp.movs.map(m => m.importe);
    const med = mediana(unidades);

    /* El importe sugerido es el último conocido, pero medido sobre un mes "limpio":
       si el último mes tuvo un pago doble, ese monto no representa el costo normal.
       Sin ningún mes limpio, la mediana es la referencia más segura. */
    let importe;
    if (multiCargo) {
      importe = porMes.get(ultimoMes).reduce((s, v) => s + v, 0);
    } else {
      const mesLimpio = [...meses].reverse().find(m => porMes.get(m).length === 1);
      importe = mesLimpio ? porMes.get(mesLimpio)[0] : med;
    }
    const frecuencia = esAnualPrepago ? 'anual' : frecuenciaDesdeGaps(meses);
    const nMeses = FRECUENCIAS[frecuencia].meses;
    /* Un ítem cuyo último pago quedó más de un ciclo atrás probablemente se discontinuó. */
    const antiguedad = mesIndex(mesActual) - mesIndex(ultimoMes);
    const vigente = antiguedad <= nMeses + 1;

    out.push({
      key: grp.key, concepto: grp.concepto, centro: grp.centro, moneda: grp.moneda,
      metodo: ultimo.metodo, importe, mediana: med, frecuencia,
      mesAncla: frecuencia === 'mensual' ? null : Number(ultimoMes.split('-')[1]),
      multiCargo, mesesDuplicados, ocurrencias: meses.length, ultimoMes, vigente, antiguedad,
      variacion: med !== 0 ? (importe - med) / Math.abs(med) * 100 : null,
      incluir: vigente
    });
  }
  out.sort((a, b) => Math.abs(b.importe) / FRECUENCIAS[b.frecuencia].meses
                   - Math.abs(a.importe) / FRECUENCIAS[a.frecuencia].meses);
  return out;
}

/* ── Pendientes del mes (fuente de verdad para la pestaña Carga) ──
   A diferencia de la heurística vieja (mirar los últimos 3 meses), acá un ítem
   solo aparece el mes en que efectivamente vence: un trimestral no molesta los
   otros dos meses, y un anual aparece una vez al año en su mes. */
function clavesCargadasEn(mesKey) {
  const set = new Set();
  for (const g of S.allData) {
    if (g.Fecha && g.Fecha.startsWith(mesKey)) set.add(`${g.Concepto}|${g.Centro}|${g.Moneda || 'ARS'}`);
  }
  return set;
}

function ultimoPagoPorClave() {
  const map = new Map();
  for (const g of S.allData) {
    if (!g.Fecha) continue;
    const k = `${g.Concepto}|${g.Centro}|${g.Moneda || 'ARS'}`;
    const prev = map.get(k);
    if (!prev || g.Fecha > prev.fecha) map.set(k, { fecha: g.Fecha, importe: safeNumber(g.Importe) });
  }
  return map;
}

export function pendientesDelMes(mesKey = localMesStr()) {
  const cargados = clavesCargadasEn(mesKey);
  const ultimo = ultimoPagoPorClave();
  return itemsActivos()
    .filter(p => venceEnMes(p, mesKey) && !cargados.has(claveDe(p)))
    .map(p => {
      const u = ultimo.get(claveDe(p));
      const imp = safeNumber(p.Importe);
      return { ...p, ultimoPago: u ? u.importe : null, ultimaFecha: u ? u.fecha : null,
               variacion: u && u.importe !== 0 ? (imp - u.importe) / Math.abs(u.importe) * 100 : null };
    })
    .sort((a, b) => Math.abs(safeNumber(b.Importe)) - Math.abs(safeNumber(a.Importe)));
}

/* Ítems no mensuales a los que les falta el mes ancla: sin él no se puede saber
   cuándo vencen, así que nunca aparecerían como pendientes. Hay que avisarlo. */
export const itemsSinAncla = () => itemsActivos().filter(p => mesesDe(p) > 1 && !p.MesAncla);

/* Red de seguridad: fijos que el historial muestra como vigentes y todavía no
   están presupuestados. detectarFijos() ya excluye lo que está en el presupuesto. */
let ultimaDeteccionCarga = [];
export function detectadosSinPresupuestar(mesKey = localMesStr()) {
  const cargados = clavesCargadasEn(mesKey);
  ultimaDeteccionCarga = detectarFijos().filter(d => d.vigente && !cargados.has(d.key));
  return ultimaDeteccionCarga;
}

export async function presupuestarDetectado(key) {
  const d = ultimaDeteccionCarga.find(x => x.key === key);
  if (!d) { toastWarn('No se encontró el ítem; recargá los datos'); return false; }
  try {
    const { error } = await sb.from('presupuesto_fijos').insert({
      user_id: S.currentUserId, concepto: d.concepto, centro: d.centro, moneda: d.moneda,
      metodo: d.metodo || null, importe: d.importe, frecuencia: d.frecuencia,
      mes_ancla: FRECUENCIAS[d.frecuencia].meses === 1 ? null : d.mesAncla, activo: true
    });
    if (error) throw error;
    await cargarPresupuesto();
    toast(`"${d.concepto}" agregado al presupuesto`);
    return true;
  } catch (e) {
    console.error('[presupuestarDetectado]', e.message || e);
    toastError('No se pudo agregar al presupuesto');
    return false;
  }
}

/* Avance del mes: cuántos fijos que vencen ya se cargaron y cuánto falta pagar. */
export function avanceFijosDelMes(mesKey = localMesStr()) {
  const cargados = clavesCargadasEn(mesKey);
  const vencen = itemsActivos().filter(p => venceEnMes(p, mesKey));
  const faltan = vencen.filter(p => !cargados.has(claveDe(p)));
  const suma = m => faltan.filter(p => p.Moneda === m).reduce((s, p) => s + safeNumber(p.Importe), 0);
  return { total: vencen.length, hechos: vencen.length - faltan.length,
           faltaARS: suma('ARS'), faltaUSD: suma('USD') };
}

/* ── UI ── */
let detectados = [];

function selectFrecuencia(attr, id, valor, action) {
  return `<select data-change="${action}" ${attr}="${escapeAttr(id)}" class="px-2 py-1 rounded-lg border text-xs" style="border-color:var(--input-border);background:var(--surface-solid);color:var(--text)">`
    + Object.entries(FRECUENCIAS).map(([k, v]) =>
        `<option value="${k}"${k === valor ? ' selected' : ''}>${v.label}</option>`).join('')
    + '</select>';
}

function selectMesAncla(attr, id, valor, action, disabled) {
  return `<select data-change="${action}" ${attr}="${escapeAttr(id)}" ${disabled ? 'disabled' : ''} class="px-2 py-1 rounded-lg border text-xs" style="border-color:var(--input-border);background:var(--surface-solid);color:var(--text)${disabled ? ';opacity:.4' : ''}">`
    + `<option value="">Mes…</option>`
    + NOMBRES_MES.map((n, i) => `<option value="${i + 1}"${Number(valor) === i + 1 ? ' selected' : ''}>${n}</option>`).join('')
    + '</select>';
}

export function renderPresupuesto() {
  renderKpisPresupuesto();
  renderListaPresupuesto();
}

function renderKpisPresupuesto() {
  const mes = localMesStr();
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('presup-fijo-ars', formatImporteSigned(costoFijoMensual('ARS'), 'ARS'));
  set('presup-fijo-usd', formatImporteSigned(costoFijoMensual('USD'), 'USD'));
  set('presup-caja-ars', formatImporteSigned(aPagarEnMes(mes, 'ARS'), 'ARS'));
  set('presup-caja-usd', formatImporteSigned(aPagarEnMes(mes, 'USD'), 'USD'));
  set('presup-caja-mes', formatMesLabel(mes));
  const act = itemsActivos().length, tot = (S.presupuesto || []).length;
  set('presup-items', String(act));
  set('presup-items-sub', tot > act ? `${tot - act} inactivo${tot - act === 1 ? '' : 's'}` : 'ítems activos');
}

function renderListaPresupuesto() {
  const cont = $('presup-lista'); if (!cont) return;
  const items = (S.presupuesto || []).slice()
    .sort((a, b) => Math.abs(importeMensual(b)) - Math.abs(importeMensual(a)));
  if (!items.length) {
    cont.innerHTML = `<p class="text-sm italic" style="color:var(--text4)">Todavía no hay presupuesto. Usá <strong>Detectar desde el historial</strong> para armarlo en un paso.</p>`;
    return;
  }
  cont.innerHTML = items.map(p => {
    const men = importeMensual(p);
    const nMeses = mesesDe(p);
    const sinAncla = nMeses > 1 && !p.MesAncla;
    const monedaTag = p.Moneda === 'USD'
      ? '<span class="ml-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold">U$S</span>' : '';
    return `<div class="flex flex-wrap items-center gap-2 p-3 rounded-lg border" style="border-color:var(--border-solid);background:var(--kpi-bg);${p.Activo ? '' : 'opacity:.5'}">
      <div class="flex-1 min-w-[150px]">
        <div class="font-medium text-sm truncate" style="color:var(--text)">${escapeHtml(p.Concepto)}${monedaTag}</div>
        <div class="text-xs" style="color:var(--text3)">${escapeHtml(p.Centro)}${p.Metodo ? ' · ' + escapeHtml(p.Metodo) : ''}</div>
      </div>
      <input type="text" inputmode="decimal" value="${p.Importe}" data-change="presupEditarImporte" data-id="${escapeAttr(p.ID)}"
        class="w-28 px-2 py-1 rounded-lg border text-xs text-right font-mono" style="border-color:var(--input-border);background:var(--surface-solid);color:var(--text)" title="Importe por ocurrencia">
      ${selectFrecuencia('data-id', p.ID, p.Frecuencia, 'presupEditarFrecuencia')}
      ${selectMesAncla('data-id', p.ID, p.MesAncla, 'presupEditarAncla', nMeses === 1)}
      <div class="w-28 text-right">
        <div class="text-sm font-bold font-mono" style="color:var(--text)">${formatImporteSigned(men, p.Moneda)}</div>
        <div class="text-[10px]" style="color:var(--text3)">por mes${sinAncla ? ' · <span class="text-amber-600">falta mes</span>' : ''}</div>
      </div>
      <button data-action="presupToggleActivo" data-id="${escapeAttr(p.ID)}" class="owner-only w-8 h-8 flex items-center justify-center rounded-lg ${p.Activo ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}" title="${p.Activo ? 'Dar de baja' : 'Reactivar'}"><i class="fas ${p.Activo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i></button>
      <button data-action="presupBorrar" data-id="${escapeAttr(p.ID)}" data-concepto="${escapeAttr(p.Concepto)}" class="owner-only w-8 h-8 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50" title="Eliminar"><i class="fas fa-trash text-xs"></i></button>
    </div>`;
  }).join('');
}

/* ── Panel de detección ── */
export function presupDetectar() {
  detectados = detectarFijos();
  const panel = $('presup-deteccion'), cont = $('presup-deteccion-lista');
  if (!panel || !cont) return;
  panel.classList.remove('hidden');
  if (!detectados.length) {
    cont.innerHTML = `<p class="text-sm italic" style="color:var(--text4)">No se encontraron fijos nuevos en los últimos ${VENTANA_DETECCION} meses. Todo lo recurrente ya está en el presupuesto.</p>`;
    $('presup-deteccion-resumen').textContent = '';
    return;
  }
  renderDeteccion();
}

function renderDeteccion() {
  const cont = $('presup-deteccion-lista'); if (!cont) return;
  cont.innerHTML = detectados.map((d, i) => {
    const men = d.importe / FRECUENCIAS[d.frecuencia].meses;
    const monedaTag = d.moneda === 'USD'
      ? '<span class="ml-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold">U$S</span>' : '';
    const notas = [];
    if (!d.vigente) notas.push(`<span class="text-amber-600">sin pagos hace ${d.antiguedad} ${d.antiguedad === 1 ? 'mes' : 'meses'}</span>`);
    if (d.multiCargo) notas.push('varios cargos por mes → se suma el mes');
    else if (d.mesesDuplicados > 0) notas.push(`${d.mesesDuplicados} mes(es) con pago doble → se usa el pago individual`);
    if (d.variacion !== null && Math.abs(d.variacion) >= 15)
      notas.push(`${d.variacion > 0 ? '↑' : '↓'}${Math.abs(d.variacion).toFixed(0)}% vs. mediana ${formatImporte(d.mediana, d.moneda)}`);
    return `<div class="flex flex-wrap items-center gap-2 p-3 rounded-lg border" style="border-color:var(--border-solid);background:var(--kpi-bg);${d.incluir ? '' : 'opacity:.45'}">
      <input type="checkbox" data-change="presupToggleDetectado" data-idx="${i}" ${d.incluir ? 'checked' : ''} class="w-4 h-4 flex-shrink-0 accent-blue-600">
      <div class="flex-1 min-w-[150px]">
        <div class="font-medium text-sm truncate" style="color:var(--text)">${escapeHtml(d.concepto)}${monedaTag}</div>
        <div class="text-xs" style="color:var(--text3)">${escapeHtml(d.centro)} · ${d.ocurrencias} ocurrencia${d.ocurrencias === 1 ? '' : 's'} · último ${formatMesLabel(d.ultimoMes)}</div>
        ${notas.length ? `<div class="text-[11px] mt-0.5" style="color:var(--text3)">${notas.join(' · ')}</div>` : ''}
      </div>
      <input type="text" inputmode="decimal" value="${d.importe}" data-change="presupEditarDetectadoImporte" data-idx="${i}"
        class="w-28 px-2 py-1 rounded-lg border text-xs text-right font-mono" style="border-color:var(--input-border);background:var(--surface-solid);color:var(--text)">
      ${selectFrecuencia('data-idx', String(i), d.frecuencia, 'presupEditarDetectadoFrecuencia')}
      ${selectMesAncla('data-idx', String(i), d.mesAncla, 'presupEditarDetectadoAncla', FRECUENCIAS[d.frecuencia].meses === 1)}
      <div class="w-28 text-right text-sm font-bold font-mono" style="color:var(--text)">${formatImporteSigned(men, d.moneda)}<div class="text-[10px] font-normal" style="color:var(--text3)">por mes</div></div>
    </div>`;
  }).join('');
  const sel = detectados.filter(d => d.incluir);
  const tot = { ARS: 0, USD: 0 };
  for (const d of sel) tot[d.moneda] += d.importe / FRECUENCIAS[d.frecuencia].meses;
  const totHtml = ['ARS', 'USD'].filter(m => tot[m] !== 0)
    .map(m => `<strong>${formatImporteSigned(tot[m], m)}</strong>`).join(' + ');
  $('presup-deteccion-resumen').innerHTML =
    `<strong>${sel.length}</strong> de ${detectados.length} seleccionados`
    + (totHtml ? ` · suman ${totHtml} por mes` : '');
}

export function presupToggleDetectado(idx) {
  const d = detectados[Number(idx)]; if (!d) return;
  d.incluir = !d.incluir;
  renderDeteccion();
}
export function presupTodosDetectados(valor) {
  detectados.forEach(d => { d.incluir = valor; });
  renderDeteccion();
}
export function presupEditarDetectado(idx, campo, valor) {
  const d = detectados[Number(idx)]; if (!d) return;
  if (campo === 'importe') d.importe = safeNumber(valor);
  else if (campo === 'frecuencia') {
    d.frecuencia = FRECUENCIAS[valor] ? valor : 'mensual';
    if (FRECUENCIAS[d.frecuencia].meses === 1) d.mesAncla = null;
    else if (!d.mesAncla) d.mesAncla = Number(d.ultimoMes.split('-')[1]);
  } else if (campo === 'ancla') d.mesAncla = valor ? Number(valor) : null;
  renderDeteccion();
}

export function presupCancelarDeteccion() {
  detectados = [];
  $('presup-deteccion')?.classList.add('hidden');
}

export async function presupConfirmarDeteccion() {
  const sel = detectados.filter(d => d.incluir);
  if (!sel.length) { toastWarn('No hay ítems seleccionados'); return; }
  if (!await modalConfirm(`Se van a agregar ${sel.length} ítems al presupuesto. ¿Confirmás?`)) return;
  showLoading(true);
  try {
    const filas = sel.map(d => ({
      user_id: S.currentUserId, concepto: d.concepto, centro: d.centro, moneda: d.moneda,
      metodo: d.metodo || null, importe: d.importe, frecuencia: d.frecuencia,
      mes_ancla: FRECUENCIAS[d.frecuencia].meses === 1 ? null : d.mesAncla, activo: true
    }));
    const { error } = await sb.from('presupuesto_fijos').insert(filas);
    if (error) throw error;
    await cargarPresupuesto();
    presupCancelarDeteccion();
    renderPresupuesto();
    toast(`${sel.length} ítems agregados al presupuesto`);
  } catch (e) {
    console.error('[presupConfirmarDeteccion]', e.message || e);
    toastError('No se pudo guardar el presupuesto: ' + (e.message || e));
  } finally { showLoading(false); }
}

/* ── Edición de ítems existentes ── */
async function actualizarItem(id, patch) {
  const it = (S.presupuesto || []).find(p => p.ID === id); if (!it) return;
  try {
    const { error } = await sb.from('presupuesto_fijos').update(patch).eq('id', id);
    if (error) throw error;
    await cargarPresupuesto();
    renderPresupuesto();
  } catch (e) {
    console.error('[actualizarItem]', e.message || e);
    toastError('No se pudo guardar el cambio');
  }
}

export function presupEditarImporte(id, valor) { actualizarItem(id, { importe: safeNumber(valor) }); }
export function presupEditarFrecuencia(id, valor) {
  const it = (S.presupuesto || []).find(p => p.ID === id); if (!it) return;
  const frec = FRECUENCIAS[valor] ? valor : 'mensual';
  const patch = { frecuencia: frec };
  if (FRECUENCIAS[frec].meses === 1) patch.mes_ancla = null;
  else if (!it.MesAncla) patch.mes_ancla = new Date().getMonth() + 1;
  actualizarItem(id, patch);
}
export function presupEditarAncla(id, valor) { actualizarItem(id, { mes_ancla: valor ? Number(valor) : null }); }

export function presupToggleActivo(id) {
  const it = (S.presupuesto || []).find(p => p.ID === id); if (!it) return;
  actualizarItem(id, { activo: !it.Activo });
}

export async function presupBorrar(id, concepto) {
  if (!await modalConfirm(`¿Eliminar "${concepto}" del presupuesto? No afecta los gastos ya cargados.`)) return;
  try {
    const { error } = await sb.from('presupuesto_fijos').delete().eq('id', id);
    if (error) throw error;
    await cargarPresupuesto();
    renderPresupuesto();
    toast('Ítem eliminado');
  } catch (e) {
    console.error('[presupBorrar]', e.message || e);
    toastError('No se pudo eliminar');
  }
}

/* ── Alta manual ── */
export function presupNuevoToggle() {
  const f = $('presup-nuevo'); if (!f) return;
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) $('presup-nuevo-concepto')?.focus();
}

export async function presupGuardarNuevo() {
  const concepto = ($('presup-nuevo-concepto')?.value || '').trim();
  const centro = ($('presup-nuevo-centro')?.value || '').trim();
  const importe = safeNumber($('presup-nuevo-importe')?.value);
  const moneda = $('presup-nuevo-moneda')?.value === 'USD' ? 'USD' : 'ARS';
  const frecuencia = $('presup-nuevo-frecuencia')?.value || 'mensual';
  const ancla = $('presup-nuevo-ancla')?.value;
  if (!concepto || !centro) { toastWarn('Completá concepto y centro'); return; }
  if (!importe) { toastWarn('Ingresá un importe'); return; }
  try {
    const { error } = await sb.from('presupuesto_fijos').insert({
      user_id: S.currentUserId, concepto, centro, moneda, importe, frecuencia,
      mes_ancla: FRECUENCIAS[frecuencia].meses === 1 ? null : (ancla ? Number(ancla) : new Date().getMonth() + 1),
      activo: true
    });
    if (error) throw error;
    await cargarPresupuesto();
    ['presup-nuevo-concepto', 'presup-nuevo-centro', 'presup-nuevo-importe'].forEach(id => { if ($(id)) $(id).value = ''; });
    $('presup-nuevo')?.classList.add('hidden');
    renderPresupuesto();
    toast('Ítem agregado');
  } catch (e) {
    console.error('[presupGuardarNuevo]', e.message || e);
    toastError(String(e.message || e).includes('unico')
      ? 'Ya existe un ítem con ese concepto, centro y moneda'
      : 'No se pudo agregar');
  }
}

registry.renderPresupuesto = renderPresupuesto;
