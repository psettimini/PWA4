/* ========================================
   DASHBOARD — KPIs y Charts
   dashboard.js
======================================== */
import { $, S } from './state.js';
import { safeNumber, formatearNumero, formatImporte, localMesStr, getMesKey, uniqueSorted, destroyChart, escapeHtml, escapeAttr, aggregateBy } from './utils.js';

function computeStats(moneda) {
  const data = S.allData.filter(g => (g.Moneda || 'ARS') === moneda);
  let total = 0, fijos = 0;
  const porMes = Object.create(null), porCentro = Object.create(null);
  const mesActualKey = localMesStr();
  let totalMesActual = 0, movimientosMesActual = 0;
  for (const g of data) {
    const imp = safeNumber(g.Importe); total += imp;
    if (g.Tipo === 'F') fijos += imp;
    const m = getMesKey(g.Fecha) || '?'; porMes[m] = (porMes[m] || 0) + imp;
    if (m === mesActualKey) { totalMesActual += imp; movimientosMesActual++; }
    const c = g.Centro || '?'; porCentro[c] = (porCentro[c] || 0) + imp;
  }
  const nm = Object.keys(porMes).length || 1;
  return {
    moneda, total, fijos, porMes, porCentro, data,
    mesActual: totalMesActual, promedio: total / nm,
    fijosPct: total > 0 ? Math.round(fijos / total * 100) : 0,
    movimientos: movimientosMesActual,
    ticketPromedio: movimientosMesActual > 0 ? totalMesActual / movimientosMesActual : 0
  };
}

function setKpi(idAr, idUsd, ars, usd, formatter) {
  $(idAr).textContent = formatter(ars);
  if ($(idUsd)) $(idUsd).textContent = formatter(usd);
}

