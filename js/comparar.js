/* ========================================
   COMPARAR — Comparación de meses
   comparar.js
======================================== */

function initComparar() {
  const ms = uniqueSorted(allData.map(g=>getMesKey(g.Fecha))).reverse();
  const s1=$('comp-mes1'), s2=$('comp-mes2');
  const opts = '<option value="">Mes...</option>'+ms.map(m=>`<option value="${m}">${formatMesLabel(m)}</option>`).join('');
  const p1=s1.value, p2=s2.value; s1.innerHTML=opts; s2.innerHTML=opts;

  const mesActual = localMesStr();
  const prev = new Date(new Date().getFullYear(), new Date().getMonth()-1, 1);
  const mesAnterior = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;

  s1.value = (p1 && ms.includes(p1)) ? p1 : ms.includes(mesAnterior) ? mesAnterior : ms[1] || '';
  s2.value = (p2 && ms.includes(p2)) ? p2 : ms.includes(mesActual) ? mesActual : ms[0] || '';
  renderComparar();
}

function renderComparar() {
  const m1=$('comp-mes1').value, m2=$('comp-mes2').value, vista=$('comp-vista').value;
  if (!m1||!m2) { limpiarComparar(); return; }
  const d1=allData.filter(g=>g.Fecha&&g.Fecha.startsWith(m1)), d2=allData.filter(g=>g.Fecha&&g.Fecha.startsWith(m2));
  const t1=d1.reduce((s,g)=>s+safeNumber(g.Importe),0), t2=d2.reduce((s,g)=>s+safeNumber(g.Importe),0), diff=t2-t1, pct=t1>0?(diff/t1*100):0;
  $('comp-total1').textContent='$'+formatearNumero(t1); $('comp-total2').textContent='$'+formatearNumero(t2);
  const de=$('comp-diff'); de.textContent=`${diff>=0?'+':'-'}$${formatearNumero(Math.abs(diff))}`; de.className='text-xl md:text-2xl font-bold '+(diff>0?'comp-up':diff<0?'comp-down':'comp-neutral');
  const pe=$('comp-pct'); pe.textContent=`${pct>=0?'+':''}${pct.toFixed(1)}%`; pe.className='text-xl md:text-2xl font-bold '+(pct>0?'comp-up':pct<0?'comp-down':'comp-neutral');
  const campo = vista==='centro'?'Centro':vista==='concepto'?'Concepto':vista==='tipo'?'Tipo':'Metodo';
  const g1=aggregateBy(d1,g=>g[campo]||'?'), g2=aggregateBy(d2,g=>g[campo]||'?');
  const cats=uniqueSorted([...Object.keys(g1),...Object.keys(g2)]);
  renderTablaComp(cats,g1,g2,t1,t2); renderBarrasComp(cats,g1,g2,m1,m2); renderDonutsComp(g1,g2,m1,m2); renderNuevosElim(g1,g2);
}

function renderTablaComp(cats,g1,g2,t1,t2) {
  const tb=$('comp-tabla-body'), tf=$('comp-tabla-foot'), mx=Math.max(...cats.map(c=>Math.max(g1[c]||0,g2[c]||0)),1);
  if (!cats.length) { tb.innerHTML='<tr><td colspan="6" class="py-8 text-center text-slate-400">Sin datos</td></tr>'; tf.innerHTML=''; return; }
  const sorted=cats.slice().sort((a,b)=>((g2[b]||0)+(g1[b]||0))-((g2[a]||0)+(g1[a]||0)));
  tb.innerHTML = sorted.map(c=>{
    const v1=g1[c]||0, v2=g2[c]||0, d=v2-v1, p=v1>0?(d/v1*100):(v2>0?100:0), w1=Math.max(v1/mx*100,.5), w2=Math.max(v2/mx*100,.5);
    return `<tr class="comp-highlight-row"><td class="py-3 px-4 font-medium">${escapeHtml(c)}</td><td class="py-3 px-4 text-right font-mono text-blue-600">$${formatearNumero(v1)}</td><td class="py-3 px-4 text-right font-mono text-amber-600">$${formatearNumero(v2)}</td><td class="py-3 px-4 text-right font-mono ${d>0?'comp-up':d<0?'comp-down':'comp-neutral'}">${d>=0?'+':'-'}$${formatearNumero(Math.abs(d))}</td><td class="py-3 px-4 text-right text-sm ${p>0?'comp-up':p<0?'comp-down':'comp-neutral'}">${v1===0&&v2>0?'<span class="text-xs bg-amber-100 text-amber-700 px-1 rounded">NUEVO</span>':v2===0&&v1>0?'—':`${p>=0?'+':''}${p.toFixed(1)}%`}</td><td class="py-3 px-4 hidden md:table-cell"><div class="comp-bar-container"><div class="comp-bar comp-bar-mes1" style="width:${w1.toFixed(1)}%"></div></div><div class="comp-bar-container"><div class="comp-bar comp-bar-mes2" style="width:${w2.toFixed(1)}%"></div></div></td></tr>`;
  }).join('');
  const td=t2-t1, tp=t1>0?(td/t1*100):0;
  tf.innerHTML = `<tr><td class="py-3 px-4">TOTAL</td><td class="py-3 px-4 text-right font-mono text-blue-600">$${formatearNumero(t1)}</td><td class="py-3 px-4 text-right font-mono text-amber-600">$${formatearNumero(t2)}</td><td class="py-3 px-4 text-right font-mono ${td>0?'comp-up':td<0?'comp-down':''}">${td>=0?'+':'-'}$${formatearNumero(Math.abs(td))}</td><td class="py-3 px-4 text-right ${tp>0?'comp-up':tp<0?'comp-down':''}">${tp>=0?'+':''}${tp.toFixed(1)}%</td><td class="py-3 px-4 hidden md:table-cell"></td></tr>`;
}

