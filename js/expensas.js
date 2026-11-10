/* ========================================
   EXPENSAS — Boletas del consorcio: total por mes, expensa por lote,
   energía ($/kWh) y agua
   expensas.js

   Cada boleta es una fila de la tabla `expensas` (UF + período) con sus
   conceptos tal cual vienen en el PDF. Acá se clasifican:
   - ord:   EXPENSAS / EXPENSAS ORDINARIAS, más los rubros de espacios
            comunes y reintegros (hasta nov-2025 venían aparte)
   - ext:   EXPENSAS EXTRAORDINARIA
   - luz / agua: CONSUMO KW / CONSUMO AGUA, con lectura del medidor
   - otros: residuos, deportes, multas, generador, vigilancia…
======================================== */
import { $, S, sb, STORAGE_KEYS } from './state.js';
import { destroyChart, escapeHtml, escapeAttr, formatImporte, formatImporteSigned, formatMesLabel, showLoading } from './utils.js';
import { toast, toastError, toastWarn, modalConfirm } from './ui.js';
import { leerPdf } from './importar/parsers/fuentes.js';
import { parsearBoleta } from './expensas/parser.js';

const COLORES_UF = ['#2563eb', '#ea580c', '#059669', '#9333ea', '#db2777', '#0891b2'];
/* La app trunca los centavos al formatear; acá se redondea para que coincida con la boleta. */
const plata = v => formatImporte(Math.round(v));
const plataSigno = v => formatImporteSigned(Math.round(v));
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = m => `${MESES_CORTOS[Number(m.slice(5, 7)) - 1]}-${m.slice(2, 4)}`;
const pct = v => { const r = Math.round(v * 100); return `${r > 0 ? '+' : ''}${r === 0 ? 0 : r}%`; };
const pctClase = v => (v > 0.005 ? 'comp-up' : v < -0.005 ? 'comp-down' : 'comp-neutral');

let cargadas = false;
let ufElegida = null;
let resultadoSubida = [];

/* ── Carga ── */
export async function cargarExpensas() {
  try {
    const { data, error } = await sb.from('expensas').select('*').order('periodo');
    if (error) throw error;
    S.expensas = data || [];
    cargadas = true;
    try { localStorage.setItem(STORAGE_KEYS.expensasCache, JSON.stringify(S.expensas)); } catch {}
  } catch (e) {
    console.error('[cargarExpensas]', e.message || e);
    try {
      const c = JSON.parse(localStorage.getItem(STORAGE_KEYS.expensasCache) || '[]');
      if (Array.isArray(c)) S.expensas = c;
    } catch {}
  }
}

/* ── Clasificación ── */
function categoria(concepto) {
  const n = String(concepto || '').toUpperCase().trim();
  if (/EXTRAORDINARIA/.test(n)) return 'ext';
  if (/^EXPENSAS( ORDINARIAS)?$/.test(n) || /ESP(\.|ACIOS)?\s*COMUNES|REINTEGRO/.test(n)) return 'ord';
  if (/CONSUMO\s+KW/.test(n)) return 'luz';
  if (/CONSUMO\s+AGUA/.test(n)) return 'agua';
  return 'otros';
}

/* Una boleta por UF y mes. Si dos miembros del hogar subieron la misma, queda la más nueva. */
function boletas() {
  const porClave = new Map();
  for (const r of S.expensas || []) {
    const k = `${r.uf}|${String(r.periodo).slice(0, 7)}`;
    const prev = porClave.get(k);
    if (!prev || String(r.updated_at) > String(prev.updated_at)) porClave.set(k, r);
  }
  return [...porClave.values()].map(r => {
    const b = { id: r.id, propia: r.user_id === S.currentUserId, uf: r.uf, mes: String(r.periodo).slice(0, 7),
      total: Number(r.total), saldo: Number(r.saldo_anterior) || 0, vencimiento: r.vencimiento, archivo: r.archivo,
      ord: 0, ext: 0, luz: null, agua: null, otros: [] };
    for (const c of r.conceptos || []) {
      const cat = categoria(c.concepto), imp = Number(c.importe) || 0;
      if (cat === 'ord') b.ord += imp;
      else if (cat === 'ext') b.ext += imp;
      else if ((cat === 'luz' || cat === 'agua') && c.lectura) b[cat] = { importe: imp, ...c.lectura };
      else b.otros.push({ concepto: c.concepto, importe: imp });
    }
    return b;
  }).sort((a, b) => a.mes.localeCompare(b.mes) || a.uf.localeCompare(b.uf, 'es', { numeric: true }));
}

