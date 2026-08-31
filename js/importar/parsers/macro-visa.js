/* ========================================
   IMPORTAR — Parser VISA Macro (resumen de cuenta)
   parsers/macro-visa.js — El PDF es una captura, así que las filas llegan
   por OCR con la posición de cada palabra.
======================================== */
import { parseFecha, limpiarComercio, normalizarTexto } from '../normalizar.js';
import { importesPosicionados, elegirImporte } from './columnas.js';

export const METODO = 'VISA MACRO';

const RE_MOV = /^(\d{1,2}\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,10}\.?(?:\s+\d{2})?)\s+(.*)$/;
const RE_CUOTA = /\bC\.?\s?(\d{1,2})\s?\/\s?(\d{1,2})\b/i;
const RE_COMPROBANTE = /^\d{4,8}\s*[*+·.]?\s*/;
const RE_FIN = /^(Plan V|CFTEA|Cuotas a vencer|Recorda|Te informamos)/i;
const RE_DESCARTE = /SALDO ANTERIOR|SU PAGO|TOTAL CONSUMOS|^TARJETA\b|^TOTAL\b/;

export function detectarCierre(filas) {
  for (const f of filas) {
    const m = f.texto.match(/IERRE\s+(\d{1,2}\s+[A-Za-zÁ-ú]{3,10}\.?\s+\d{2})\b/);
    if (m) { const iso = parseFecha(m[1], null); if (iso) return iso; }
  }
  return null;
}

/* Las columnas $ y u$s se calibran con la línea "Total Consumos", que trae
   los dos totales. Si no aparece, se agrupan los importes de las filas de
   consumo: en este resumen pesos va a la izquierda y dólares a la derecha. */
function detectarAnclas(filas) {
  for (const f of filas) {
    if (!/Total Consumos/i.test(f.texto)) continue;
    const imps = importesPosicionados(f);
    if (imps.length >= 2) {
      const xs = imps.map(i => i.x1).sort((a, b) => a - b);
      return { ARS: xs[0], USD: xs[xs.length - 1] };
    }
  }
  const bordes = [];
  for (const f of filas) {
    if (!RE_MOV.test(f.texto)) continue;
    for (const i of importesPosicionados(f)) bordes.push(i.x1);
  }
  if (!bordes.length) return {};
  const max = Math.max(...bordes);
  return { ARS: max };
}

export function parseMacroVisa(filas, opts = {}) {
  const cierre = detectarCierre(filas) || opts.cierre || null;
  const anclas = detectarAnclas(filas);
  const movs = [];
  const sinImporte = [];

  for (const fila of filas) {
    const texto = fila.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    if (RE_FIN.test(texto)) break;

    const m = texto.match(RE_MOV);
    if (!m) continue;
    const fecha = parseFecha(m[1], cierre);
    if (!fecha) continue;

    const imp = elegirImporte(fila, anclas);
    if (!imp || !Number.isFinite(imp.valor) || imp.valor === 0) {
      /* La línea tiene fecha de consumo pero no se le pudo leer el importe.
         Pasa si el OCR confunde la coma decimal por un punto. Se avisa para
         que no se pierda en silencio. */
      if (!RE_DESCARTE.test(normalizarTexto(texto))) sinImporte.push(texto);
      continue;
    }

    let resto = m[2];
    const corte = resto.lastIndexOf(imp.texto);
    if (corte > 0) resto = resto.slice(0, corte);
    /* El comprobante y el asterisco de la columna no siempre los devuelve
       igual el OCR, así que se limpian por separado y de forma tolerante. */
    resto = resto.replace(RE_COMPROBANTE, '').replace(/^[*+·.,\-\s]+/, '');

    const cuota = resto.match(RE_CUOTA);
    if (cuota) resto = resto.replace(RE_CUOTA, ' ');

    let concepto = limpiarComercio(resto) || resto.trim();
    if (cuota) concepto = `${concepto} (${Number(cuota[1])}/${Number(cuota[2])})`;
    if (!concepto) continue;

    const descartar = RE_DESCARTE.test(normalizarTexto(texto));
    movs.push({
      fecha,
      importe: imp.valor,
      moneda: imp.moneda,
      metodo: METODO,
      conceptoOrigen: concepto,
      origen: 'macro-visa',
      estado: descartar ? 'descartado' : 'nuevo',
      motivoDescarte: descartar ? 'Pago o saldo del resumen' : null,
      centroSugerido: '',
      cuota: cuota ? { nro: Number(cuota[1]), total: Number(cuota[2]) } : null,
      _lineas: [texto]
    });
  }

  return { cierre, movimientos: movs, sinImporte };
}