function renderBarrasComp(cats,g1,g2,m1,m2) {
  const s=cats.slice().sort((a,b)=>((g2[b]||0)+(g1[b]||0))-((g2[a]||0)+(g1[a]||0))).slice(0,10);
  destroyChart('compBarras');
  charts.compBarras = new Chart($('chart-comp-barras'), { type:'bar', data:{ labels:s.map(c=>c.length>18?c.substring(0,18)+'…':c),
    datasets:[{ label:formatMesLabel(m1), data:s.map(c=>g1[c]||0), backgroundColor:'rgba(59,130,246,.7)', borderColor:'#3b82f6', borderWidth:1 },
              { label:formatMesLabel(m2), data:s.map(c=>g2[c]||0), backgroundColor:'rgba(245,158,11,.7)', borderColor:'#f59e0b', borderWidth:1 }]},
    options:{ responsive:true, plugins:{legend:{position:'top'}}, scales:{y:{ticks:{callback:v=>'$'+(v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':v)}},x:{ticks:{maxRotation:45}}}}});
}

function renderDonutsComp(g1,g2,m1,m2) {
  const col=['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
  $('comp-donut-label1').textContent=formatMesLabel(m1); $('comp-donut-label2').textContent=formatMesLabel(m2);
  const e1=Object.entries(g1).sort((a,b)=>b[1]-a[1]), e2=Object.entries(g2).sort((a,b)=>b[1]-a[1]);
  const t1=e1.slice(0,6), o1=e1.slice(6).reduce((s,e)=>s+e[1],0);
  const t2=e2.slice(0,6), o2=e2.slice(6).reduce((s,e)=>s+e[1],0);
  destroyChart('compDonut1');
  charts.compDonut1 = new Chart($('chart-comp-donut1'), { type:'doughnut', data:{ labels:t1.map(e=>e[0]).concat(o1>0?['Otros']:[]), datasets:[{data:t1.map(e=>e[1]).concat(o1>0?[o1]:[]),backgroundColor:col}]}, options:{responsive:true,plugins:{legend:{display:false}}}});
  destroyChart('compDonut2');
  charts.compDonut2 = new Chart($('chart-comp-donut2'), { type:'doughnut', data:{ labels:t2.map(e=>e[0]).concat(o2>0?['Otros']:[]), datasets:[{data:t2.map(e=>e[1]).concat(o2>0?[o2]:[]),backgroundColor:col}]}, options:{responsive:true,plugins:{legend:{display:false}}}});
}

function renderNuevosElim(g1,g2) {
  const s1=Object.entries(g1).filter(([k])=>!(k in g2)).sort((a,b)=>b[1]-a[1]);
  const s2=Object.entries(g2).filter(([k])=>!(k in g1)).sort((a,b)=>b[1]-a[1]);
  $('comp-nuevos').innerHTML = !s2.length ? '<p class="text-sm text-slate-400 italic">No hay nuevos</p>' : s2.map(([k,v])=>`<div class="flex justify-between items-center p-3 bg-amber-50 rounded-lg"><span class="font-medium text-sm">${escapeHtml(k)}</span><span class="text-sm font-bold text-amber-600">$${formatearNumero(v)}</span></div>`).join('');
  $('comp-eliminados').innerHTML = !s1.length ? '<p class="text-sm text-slate-400 italic">No hay</p>' : s1.map(([k,v])=>`<div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg"><span class="font-medium text-sm">${escapeHtml(k)}</span><span class="text-sm font-bold text-blue-600">$${formatearNumero(v)}</span></div>`).join('');
}

function limpiarComparar() {
  $('comp-total1').textContent='$0'; $('comp-total2').textContent='$0';
  $('comp-diff').textContent='$0'; $('comp-diff').className='text-xl md:text-2xl font-bold comp-neutral';
  $('comp-pct').textContent='0%'; $('comp-pct').className='text-xl md:text-2xl font-bold comp-neutral';
  $('comp-tabla-body').innerHTML='<tr><td colspan="6" class="py-8 text-center text-slate-400">Seleccioná dos meses</td></tr>';
  $('comp-tabla-foot').innerHTML=''; $('comp-nuevos').innerHTML='<p class="text-sm text-slate-400 italic">Seleccioná dos meses</p>';
  $('comp-eliminados').innerHTML='<p class="text-sm text-slate-400 italic">Seleccioná dos meses</p>';
  destroyChart('compBarras'); destroyChart('compDonut1'); destroyChart('compDonut2');
}