export function renderDashboard() {
  const ars = computeStats('ARS');
  const usd = computeStats('USD');

  $('dash-mes-actual').textContent = formatImporte(ars.mesActual, 'ARS');
  $('dash-mes-actual-usd').textContent = formatImporte(usd.mesActual, 'USD');
  $('dash-promedio').textContent = formatImporte(ars.promedio, 'ARS');
  $('dash-promedio-usd').textContent = formatImporte(usd.promedio, 'USD');
  $('dash-fijos').textContent = ars.fijosPct + '%';
  $('dash-fijos-usd').textContent = usd.fijosPct + '%';
  $('dash-movimientos').textContent = ars.movimientos;
  $('dash-movimientos-usd').textContent = usd.movimientos;
  $('dash-ticket-promedio').textContent = formatImporte(ars.ticketPromedio, 'ARS');
  $('dash-ticket-promedio-usd').textContent = formatImporte(usd.ticketPromedio, 'USD');

  const moneda = $('dash-moneda')?.value === 'USD' ? 'USD' : 'ARS';
  S.dashboardMoneda = moneda;
  const stats = moneda === 'USD' ? usd : ars;
  const prefix = moneda === 'USD' ? 'U$S' : '$';

  const ms = Object.keys(stats.porMes).sort();
  destroyChart('evolucion');
  S.charts.evolucion = new Chart($('chart-evolucion'), {
    type:'bar', data:{ labels:ms, datasets:[{ label:`Gasto mensual (${moneda})`, data:ms.map(m=>stats.porMes[m]),
      backgroundColor:'rgba(37,99,235,.75)', borderColor:'#2563eb', borderWidth:1, borderRadius:6, maxBarThickness:42 }]},
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>prefix+(v/1e6).toFixed(1)+'M'}}}}
  });

  const tc = Object.entries(stats.porCentro).sort((a,b)=>b[1]-a[1]).slice(0,8);
  destroyChart('centros');
  S.charts.centros = new Chart($('chart-centros'), {
    type:'doughnut', data:{ labels:tc.map(c=>c[0]), datasets:[{ label:`% del histórico total (${moneda})`,
      data:tc.map(c=>((c[1]/(stats.total||1))*100)),
      backgroundColor:['rgba(37,99,235,.85)','rgba(16,185,129,.85)','rgba(245,158,11,.85)','rgba(239,68,68,.85)','rgba(139,92,246,.85)','rgba(236,72,153,.85)','rgba(6,182,212,.85)','rgba(132,204,22,.85)'],
      borderColor:'#ffffff', borderWidth:2, hoverOffset:8 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'58%',
      plugins:{ legend:{position:'bottom',labels:{boxWidth:12,usePointStyle:true}},
        tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${Number(ctx.parsed).toFixed(1)}% · ${formatImporte(tc[ctx.dataIndex][1], moneda)}`}}}}
  });

  const centros = uniqueSorted(stats.data.map(g=>g.Centro));
  $('evolucion-centro').innerHTML = '<option value="">Seleccionar centro...</option>'+centros.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  const conceptos = uniqueSorted(stats.data.map(g=>g.Concepto));
  $('evolucion-concepto').innerHTML = '<option value="">Seleccionar...</option>'+conceptos.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');

  renderEvolucionCentro();
  renderEvolucionConcepto();
}

function dataActual() {
  const moneda = S.dashboardMoneda || 'ARS';
  return { moneda, prefix: moneda === 'USD' ? 'U$S' : '$', items: S.allData.filter(g => (g.Moneda || 'ARS') === moneda) };
}

export function renderEvolucionCentro() {
  const c=$('evolucion-centro')?.value, cv=$('chart-evolucion-centro'); if(!cv) return;
  if(!c) { destroyChart('evolucionCentro'); cv.style.display='none'; $('evolucion-centro-stats').innerHTML=''; return; }
  cv.style.display='block';
  const { moneda, prefix, items } = dataActual();
  const d=items.filter(g=>g.Centro===c), pm=aggregateBy(d,g=>getMesKey(g.Fecha)||'?'), ms=Object.keys(pm).sort(), vs=ms.map(m=>pm[m]);
  const t=vs.reduce((a,b)=>a+b,0), avg=vs.length?t/vs.length:0, last=vs.length?vs[vs.length-1]:0;
  $('evolucion-centro-stats').innerHTML = `<div class="bg-blue-50 rounded p-2"><div class="font-bold text-blue-600">${formatImporte(t, moneda)}</div><div class="text-xs">Total histórico</div></div><div class="bg-emerald-50 rounded p-2"><div class="font-bold text-emerald-600">${formatImporte(avg, moneda)}</div><div class="text-xs">Promedio mensual</div></div><div class="bg-purple-50 rounded p-2"><div class="font-bold text-purple-600">${formatImporte(last, moneda)}</div><div class="text-xs">Último mes</div></div>`;
  destroyChart('evolucionCentro');
  S.charts.evolucionCentro = new Chart(cv, { type:'bar', data:{ labels:ms, datasets:[{ label:c.substring(0,24), data:vs, backgroundColor:'rgba(16,185,129,.75)', borderColor:'#10b981', borderWidth:1, borderRadius:6, maxBarThickness:40 }]}, options:{ responsive:true, plugins:{legend:{display:true}}, scales:{y:{ticks:{callback:v=>prefix+(v/1e3).toFixed(0)+'k'}}}}});
}

export function renderEvolucionConcepto() {
  const c=$('evolucion-concepto')?.value, cv=$('chart-evolucion-concepto'); if(!cv) return;
  if(!c) { destroyChart('evolucionConcepto'); cv.style.display='none'; $('evolucion-stats').innerHTML=''; return; }
  cv.style.display='block';
  const { moneda, prefix, items } = dataActual();
  const d=items.filter(g=>g.Concepto===c), pm=aggregateBy(d,g=>getMesKey(g.Fecha)||'?'), ms=Object.keys(pm).sort(), vs=ms.map(m=>pm[m]);
  const t=vs.reduce((a,b)=>a+b,0), avg=vs.length?t/vs.length:0;
  $('evolucion-stats').innerHTML = `<div class="bg-blue-50 rounded p-2"><div class="font-bold text-blue-600">${formatImporte(t, moneda)}</div><div class="text-xs">Total</div></div><div class="bg-emerald-50 rounded p-2"><div class="font-bold text-emerald-600">${formatImporte(avg, moneda)}</div><div class="text-xs">Promedio</div></div><div class="bg-purple-50 rounded p-2"><div class="font-bold text-purple-600">${vs.length}</div><div class="text-xs">Meses</div></div>`;
  destroyChart('evolucionConcepto');
  S.charts.evolucionConcepto = new Chart(cv, { type:'bar', data:{ labels:ms, datasets:[{ label:c.substring(0,20), data:vs, backgroundColor:'rgba(139,92,246,.75)', borderColor:'#8b5cf6', borderWidth:1, borderRadius:6, maxBarThickness:40 }]}, options:{ responsive:true, plugins:{legend:{display:true}}, scales:{y:{ticks:{callback:v=>prefix+(v/1e3).toFixed(0)+'k'}}}}});
}
