/* ========================================
   IMPORTAR — Deduplicación contra lo ya cargado
   dedup.js — Funciones puras
======================================== */
import { normalizarTexto, diffDias } from './normalizar.js';

export const TOLERANCIA_DIAS = 3;

/* Clave fuerte: importe absoluto + moneda.
   El concepto queda fuera a propósito: los movimientos ya cargados tienen
   el concepto reescrito a mano ("EPE SANTA FE" quedó como "Energía Dolf"),
   así que incluirlo haría que ningún duplicado real matchee. */
export const claveImporte = (importe, moneda) =>
  `${moneda || 'ARS'}|${Math.abs(Number(importe) || 0).toFixed(2)}`;

export function construirIndice(allData) {
  const idx = new Map();
  for (const g of allData || []) {
    const k = claveImporte(g.Importe, g.Moneda);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(g);
  }
  return idx;
}

/* Similitud gruesa entre dos textos por tokens de 4+ caracteres. */
function similitudTexto(a, b) {
  const tok = s => new Set(normalizarTexto(s).split(/[^A-Z0-9]+/).filter(t => t.length >= 4));
  const ta = tok(a), tb = tok(b);
  if (!ta.size || !tb.size) return 0;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  return comunes / Math.min(ta.size, tb.size);
}

/* Puntaje de confianza del match. La fecha exacta y el mismo método suman;
   la distancia en días resta. Solo ordena candidatos, no decide por sí solo. */
function puntaje(mov, gasto, deltaDias) {
  let p = 100 - Math.abs(deltaDias) * 12;
  if (normalizarTexto(mov.metodo) === normalizarTexto(gasto.Metodo)) p += 15;
  if (Math.sign(mov.importe) !== Math.sign(Number(gasto.Importe))) p -= 25;
  p += Math.round(similitudTexto(mov.conceptoOrigen || mov.concepto, gasto.Concepto) * 20);
  return p;
}

/* Busca en lo ya cargado los gastos que podrían ser este mismo movimiento. */
export function buscarDuplicados(mov, idx, tolerancia = TOLERANCIA_DIAS) {
  if (!mov || !Number.isFinite(mov.importe)) return [];
  const candidatos = idx.get(claveImporte(mov.importe, mov.moneda)) || [];
  const out = [];
  for (const g of candidatos) {
    const dd = diffDias(mov.fecha, g.Fecha);
    if (dd === null || Math.abs(dd) > tolerancia) continue;
    out.push({ gasto: g, deltaDias: dd, score: puntaje(mov, g, dd) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* Duplicados dentro del propio lote: pasa cuando se importan dos resúmenes
   con período solapado o capturas de Ualá que se pisan. Marca la segunda
   aparición y siguientes, dejando la primera como buena. */
export function marcarDuplicadosInternos(movs) {
  const vistos = new Map();
  for (const m of movs) {
    /* El concepto y el socio entran en la clave interna: dentro de un mismo
       resumen hay cargos legítimos con igual fecha e importe (la cuota de
       cada hijo, por ejemplo) que no son el mismo movimiento. */
    const k = `${m.fecha}|${claveImporte(m.importe, m.moneda)}|${normalizarTexto(m.conceptoOrigen)}|${normalizarTexto(m.socio)}`;
    if (vistos.has(k)) {
      m.duplicadoInterno = vistos.get(k);
      m.estado = 'duplicado';
    } else {
      vistos.set(k, m);
    }
  }
  return movs;
}

/* Anota cada movimiento con sus posibles duplicados y fija el estado inicial:
   'duplicado' si hay match (queda desmarcado), 'nuevo' si no. */
export function anotarDuplicados(movs, allData, tolerancia = TOLERANCIA_DIAS) {
  const idx = construirIndice(allData);
  marcarDuplicadosInternos(movs);
  for (const m of movs) {
    if (m.estado === 'descartado') { m.incluir = false; continue; }
    if (m.estado === 'duplicado' && m.duplicadoInterno) { m.incluir = false; continue; }
    const matches = buscarDuplicados(m, idx, tolerancia);
    m.duplicados = matches;
    if (matches.length) { m.estado = 'duplicado'; m.incluir = false; }
    else { m.estado = 'nuevo'; m.incluir = true; }
  }
  return movs;
}
