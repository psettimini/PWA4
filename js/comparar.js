/* ========================================
   COMPARAR — Comparación de meses
   comparar.js
======================================== */
import { $, S } from './state.js';
import { safeNumber, formatearNumero, formatImporte, formatMesLabel, localMesStr, getMesKey, uniqueSorted, destroyChart, escapeHtml, escapeAttr, aggregateBy } from './utils.js';

export function initComparar() {
  const ms = uniqueSorted(S.allData.map(g=>getMesKey(g.Fecha))).reverse();
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

function totalesMes(mes, moneda) {
  return S.allData
    .filter(g => g.Fecha && g.Fecha.startsWith(mes) && (g.Moneda || 'ARS') === moneda)
    .reduce((s, g) => s + safeNumber(g.Importe), 0);
}

function pctVar(t1, t2) { return t1 > 0 ? ((t2 - t1) / t1 * 100) : 0; }

export function renderComparar() {
  const m1=$('comp-mes1').value, m2=$('comp-mes2').value, vista=$('comp-vista').value;
  if (!m1||!m2) { limpiarComparar(); return; }
  const moneda = $('comp-moneda')?.value === 'USD' ? 'USD' : 'ARS';
  S.compararMoneda = moneda;

  const tArs1 = totalesMes(m1, 'ARS'), tArs2 = totalesMes(m2, 'ARS');
  const tUsd1 = totalesMes(m1, 'USD'), tUsd2 = totalesMes(m2, 'USD');
  const dArs = tArs2 - tArs1, dUsd = tUsd2 - tUsd1;
  const pArs = pctVar(tArs1, tArs2), pUsd = pctVar(tUsd1, tUsd2);

  $('comp-total1').textContent = formatImporte(tArs1, 'ARS');
  $('comp-total1-usd').textContent = formatImporte(tUsd1, 'USD');
  $('comp-total2').textContent = formatImporte(tArs2, 'ARS');
  $('comp-total2-usd').textContent = formatImporte(tUsd2, 'USD');

  const diffEl = $('comp-diff');
  diffEl.textContent = `${dArs>=0?'+':'-'}${formatImporte(Math.abs(dArs), 'ARS')}`;
  diffEl.className = 'text-xl md:text-2xl font-bold ' + (dArs>0?'comp-up':dArs<0?'comp-down':'comp-neutral');
  const diffUsdEl = $('comp-diff-usd');
  if (diffUsdEl) {
    diffUsdEl.textContent = `${dUsd>=0?'+':'-'}${formatImporte(Math.abs(dUsd), 'USD')}`;
    diffUsdEl.className = 'text-xs font-semibold mt-1 ' + (dUsd>0?'comp-up':dUsd<0?'comp-down':'comp-neutral');
  }

  const pctEl = $('comp-pct');
  pctEl.textContent = `${pArs>=0?'+':''}${pArs.toFixed(1)}%`;
  pctEl.className = 'text-xl md:text-2xl font-bold ' + (pArs>0?'comp-up':pArs<0?'comp-down':'comp-neutral');
  const pctUsdEl = $('comp-pct-usd');
  if (pctUsdEl) {
    pctUsdEl.textContent = `${pUsd>=0?'+':''}${pUsd.toFixed(1)}%`;
    pctUsdEl.className = 'text-xs font-semibold mt-1 ' + (pUsd>0?'comp-up':pUsd<0?'comp-down':'comp-neutral');
  }

  const d1 = S.allData.filter(g=>g.Fecha&&g.Fecha.startsWith(m1)&&(g.Moneda||'ARS')===moneda);
  const d2 = S.allData.filter(g=>g.Fecha&&g.Fecha.startsWith(m2)&&(g.Moneda||'ARS')===moneda);
  const t1 = d1.reduce((s,g)=>s+safeNumber(g.Importe),0);
  const t2 = d2.reduce((s,g)=>s+safeNumber(g.Importe),0);
  const campo = vista==='centro'?'Centro':vista==='concepto'?'Concepto':vista==='tipo'?'Tipo':'Metodo';
  const g1=aggregateBy(d1,g=>g[campo]||'?'), g2=aggregateBy(d2,g=>g[campo]||'?');
  const cats=uniqueSorted([...Object.keys(g1),...Object.keys(g2)]);
  renderTablaComp(cats,g1,g2,t1,t2,moneda);
  renderBarrasComp(cats,g1,g2,m1,m2,moneda);
  renderDonutsComp(g1,g2,m1,m2,moneda);
  renderNuevosElim(g1,g2,moneda);
}

function renderTablaComp(cats,g1,g2,t1,t2,moneda) {
  const tb=$('comp-tabla-body'), tf=$('comp-tabla-foot'), mx=Math.max(...cats.map(c=>Math.max(g1[c]||0,g2[c]||0)),1);
  if (!cats.length) { tb.innerHTML='<tr><td colspan="6" class="py-8 text-center text-slate-400">Sin datos</td></tr>'; tf.innerHTML=''; return; }
  const sorted=cats.slice().sort((a,b)=>((g2[b]||0)+(g1[b]||0))-((g2[a]||0)+(g1[a]||0)));
  tb.innerHTML = sorted.map(c=>{
    const v1=g1[c]||0, v2=g2[c]||0, d=v2-v1, p=v1>0?(d/v1*100):(v2>0?100:0), w1=Math.max(v1/mx*100,.5), w2=Math.max(v2/mx*100,.5);
    return `<tr class="comp-highlight-row"><td class="py-3 px-4 font-medium">${escapeHtml(c)}</td><td class="py-3 px-4 text-right font-mono text-blue-600">${formatImporte(v1, moneda)}</td><td class="py-3 px-4 text-right font-mono text-amber-600">${formatImporte(v2, moneda)}</td><td class="py-3 px-4 text-right font-mono ${d>0?'comp-up':d<0?'comp-down':'comp-neutral'}">${d>=0?'+':'-'}${formatImporte(Math.abs(d), moneda)}</td><td class="py-3 px-4 text-right text-sm ${p>0?'comp-up':p<0?'comp-down':'comp-neutral'}">${v1===0&&v2>0?'<span class="text-xs bg-amber-100 text-amber-700 px-1 rounded">NUEVO</span>':v2===0&&v1>0?'—':`${p>=0?'+':''}${p.toFixed(1)}%`}</td><td class="py-3 px-4 hidden md:table-cell"><div class="comp-bar-container"><div class="comp-bar comp-bar-mes1" style="width:${w1.toFixed(1)}%"></div></div><div class="comp-bar-container"><div class="comp-bar comp-bar-mes2" style="width:${w2.toFixed(1)}%"></div></div></td></tr>`;
  }).join('');
  const td=t2-t1, tp=t1>0?(td/t1*100):0;
  tf.innerHTML = `<tr><td class="py-3 px-4">TOTAL</td><td class="py-3 px-4 text-right font-mono text-blue-600">${formatImporte(t1, moneda)}</td><td class="py-3 px-4 text-right font-mono text-amber-600">${formatImporte(t2, moneda)}</td><td class="py-3 px-4 text-right font-mono ${td>0?'comp-up':td<0?'comp-down':''}">${td>=0?'+':'-'}${formatImporte(Math.abs(td), moneda)}</td><td class="py-3 px-4 text-right ${tp>0?'comp-up':tp<0?'comp-down':''}">${tp>=0?'+':''}${tp.toFixed(1)}%</td><td class="py-3 px-4 hidden md:table-cell"></td></tr>`;
}

function renderBarrasComp(cats,g1,g2,m1,m2,moneda) {
  const prefix = moneda === 'USD' ? 'U$S' : '$';
  const s=cats.slice().sort((a,b)=>((g2[b]||0)+(g1[b]||0))-((g2[a]||0)+(g1[a]||0))).slice(0,10);
  destroyChart('compBarras');
  S.charts.compBarras = new Chart($('chart-comp-barras'), { type:'bar', data:{ labels:s.map(c=>c.length>18?c.substring(0,18)+'…':c),
    datasets:[{ label:formatMesLabel(m1), data:s.map(c=>g1[c]||0), backgroundColor:'rgba(59,130,246,.7)', borderColor:'#3b82f6', borderWidth:1 },
              { label:formatMesLabel(m2), data:s.map(c=>g2[c]||0), backgroundColor:'rgba(245,158,11,.7)', borderColor:'#f59e0b', borderWidth:1 }]},
    options:{ responsive:true, plugins:{legend:{position:'top'}}, scales:{y:{ticks:{callback:v=>prefix+(v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':v)}},x:{ticks:{maxRotation:45}}}}});
}

function renderDonutsComp(g1,g2,m1,m2,moneda) {
  const col=['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
  $('comp-donut-label1').textContent=formatMesLabel(m1); $('comp-donut-label2').textContent=formatMesLabel(m2);
  const e1=Object.entries(g1).sort((a,b)=>b[1]-a[1]), e2=Object.entries(g2).sort((a,b)=>b[1]-a[1]);
  const t1=e1.slice(0,6), o1=e1.slice(6).reduce((s,e)=>s+e[1],0);
  const t2=e2.slice(0,6), o2=e2.slice(6).reduce((s,e)=>s+e[1],0);
  destroyChart('compDonut1');
  S.charts.compDonut1 = new Chart($('chart-comp-donut1'), { type:'doughnut', data:{ labels:t1.map(e=>e[0]).concat(o1>0?['Otros']:[]), datasets:[{data:t1.map(e=>e[1]).concat(o1>0?[o1]:[]),backgroundColor:col}]}, options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${formatImporte(Number(ctx.parsed), moneda)}`}}}}});
  destroyChart('compDonut2');
  S.charts.compDonut2 = new Chart($('chart-comp-donut2'), { type:'doughnut', data:{ labels:t2.map(e=>e[0]).concat(o2>0?['Otros']:[]), datasets:[{data:t2.map(e=>e[1]).concat(o2>0?[o2]:[]),backgroundColor:col}]}, options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${formatImporte(Number(ctx.parsed), moneda)}`}}}}});
}

function renderNuevosElim(g1,g2,moneda) {
  const s1=Object.entries(g1).filter(([k])=>!(k in g2)).sort((a,b)=>b[1]-a[1]);
  const s2=Object.entries(g2).filter(([k])=>!(k in g1)).sort((a,b)=>b[1]-a[1]);
  $('comp-nuevos').innerHTML = !s2.length ? '<p class="text-sm text-slate-400 italic">No hay nuevos</p>' : s2.map(([k,v])=>`<div class="flex justify-between items-center p-3 bg-amber-50 rounded-lg"><span class="font-medium text-sm">${escapeHtml(k)}</span><span class="text-sm font-bold text-amber-600">${formatImporte(v, moneda)}</span></div>`).join('');
  $('comp-eliminados').innerHTML = !s1.length ? '<p class="text-sm text-slate-400 italic">No hay</p>' : s1.map(([k,v])=>`<div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg"><span class="font-medium text-sm">${escapeHtml(k)}</span><span class="text-sm font-bold text-blue-600">${formatImporte(v, moneda)}</span></div>`).join('');
}

function limpiarComparar() {
  $('comp-total1').textContent='$0'; $('comp-total2').textContent='$0';
  if ($('comp-total1-usd')) $('comp-total1-usd').textContent='U$S 0';
  if ($('comp-total2-usd')) $('comp-total2-usd').textContent='U$S 0';
  $('comp-diff').textContent='$0'; $('comp-diff').className='text-xl md:text-2xl font-bold comp-neutral';
  if ($('comp-diff-usd')) { $('comp-diff-usd').textContent='U$S 0'; $('comp-diff-usd').className='text-xs font-semibold mt-1 comp-neutral'; }
  $('comp-pct').textContent='0%'; $('comp-pct').className='text-xl md:text-2xl font-bold comp-neutral';
  if ($('comp-pct-usd')) { $('comp-pct-usd').textContent='0%'; $('comp-pct-usd').className='text-xs font-semibold mt-1 comp-neutral'; }
  $('comp-tabla-body').innerHTML='<tr><td colspan="6" class="py-8 text-center text-slate-400">Seleccioná dos meses</td></tr>';
  $('comp-tabla-foot').innerHTML=''; $('comp-nuevos').innerHTML='<p class="text-sm text-slate-400 italic">Seleccioná dos meses</p>';
  $('comp-eliminados').innerHTML='<p class="text-sm text-slate-400 italic">Seleccioná dos meses</p>';
  destroyChart('compBarras'); destroyChart('compDonut1'); destroyChart('compDonut2');
}