/* ── Subida de boletas ── */
export async function subirBoletas(input) {
  const archivos = [...(input?.files || [])];
  if (input) input.value = '';
  if (!archivos.length) return;
  if (!S.currentUserId) { toastWarn('Iniciá sesión para subir boletas'); return; }

  resultadoSubida = [];
  showLoading(true);
  if (!cargadas) await cargarExpensas();
  const existentes = new Map((S.expensas || []).filter(r => r.user_id === S.currentUserId)
    .map(r => [`${r.uf}|${String(r.periodo).slice(0, 7)}`, r]));

  for (const archivo of archivos) {
    try {
      if (!/\.pdf$/i.test(archivo.name)) throw new Error('No es un PDF.');
      const { lineas, tieneTexto } = await leerPdf(await archivo.arrayBuffer());
      if (!tieneTexto) throw new Error('El PDF no tiene texto: no parece una boleta del consorcio.');
      const b = parsearBoleta(lineas);
      const clave = `${b.uf}|${b.periodo}`;
      const previa = existentes.get(clave);
      if (previa && Number(previa.total) === b.total && JSON.stringify(previa.conceptos) === JSON.stringify(b.conceptos)) {
        resultadoSubida.push({ archivo: archivo.name, estado: 'igual', uf: b.uf, mes: b.periodo, total: b.total });
        continue;
      }
      const fila = { user_id: S.currentUserId, uf: b.uf, periodo: `${b.periodo}-01`, vencimiento: b.vencimiento,
        saldo_anterior: b.saldoAnterior, total: b.total, conceptos: b.conceptos, archivo: archivo.name,
        updated_at: new Date().toISOString() };
      const { error } = await sb.from('expensas').upsert(fila, { onConflict: 'user_id,uf,periodo' });
      if (error) throw new Error(error.message);
      existentes.set(clave, fila);
      resultadoSubida.push({ archivo: archivo.name, estado: previa ? 'reemplazada' : 'nueva', uf: b.uf, mes: b.periodo, total: b.total });
    } catch (e) {
      resultadoSubida.push({ archivo: archivo.name, estado: 'error', error: e.message || String(e) });
    }
  }

  await cargarExpensas();
  showLoading(false);
  const ok = resultadoSubida.filter(r => r.estado === 'nueva' || r.estado === 'reemplazada').length;
  const errores = resultadoSubida.filter(r => r.estado === 'error').length;
  if (errores) toastError(`${errores} archivo${errores > 1 ? 's' : ''} con error`);
  else if (ok) toast(`${ok} boleta${ok > 1 ? 's' : ''} guardada${ok > 1 ? 's' : ''}`);
  else toast('Esas boletas ya estaban cargadas');
  renderExpensas();
}

export async function borrarBoleta(id) {
  const r = (S.expensas || []).find(x => x.id === id);
  if (!r) return;
  const ok = await modalConfirm(`¿Borrar la boleta de la UF ${r.uf} de ${formatMesLabel(String(r.periodo).slice(0, 7))}? Se puede volver a subir el PDF.`);
  if (!ok) return;
  const { error } = await sb.from('expensas').delete().eq('id', id);
  if (error) { toastError('No se pudo borrar: ' + error.message); return; }
  await cargarExpensas();
  toast('Boleta borrada');
  renderExpensas();
}

export function elegirUf(uf) {
  ufElegida = uf;
  renderExpensas();
}

