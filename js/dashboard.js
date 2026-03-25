/* ========================================
   DASHBOARD — KPIs y Charts
   dashboard.js
======================================== */

function renderDashboard() {
  let total=0, fijos=0;
  const porMes=Object.create(null), porCentro=Object.create(null);
  const mesActualKey = localMesStr();
  let totalMesActual = 0, movimientosMesActual = 0;

  for (const g of allData) {
    const imp = safeNumber(g.Importe);
    total += imp;
    if (g.Tipo==='F') fijos += imp;
    const m = getMesKey(g.Fecha)||'?';
    porMes[m] = (porMes[m]||0) + imp;
    if (m === mesActualKey) { totalMesActual += imp; movimientosMesActual++; }
    const c = g.Centro||'?';
    porCentro[c] = (porCentro[c]||0) + imp;
  }

  const nm = Object.keys(porMes).length || 1;
  $('dash-mes-actual').textContent = '$'+formatearNumero(totalMesActual);
  $('dash-promedio').textContent = '$'+formatearNumero(total/nm);
  $('dash-fijos').textContent = total>0 ? Math.round(fijos/total*100)+'%' : '0%';
  $('dash-movimientos').textContent = movimientosMesActual;
  $('dash-ticket-promedio').textContent = '$'+formatearNumero(movimientosMesActual>0 ? totalMesActual/movimientosMesActual : 0);

  /* Evolución mensual */
  const ms = Object.keys(porMes).sort();
  destroyChart('evolucion');
  charts.evolucion = new Chart($('chart-evolucion'), {
    type:'bar', data:{ labels:ms, datasets:[{ label:'Gasto mensual', data:ms.map(m=>porMes[m]),
      backgroundColor:'rgba(37,99,235,.75)', borderColor:'#2563eb', borderWidth:1, borderRadius:6, maxBarThickness:42 }]},
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>'$'+(v/1e6).toFixed(1)+'M'}}}}
  });

  /* Por centro */
  const tc = Object.entries(porCentro).sort((a,b)=>b[1]-a[1]).slice(0,8);
  destroyChart('centros');
  charts.centros = new Chart($('chart-centros'), {
    type:'doughnut', data:{ labels:tc.map(c=>c[0]), datasets:[{ label:'% del histórico total',
      data:tc.map(c=>((c[1]/(total||1))*100)),
      backgroundColor:['rgba(37,99,235,.85)','rgba(16,185,129,.85)','rgba(245,158,11,.85)','rgba(239,68,68,.85)','rgba(139,92,246,.85)','rgba(236,72,153,.85)','rgba(6,182,212,.85)','rgba(132,204,22,.85)'],
      borderColor:'#ffffff', borderWidth:2, hoverOffset:8 }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'58%',
      plugins:{ legend:{position:'bottom',labels:{boxWidth:12,usePointStyle:true}},
        tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${Number(ctx.parsed).toFixed(1)}% · $${formatearNumero(tc[ctx.dataIndex][1])}`}}}}
  });

  /* Selects de evolución */
  const centros = uniqueSorted(allData.map(g=>g.Centro));
  $('evolucion-centro').innerHTML = '<option value="">Seleccionar centro...</option>'+centros.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  const conceptos = uniqueSorted(allData.map(g=>g.Concepto));
  $('evolucion-concepto').innerHTML = '<option value="">Seleccionar...</option>'+conceptos.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
}

function renderEvolucionCentro() {
  const c=$('evolucion-centro')?.value, cv=$('chart-evolucion-centro'); if(!cv) return;
  if(!c) { destroyChart('evolucionCentro'); cv.style.display='none'; $('evolucion-centro-stats').innerHTML=''; return; }
  cv.style.display='block';
  const d=allData.filter(g=>g.Centro===c), pm=aggregateBy(d,g=>getMesKey(g.Fecha)||'?'), ms=Object.keys(pm).sort(), vs=ms.map(m=>pm[m]);
  const t=vs.reduce((a,b)=>a+b,0), avg=vs.length?t/vs.length:0, last=vs.length?vs[vs.length-1]:0;
  $('evolucion-centro-stats').innerHTML = `<div class="bg-blue-50 rounded p-2"><div class="font-bold text-blue-600">$${formatearNumero(t)}</div><div class="text-xs">Total histórico</div></div><div class="bg-emerald-50 rounded p-2"><div class="font-bold text-emerald-600">$${formatearNumero(avg)}</div><div class="text-xs">Promedio mensual</div></div><div class="bg-purple-50 rounded p-2"><div class="font-bold text-purple-600">$${formatearNumero(last)}</div><div class="text-xs">Último mes</div></div>`;
  destroyChart('evolucionCentro');
  charts.evolucionCentro = new Chart(cv, { type:'bar', data:{ labels:ms, datasets:[{ label:c.substring(0,24), data:vs, backgroundColor:'rgba(16,185,129,.75)', borderColor:'#10b981', borderWidth:1, borderRadius:6, maxBarThickness:40 }]}, options:{ responsive:true, plugins:{legend:{display:true}}, scales:{y:{ticks:{callback:v=>'$'+(v/1e3).toFixed(0)+'k'}}}}});
}

function renderEvolucionConcepto() {
  const c=$('evolucion-concepto')?.value, cv=$('chart-evolucion-concepto'); if(!cv) return;
  if(!c) { destroyChart('evolucionConcepto'); cv.style.display='none'; $('evolucion-stats').innerHTML=''; return; }
  cv.style.display='block';
  const d=allData.filter(g=>g.Concepto===c), pm=aggregateBy(d,g=>getMesKey(g.Fecha)||'?'), ms=Object.keys(pm).sort(), vs=ms.map(m=>pm[m]);
  const t=vs.reduce((a,b)=>a+b,0), avg=vs.length?t/vs.length:0;
  $('evolucion-stats').innerHTML = `<div class="bg-blue-50 rounded p-2"><div class="font-bold text-blue-600">$${formatearNumero(t)}</div><div class="text-xs">Total</div></div><div class="bg-emerald-50 rounded p-2"><div class="font-bold text-emerald-600">$${formatearNumero(avg)}</div><div class="text-xs">Promedio</div></div><div class="bg-purple-50 rounded p-2"><div class="font-bold text-purple-600">${vs.length}</div><div class="text-xs">Meses</div></div>`;
  destroyChart('evolucionConcepto');
  charts.evolucionConcepto = new Chart(cv, { type:'bar', data:{ labels:ms, datasets:[{ label:c.substring(0,20), data:vs, backgroundColor:'rgba(139,92,246,.75)', borderColor:'#8b5cf6', borderWidth:1, borderRadius:6, maxBarThickness:40 }]}, options:{ responsive:true, plugins:{legend:{display:true}}, scales:{y:{ticks:{callback:v=>'$'+(v/1e3).toFixed(0)+'k'}}}}});
}
