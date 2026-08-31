/* ========================================
   IMPORTAR — Registro de importaciones y cobertura por método
   registro.js — Para saber, antes de elegir un archivo, hasta dónde está
   cargado cada método y no volver a importar un período ya cubierto.
======================================== */
import { S } from '../state.js';
import { escapeHtml, formatFechaCorta } from '../utils.js';

export const REGISTRO_KEY = 'gastos_import_registro_v1';
const MAX_ENTRADAS = 20;

export function getRegistro() {
  try { return JSON.parse(localStorage.getItem(REGISTRO_KEY) || '[]') || []; }
  catch { return []; }
}

/* Deja constancia de una importación aprobada. */
export function registrarImportacion(movs) {
  const porMetodo = {};
  for (const m of movs) {
    const k = m.metodo || '—';
    if (!porMetodo[k]) porMetodo[k] = { n: 0, desde: m.fecha, hasta: m.fecha };
    const e = porMetodo[k];
    e.n++;
    if (m.fecha < e.desde) e.desde = m.fecha;
    if (m.fecha > e.hasta) e.hasta = m.fecha;
  }
  const entrada = { ts: Date.now(), total: movs.length, metodos: porMetodo };
  try {
    localStorage.setItem(REGISTRO_KEY, JSON.stringify([entrada, ...getRegistro()].slice(0, MAX_ENTRADAS)));
  } catch {}
  return entrada;
}

/* Hasta qué fecha hay movimientos cargados de cada método. Se calcula sobre
   los datos reales y no sobre el registro: así sigue siendo cierto aunque se
   borre el caché o se cargue algo a mano. */
export function coberturaPorMetodo(allData = S.allData) {
  const mapa = new Map();
  for (const g of allData || []) {
    const k = g.Metodo || '—';
    const f = g.Fecha || '';
    if (!f) continue;
    const e = mapa.get(k);
    if (!e) mapa.set(k, { metodo: k, hasta: f, n: 1 });
    else { e.n++; if (f > e.hasta) e.hasta = f; }
  }
  return [...mapa.values()].sort((a, b) => b.hasta.localeCompare(a.hasta));
}

function hace(ts) {
  const dias = Math.floor((Date.now() - ts) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

/* Panel que se muestra antes de elegir el archivo. */
export function renderCobertura(el) {
  if (!el) return;
  const cobertura = coberturaPorMetodo();
  if (!cobertura.length) { el.innerHTML = ''; return; }

  const ultima = getRegistro()[0];
  const cab = ultima
    ? `<div class="import-cob-cab"><i class="fas fa-clock-rotate-left mr-1"></i>Última importación ${escapeHtml(hace(ultima.ts))} · ${ultima.total} movimiento${ultima.total === 1 ? '' : 's'}</div>`
    : '<div class="import-cob-cab"><i class="fas fa-clock-rotate-left mr-1"></i>Todavía no importaste nada desde acá</div>';

  const filas = cobertura.slice(0, 10).map(c =>
    `<div class="import-cob-fila"><span>${escapeHtml(c.metodo)}</span><span class="import-cob-fecha">${escapeHtml(formatFechaCorta(c.hasta))}</span></div>`
  ).join('');

  el.innerHTML = `${cab}<div class="import-cob-titulo">Ya tenés cargado hasta:</div><div class="import-cob-grid">${filas}</div>`;
}