/* ── Render ── */
export async function renderExpensas() {
  const cont = $('expensas-contenido');
  if (!cont) return;
  if (!cargadas && S.currentUserId) {
    cont.innerHTML = '<p class="text-sm italic" style="color:var(--text3)">Cargando boletas…</p>';
    await cargarExpensas();
  }
  renderResultadoSubida();

  const bs = boletas();
  if (!bs.length) {
    ['expTotal', 'expLote', 'expKwh', 'expPkwh'].forEach(destroyChart);
    cont.innerHTML = `<div class="glass-panel rounded-2xl p-8 text-center">
      <i class="fas fa-building text-4xl mb-3" style="color:var(--text4)"></i>
      <p class="font-semibold">Todavía no hay boletas cargadas</p>
      <p class="text-sm mt-1" style="color:var(--text3)">Subí los PDF de las expensas del consorcio con el botón <strong>Subir boletas</strong>. Podés elegir varios a la vez.</p>
    </div>`;
    return;
  }

  const ufs = [...new Set(bs.map(b => b.uf))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const meses = [...new Set(bs.map(b => b.mes))].sort();
  const de = (uf, mes) => bs.find(b => b.uf === uf && b.mes === mes);
  if (!ufs.includes(ufElegida)) ufElegida = ufs.find(u => bs.some(b => b.uf === u && b.luz)) || ufs[0];

  /* Totales por mes: un mes al que le falta la boleta de alguna UF queda marcado. */
  const totales = meses.map(m => {
    const porUf = ufs.map(u => de(u, m)?.total ?? null);
    return { mes: m, porUf, total: porUf.reduce((s, v) => s + (v || 0), 0), completo: porUf.every(v => v !== null) };
  });
  const completos = totales.filter(t => t.completo);
  const suma = totales.reduce((s, t) => s + t.total, 0);
  const sumaUf = ufs.map((_, i) => totales.reduce((s, t) => s + (t.porUf[i] || 0), 0));
  /* Último mes, promedio y comparación usan solo meses con la boleta de todas las UF:
     un mes a medio cargar daría una baja falsa. */
  const ultimo = completos[completos.length - 1];
  const anterior = completos[completos.length - 2];
  const sumaCompletos = completos.reduce((s, t) => s + t.total, 0);
  const sumaUfCompletos = ufs.map((_, i) => completos.reduce((s, t) => s + t.porUf[i], 0));
  const maximo = completos.reduce((m, t) => (!m || t.total > m.total ? t : m), null);
  const desglose = vals => ufs.map((u, i) => `UF ${escapeHtml(u)} ${plata(vals[i])}`).join('<br>');

  /* Serie de la UF elegida */
  const serie = meses.map(m => de(ufElegida, m)).filter(Boolean);
  const conLuz = serie.filter(b => b.luz);
  const conAgua = serie.filter(b => b.agua);

  const kpi = (color, titulo, valor, sub) => `<div class="kpi-fit rounded-2xl p-5 bg-gradient-to-br ${color} text-white shadow-md">
    <p class="text-xs opacity-80">${titulo}</p><h3 class="text-xl md:text-2xl font-bold">${valor}</h3><p class="text-xs opacity-80 mt-1 leading-snug">${sub}</p></div>`;

  const selectorUf = ufs.length > 1 ? `<label class="text-sm flex items-center gap-2" style="color:var(--text3)">UF
      <select data-change="elegirUfExpensas" class="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium">
        ${ufs.map(u => `<option value="${escapeAttr(u)}"${u === ufElegida ? ' selected' : ''}>${escapeHtml(u)}</option>`).join('')}
      </select></label>` : '';

  const filaVar = (a, b) => (a == null || b == null || !b) ? '<td class="py-2 px-3"></td>'
    : `<td class="py-2 px-3 text-right ${pctClase(a / b - 1)}">${pct(a / b - 1)}</td>`;
  const th = (t, izq) => `<th class="py-2 px-3 ${izq ? 'text-left' : 'text-right'} font-semibold whitespace-nowrap">${t}</th>`;
  const td = (v, extra = '') => `<td class="py-2 px-3 text-right font-mono whitespace-nowrap ${extra}">${v}</td>`;
  const tabla = (cabecera, filas, pie = '') => `<div class="overflow-x-auto"><table class="w-full text-sm">
    <thead class="bg-slate-50 border-b border-slate-200"><tr>${cabecera}</tr></thead>
    <tbody class="divide-y divide-slate-100">${filas}</tbody>${pie}</table></div>`;

  const extras = bs.filter(b => b.otros.some(o => Math.abs(o.importe) > 0));
  const notaOtros = [...new Set(extras.flatMap(b => b.otros.map(o => o.concepto)))];

  cont.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${kpi('from-blue-600 to-blue-700', `Total pagado en ${totales.length} meses`, plata(suma), desglose(sumaUf))}
      ${kpi('from-emerald-500 to-emerald-600', 'Promedio por mes', completos.length ? plata(sumaCompletos / completos.length) : '—',
        completos.length ? desglose(sumaUfCompletos.map(v => v / completos.length)) : '')}
      ${kpi('from-indigo-600 to-indigo-700', ultimo ? `Último mes completo, ${mesCorto(ultimo.mes)}` : 'Último mes completo', ultimo ? plata(ultimo.total) : '—',
        anterior ? `${pct(ultimo.total / anterior.total - 1)} vs ${mesCorto(anterior.mes)}` : '')}
      ${kpi('from-amber-500 to-amber-600', maximo ? `Mes más caro, ${mesCorto(maximo.mes)}` : 'Mes más caro', maximo ? plata(maximo.total) : '—',
        maximo ? desglose(maximo.porUf) : '')}
    </div>

    <div class="glass-panel rounded-2xl p-6">
      <h3 class="font-bold mb-1">Cuánto pago por mes</h3>
      <p class="text-xs mb-4" style="color:var(--text3)">Total del 1° vencimiento de cada boleta, apilado por UF.</p>
      <div class="relative" style="height:300px"><canvas id="chart-exp-total"></canvas></div>
      <div class="mt-4">${tabla(
        th('Período', true) + ufs.map(u => th('UF ' + escapeHtml(u))).join('') + th('Total') + th('Var.'),
        totales.map((t, i) => `<tr${t.completo ? '' : ' style="color:var(--text3)"'}><td class="py-2 px-3 font-medium whitespace-nowrap">${formatMesLabel(t.mes)}${t.completo ? '' : ' <span class="text-xs">(incompleto)</span>'}</td>
          ${t.porUf.map(v => td(v == null ? '—' : plata(v))).join('')}${td(plata(t.total), 'font-bold')}
          ${t.completo && totales[i - 1]?.completo ? filaVar(t.total, totales[i - 1].total) : '<td></td>'}</tr>`).join(''),
        `<tfoot class="bg-slate-50 border-t-2 border-slate-300 font-bold"><tr><td class="py-2 px-3">Total</td>${sumaUf.map(v => td(plata(v))).join('')}${td(plata(suma))}<td></td></tr></tfoot>`)}</div>
      ${notaOtros.length ? `<p class="text-xs mt-3" style="color:var(--text3)">Además de expensas, luz y agua, las boletas traen: ${notaOtros.map(escapeHtml).join(', ').toLowerCase()}.</p>` : ''}
    </div>

    <div class="glass-panel rounded-2xl p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 class="font-bold">Expensa de la UF ${escapeHtml(ufElegida)}</h3>${selectorUf}
      </div>
      <p class="text-xs mb-4" style="color:var(--text3)">Ordinarias y extraordinarias. Los rubros de espacios comunes y los reintegros, que hasta nov-2025 venían aparte, se suman a las ordinarias.</p>
      <div class="relative" style="height:260px"><canvas id="chart-exp-lote"></canvas></div>
      <div class="mt-4">${tabla(th('Período', true) + th('Ordinarias') + th('Extraord.') + th('Expensa') + th('Var.'),
        serie.map((b, i) => `<tr><td class="py-2 px-3 font-medium whitespace-nowrap">${formatMesLabel(b.mes)}</td>${td(plataSigno(b.ord))}${td(plata(b.ext))}${td(plata(b.ord + b.ext), 'font-bold')}${filaVar(b.ord + b.ext, serie[i - 1] ? serie[i - 1].ord + serie[i - 1].ext : null)}</tr>`).join(''))}</div>
    </div>

    ${conLuz.length ? `<div class="glass-panel rounded-2xl p-6">
      <h3 class="font-bold mb-4">Energía de la UF ${escapeHtml(ufElegida)}</h3>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div><p class="text-sm font-semibold mb-2" style="color:var(--text2)">Consumo mensual (kWh)</p><div class="relative" style="height:230px"><canvas id="chart-exp-kwh"></canvas></div></div>
        <div><p class="text-sm font-semibold mb-2" style="color:var(--text2)">Costo por unidad ($ / kWh)</p><div class="relative" style="height:230px"><canvas id="chart-exp-pkwh"></canvas></div></div>
      </div>
      <div class="mt-4">${tabla(th('Período', true) + th('Lect. ant.') + th('Lect. act.') + th('kWh') + th('Importe') + th('$ / kWh') + th('Var.'),
        conLuz.map((b, i) => `<tr><td class="py-2 px-3 font-medium whitespace-nowrap">${formatMesLabel(b.mes)}</td>${td(nf0.format(b.luz.ant))}${td(nf0.format(b.luz.act))}${td(nf0.format(b.luz.consumo))}${td(plata(b.luz.importe))}${td('$' + nf2.format(b.luz.importe / b.luz.consumo))}${i ? filaVar(b.luz.importe / b.luz.consumo, conLuz[i - 1].luz.importe / conLuz[i - 1].luz.consumo) : '<td></td>'}</tr>`).join(''))}</div>
    </div>` : ''}

    ${conAgua.length ? `<div class="glass-panel rounded-2xl p-6">
      <h3 class="font-bold mb-1">Agua de la UF ${escapeHtml(ufElegida)}</h3>
      <p class="text-xs mb-4" style="color:var(--text3)">Se factura cada dos meses.</p>
      ${tabla(th('Período', true) + th('Lect. ant.') + th('Lect. act.') + th('m³') + th('Importe') + th('$ / m³'),
        conAgua.map(b => `<tr><td class="py-2 px-3 font-medium whitespace-nowrap">${formatMesLabel(b.mes)}</td>${td(nf0.format(b.agua.ant))}${td(nf0.format(b.agua.act))}${td(nf0.format(b.agua.consumo))}${td(plata(b.agua.importe))}${td('$' + nf2.format(b.agua.importe / b.agua.consumo))}</tr>`).join(''))}
    </div>` : ''}

    <details class="glass-panel rounded-2xl p-6">
      <summary class="font-bold cursor-pointer">Boletas cargadas (${bs.length})</summary>
      <div class="mt-4">${tabla(th('Período', true) + th('UF') + th('Vence') + th('Total') + th('Archivo', true) + '<th class="owner-only"></th>',
        [...bs].reverse().map(b => `<tr><td class="py-2 px-3 font-medium whitespace-nowrap">${formatMesLabel(b.mes)}</td>${td(escapeHtml(b.uf))}${td(b.vencimiento ? b.vencimiento.split('-').reverse().join('/') : '—')}${td(plata(b.total))}
          <td class="py-2 px-3 text-xs truncate max-w-[14rem]" style="color:var(--text3)">${escapeHtml(b.archivo || '')}</td>
          <td class="py-2 px-3 text-right owner-only">${b.propia ? `<button type="button" data-action="borrarBoleta" data-id="${escapeAttr(b.id)}" class="text-red-500 hover:text-red-700" title="Borrar boleta"><i class="fas fa-trash"></i></button>` : ''}</td></tr>`).join(''))}</div>
    </details>`;

  renderGraficos({ ufs, meses, totales, serie, conLuz });
}

function renderGraficos({ ufs, meses, totales, serie, conLuz }) {
  if (typeof Chart === 'undefined') return;
  const pesosM = v => '$' + (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M';
  const ejeX = { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } };
  const tooltipPesos = { callbacks: { label: ctx => `${ctx.dataset.label}: ${plata(ctx.parsed.y)}` } };

  destroyChart('expTotal');
  S.charts.expTotal = new Chart($('chart-exp-total'), {
    type: 'bar',
    data: { labels: meses.map(mesCorto), datasets: ufs.map((u, i) => ({
      label: `UF ${u}`, data: totales.map(t => t.porUf[i]), backgroundColor: COLORES_UF[i % COLORES_UF.length],
      borderRadius: 4, maxBarThickness: 42, stack: 'total' })) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: tooltipPesos.callbacks.label,
          footer: items => `Total: ${plata(items.reduce((s, x) => s + (x.parsed.y || 0), 0))}` } } },
      scales: { x: { ...ejeX, stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: pesosM } } } }
  });

  destroyChart('expLote');
  S.charts.expLote = new Chart($('chart-exp-lote'), {
    type: 'bar',
    data: { labels: serie.map(b => mesCorto(b.mes)), datasets: [
      { label: 'Ordinarias', data: serie.map(b => b.ord), backgroundColor: '#2563eb', borderRadius: 4, maxBarThickness: 42 },
      { label: 'Extraordinarias', data: serie.map(b => b.ext), backgroundColor: '#ea580c', borderRadius: 4, maxBarThickness: 42 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: tooltipPesos.callbacks.label,
          footer: items => `Expensa: ${plata(items.reduce((s, x) => s + (x.parsed.y || 0), 0))}` } } },
      scales: { x: { ...ejeX, stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => '$' + nf0.format(v / 1000) + 'k' } } } }
  });

  destroyChart('expKwh');
  destroyChart('expPkwh');
  if (!conLuz.length) return;
  S.charts.expKwh = new Chart($('chart-exp-kwh'), {
    type: 'bar',
    data: { labels: conLuz.map(b => mesCorto(b.mes)), datasets: [{ label: 'kWh', data: conLuz.map(b => b.luz.consumo),
      backgroundColor: '#2563eb', borderRadius: 4, maxBarThickness: 36 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: ctx => `${nf0.format(ctx.parsed.y)} kWh · ${plata(conLuz[ctx.dataIndex].luz.importe)}` } } },
      scales: { x: ejeX, y: { beginAtZero: true, ticks: { callback: v => nf0.format(v) } } } }
  });
  S.charts.expPkwh = new Chart($('chart-exp-pkwh'), {
    type: 'line',
    data: { labels: conLuz.map(b => mesCorto(b.mes)), datasets: [{ label: '$ / kWh', data: conLuz.map(b => b.luz.importe / b.luz.consumo),
      borderColor: '#2563eb', backgroundColor: '#2563eb', borderWidth: 2, pointRadius: 3, tension: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: ctx => `$${nf2.format(ctx.parsed.y)} por kWh` } } },
      scales: { x: ejeX, y: { ticks: { callback: v => '$' + nf0.format(v) } } } }
  });
}

function renderResultadoSubida() {
  const caja = $('expensas-resultado');
  if (!caja) return;
  caja.classList.toggle('hidden', !resultadoSubida.length);
  const icono = { nueva: 'fa-check text-emerald-600', reemplazada: 'fa-rotate text-blue-600', igual: 'fa-equals', error: 'fa-triangle-exclamation text-red-600' };
  const texto = r => r.estado === 'error' ? escapeHtml(r.error)
    : `UF ${escapeHtml(r.uf)} · ${formatMesLabel(r.mes)} · ${plata(r.total)} — ${{ nueva: 'guardada', reemplazada: 'reemplazó la que estaba', igual: 'ya estaba cargada' }[r.estado]}`;
  const fila = r => `<div class="flex items-start gap-2 text-sm py-1">
      <i class="fas ${icono[r.estado]} mt-0.5" style="${r.estado === 'igual' ? 'color:var(--text4)' : ''}"></i>
      <div class="min-w-0"><span class="font-medium break-all">${escapeHtml(r.archivo)}</span><div class="text-xs" style="color:var(--text3)">${texto(r)}</div></div></div>`;
  const cuenta = e => resultadoSubida.filter(r => r.estado === e).length;
  const partes = [['nueva', 'guardada', 'guardadas'], ['reemplazada', 'reemplazada', 'reemplazadas'], ['igual', 'ya estaba', 'ya estaban'], ['error', 'con error', 'con error']]
    .map(([e, uno, varios]) => [cuenta(e), uno, varios]).filter(([n]) => n).map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`);
  const errores = resultadoSubida.filter(r => r.estado === 'error');
  caja.innerHTML = `<div class="flex items-center justify-between gap-3">
      <p class="text-sm font-semibold">${partes.join(' · ')}</p>
      <button type="button" data-action="cerrarResultadoExpensas" class="text-sm" style="color:var(--text3)" aria-label="Cerrar"><i class="fas fa-times"></i></button>
    </div>
    ${errores.map(fila).join('')}
    <details class="mt-1"><summary class="text-xs cursor-pointer" style="color:var(--text3)">Ver cada archivo</summary>${resultadoSubida.map(fila).join('')}</details>`;
}

export function cerrarResultadoSubida() {
  resultadoSubida = [];
  renderResultadoSubida();
}

export function resetExpensas() {
  cargadas = false;
  ufElegida = null;
  resultadoSubida = [];
  S.expensas = [];
}
