/* ========================================
   IMPORTAR — Pantalla de revisión
   revision.js — Render y edición de las filas propuestas
======================================== */
import { $, S } from '../state.js';
import { escapeHtml, escapeAttr, formatFechaCorta, uniqueSorted } from '../utils.js';
import { formatImporteEdit } from './normalizar.js';

const CHIP = {
  nuevo: '<span class="imp-chip imp-chip-nuevo">Nuevo</span>',
  duplicado: '<span class="imp-chip imp-chip-dup">Posible duplicado</span>',
  descartado: '<span class="imp-chip imp-chip-desc">Descartado</span>'
};

const CONF = {
  alta: '<span class="imp-conf imp-conf-alta" title="Clasificado con alta confianza">●</span>',
  media: '<span class="imp-conf imp-conf-media" title="Clasificado con confianza media">●</span>',
  baja: '<span class="imp-conf imp-conf-baja" title="Sin patrón conocido: revisá centro y concepto">●</span>'
};

export function metodosDisponibles() {
  return uniqueSorted([...S.dbMetodos, ...S.allData.map(g => g.Metodo)]);
}

function opcionesMetodo(sel) {
  const lista = uniqueSorted([...metodosDisponibles(), sel]);
  return lista.map(m => `<option value="${escapeAttr(m)}"${m === sel ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
}

/* Muestra el gasto ya cargado que podría ser este mismo movimiento. */
function bloqueDuplicados(m) {
  if (!m.duplicados?.length) {
    if (m.duplicadoInterno) {
      return `<div class="imp-dup-info"><i class="fas fa-clone mr-1"></i>Repetido dentro de este mismo lote (${escapeHtml(m.duplicadoInterno.conceptoOrigen)}). Marcalo solo si de verdad son dos movimientos.</div>`;
    }
    return '';
  }
  const filas = m.duplicados.slice(0, 3).map(d => {
    const dias = d.deltaDias === 0 ? 'misma fecha' : `${Math.abs(d.deltaDias)} día${Math.abs(d.deltaDias) === 1 ? '' : 's'} de diferencia`;
    return `<div class="imp-dup-fila"><span class="imp-dup-fecha">${escapeHtml(formatFechaCorta(d.gasto.Fecha))}</span><span class="imp-dup-concepto">${escapeHtml(d.gasto.Concepto)}</span><span class="imp-dup-meta">${escapeHtml(d.gasto.Centro)} · ${escapeHtml(d.gasto.Metodo)}</span><span class="imp-dup-dias">${dias}</span></div>`;
  }).join('');
  return `<div class="imp-dup-info"><div class="imp-dup-titulo"><i class="fas fa-triangle-exclamation mr-1"></i>Ya cargado con este importe y fecha:</div>${filas}</div>`;
}

function renderFila(m) {
  const desc = m.estado === 'descartado';
  const monedaUSD = m.moneda === 'USD';
  return `
<div class="imp-fila${m.incluir ? ' imp-fila-on' : ''}${desc ? ' imp-fila-desc' : ''}" data-fid="${escapeAttr(m.id)}">
  <div class="imp-fila-head">
    <label class="imp-check">
      <input type="checkbox" data-imp="incluir" data-fid="${escapeAttr(m.id)}"${m.incluir ? ' checked' : ''}${desc ? ' disabled' : ''}>
      <span></span>
    </label>
    <div class="imp-head-txt">
      ${CHIP[m.estado] || ''}
      ${CONF[m.confianza] || ''}
      <span class="imp-origen" title="Texto del extracto">${escapeHtml(m.conceptoOrigen)}</span>
      ${m.truncado ? '<span class="imp-trunc" title="La app de Ualá cortó el nombre">cortado</span>' : ''}
    </div>
    <div class="imp-head-imp${monedaUSD ? ' imp-usd' : ''}">${monedaUSD ? 'U$S ' : '$'}${formatImporteEdit(m.importe)}</div>
  </div>
  ${desc ? `<div class="imp-motivo">${escapeHtml(m.motivoDescarte || 'Descartado')} · <button type="button" data-action="importRestaurar" data-fid="${escapeAttr(m.id)}" class="imp-link">Importar igual</button></div>` : `
  <div class="imp-campos">
    <label class="imp-campo imp-campo-fecha"><span>Fecha</span>
      <input type="date" data-imp="fecha" data-fid="${escapeAttr(m.id)}" value="${escapeAttr(m.fecha)}"></label>
    <label class="imp-campo imp-campo-centro"><span>Centro</span>
      <input type="text" list="centros-list" data-imp="centro" data-fid="${escapeAttr(m.id)}" value="${escapeAttr(m.centro)}" placeholder="Centro de gasto"></label>
    <label class="imp-campo imp-campo-concepto"><span>Concepto</span>
      <input type="text" list="import-conceptos-list" data-imp="concepto" data-fid="${escapeAttr(m.id)}" value="${escapeAttr(m.concepto)}"></label>
    <label class="imp-campo imp-campo-tipo"><span>Tipo</span>
      <select data-imp="tipo" data-fid="${escapeAttr(m.id)}"><option value="F"${m.tipo === 'F' ? ' selected' : ''}>Fijo</option><option value="V"${m.tipo === 'V' ? ' selected' : ''}>Variable</option></select></label>
    <label class="imp-campo imp-campo-metodo"><span>Método</span>
      <select data-imp="metodo" data-fid="${escapeAttr(m.id)}">${opcionesMetodo(m.metodo)}</select></label>
    <label class="imp-campo imp-campo-importe"><span>Importe</span>
      <input type="text" inputmode="decimal" data-imp="importe" data-fid="${escapeAttr(m.id)}" value="${escapeAttr(formatImporteEdit(m.importe))}"></label>
    <label class="imp-campo imp-campo-moneda"><span>Moneda</span>
      <select data-imp="moneda" data-fid="${escapeAttr(m.id)}"><option value="ARS"${!monedaUSD ? ' selected' : ''}>ARS</option><option value="USD"${monedaUSD ? ' selected' : ''}>USD</option></select></label>
    <button type="button" class="imp-descartar" data-action="importDescartar" data-fid="${escapeAttr(m.id)}" title="Descartar esta fila"><i class="fas fa-ban"></i></button>
  </div>
  ${bloqueDuplicados(m)}`}
</div>`;
}

export function renderRevision(movs, filtro = 'todos') {
  const cont = $('import-lista');
  if (!cont) return;

  const visibles = movs.filter(m => filtro === 'todos'
    || (filtro === 'nuevos' && m.estado === 'nuevo')
    || (filtro === 'duplicados' && m.estado === 'duplicado')
    || (filtro === 'descartados' && m.estado === 'descartado')
    || (filtro === 'revisar' && m.estado !== 'descartado' && (m.confianza === 'baja' || !m.centro)));

  cont.innerHTML = visibles.length
    ? visibles.map(renderFila).join('')
    : '<p class="text-sm text-slate-400 italic py-8 text-center">No hay filas en este filtro</p>';

  const lista = $('import-conceptos-list');
  if (lista) lista.innerHTML = uniqueSorted(S.patrones.map(p => p.concepto)).map(c => `<option value="${escapeAttr(c)}">`).join('');

  renderResumen(movs, filtro);
}

export function renderResumen(movs, filtro) {
  const marcados = movs.filter(m => m.incluir);
  const totales = {};
  for (const m of marcados) {
    const k = m.moneda || 'ARS';
    totales[k] = (totales[k] || 0) + Number(m.importe || 0);
  }
  const cuenta = e => movs.filter(m => m.estado === e).length;
  const sinCentro = marcados.filter(m => !m.centro).length;

  const chips = [
    { k: 'todos', txt: `Todo (${movs.length})` },
    { k: 'nuevos', txt: `Nuevos (${cuenta('nuevo')})` },
    { k: 'duplicados', txt: `Duplicados (${cuenta('duplicado')})` },
    { k: 'revisar', txt: `A revisar (${movs.filter(m => m.estado !== 'descartado' && (m.confianza === 'baja' || !m.centro)).length})` },
    { k: 'descartados', txt: `Descartados (${cuenta('descartado')})` }
  ].map(c => `<button type="button" data-action="importFiltro" data-filtro="${c.k}" class="imp-filtro${filtro === c.k ? ' imp-filtro-on' : ''}">${c.txt}</button>`).join('');

  const f = $('import-filtros'); if (f) f.innerHTML = chips;

  const tot = Object.entries(totales)
    .map(([mon, v]) => `<span class="imp-total${mon === 'USD' ? ' imp-usd' : ''}">${mon === 'USD' ? 'U$S ' : '$'}${formatImporteEdit(v)}</span>`)
    .join('');
  const r = $('import-resumen');
  if (r) {
    r.innerHTML = `<div class="imp-resumen-num"><strong>${marcados.length}</strong> marcada${marcados.length === 1 ? '' : 's'} para importar</div><div class="imp-resumen-tot">${tot || '—'}</div>`;
  }

  const btn = $('import-aprobar');
  if (btn) {
    btn.disabled = !marcados.length || sinCentro > 0;
    btn.innerHTML = sinCentro > 0
      ? `<i class="fas fa-circle-exclamation mr-2"></i>Faltan ${sinCentro} centro${sinCentro === 1 ? '' : 's'}`
      : `<i class="fas fa-check mr-2"></i>Importar ${marcados.length} gasto${marcados.length === 1 ? '' : 's'}`;
  }
}
