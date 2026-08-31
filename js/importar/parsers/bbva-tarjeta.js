/* ========================================
   IMPORTAR — Parser tarjetas BBVA (Visa Signature y Mastercard Black)
   parsers/bbva-tarjeta.js — Los dos resúmenes comparten el mismo formato:
   sólo cambia la marca. El PDF trae capa de texto, así que no hay OCR.
======================================== */
import { parseFecha, limpiarComercio, normalizarTexto } from '../normalizar.js';
import { importesPosicionados, detectarColumnas, elegirImporte } from './columnas.js';
import { sugerirCentroPorSocio } from '../clasificar.js';

export const METODOS = { visa: 'VISA BBVA', master: 'MASTER BBVA' };

/* Las filas arrancan con glifos de control del PDF ("Ëhji08-Jul-26"), así
   que la fecha se busca cerca del inicio en vez de anclarla. */
const RE_MOV = /(\d{2}-[A-Za-zÁÉÍÓÚáéíóú]{3}-\d{2})\s+(.*)$/;
const RE_SECCION_SOCIO = /^Consumos\s+(.+?)\s*$/i;
const RE_SECCION_IMPUESTOS = /Impuestos,\s*cargos\s*e\s*intereses/i;
const RE_SECCION_PAGOS = /Sus pagos y ajustes/i;
const RE_CUOTA = /CUOTA\s*(\d{1,2})\s*\/\s*(\d{1,2})/i;

/* Totales, encabezados y pie de página: nunca son movimientos. */
const RE_DESCARTE = /TOTAL CONSUMOS|SALDO ACTUAL|SALDO ANTERIOR|^FECHA\b|BANCO BBVA ARGENTINA|SOBRE \(|P[AÁ]GINA \d/;
const RE_PAGO = /SU PAGO\b|PAGO EN PESOS|PAGO EN DOLARES/;

export function detectarMarca(lineas) {
  const txt = normalizarTexto(lineas.slice(0, 40).join(' '));
  if (/MASTERCARD/.test(txt)) return 'master';
  if (/VISA/.test(txt)) return 'visa';
  return null;
}

/* Las columnas Pesos y Dólares son las dos más a la derecha; en este
   resumen pesos va primero. */
function detectarAnclas(filas) {
  const bordes = [];
  for (const f of filas) {
    if (!RE_MOV.test(f.texto)) continue;
    for (const i of importesPosicionados(f)) bordes.push(i.x1);
  }
  if (!bordes.length) return {};
  const cols = detectarColumnas(bordes, 30).slice(-2);
  if (cols.length === 1) return { ARS: cols[0] };
  return { ARS: cols[0], USD: cols[cols.length - 1] };
}

export function parseBbvaTarjeta(filas, opts = {}) {
  const lineas = filas.map(f => f.texto);
  const marca = opts.marca || detectarMarca(lineas) || 'visa';
  const metodo = METODOS[marca];
  const anclas = detectarAnclas(filas);
  const centros = opts.centros || [];

  const movs = [];
  const sinImporte = [];
  let socio = '';
  let enImpuestos = false;
  /* La sección de pagos incluye ajustes como la conversión del saldo en
     dólares a pesos ("TRANSFERENCIA DEUDA ... TC1525,000"): nada de eso es
     un gasto, así que se descarta la sección completa. */
  let enPagos = false;
  /* El bloque de cabecera repite cierre, vencimiento, saldos y pago mínimo
     en una fila que empieza con fecha, así que se parecía a un movimiento.
     Sólo se leen filas una vez que empezó una sección del detalle. */
  let enDetalle = false;

  for (const fila of filas) {
    const texto = fila.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;

    if (RE_SECCION_IMPUESTOS.test(texto)) { enDetalle = true; enImpuestos = true; enPagos = false; socio = ''; continue; }
    if (RE_SECCION_PAGOS.test(texto)) { enDetalle = true; enPagos = true; enImpuestos = false; socio = ''; continue; }
    const sec = texto.match(RE_SECCION_SOCIO);
    if (sec) { enDetalle = true; socio = sec[1].trim(); enImpuestos = false; enPagos = false; continue; }
    if (!enDetalle) continue;

    const m = texto.match(RE_MOV);
    if (!m || m.index > 24) continue;
    const fecha = parseFecha(m[1].replace(/-/g, ' '), null);
    if (!fecha) continue;

    const textoN = normalizarTexto(texto);
    if (RE_DESCARTE.test(textoN)) continue;

    const imp = elegirImporte(fila, anclas, 40);
    if (!imp || !Number.isFinite(imp.valor) || imp.valor === 0) {
      if (!RE_PAGO.test(textoN)) sinImporte.push(texto);
      continue;
    }

    let resto = m[2];
    const corte = resto.lastIndexOf(imp.texto);
    if (corte > 0) resto = resto.slice(0, corte);
    /* El número de cupón queda pegado al final de la descripción. */
    resto = resto.replace(/\s+\d{5,6}\s*$/, '');

    const cuota = resto.match(RE_CUOTA);
    if (cuota) resto = resto.replace(RE_CUOTA, ' ');

    let concepto = limpiarComercio(resto) || resto.trim();
    if (cuota) concepto = `${concepto} (${Number(cuota[1])}/${Number(cuota[2])})`;
    if (!concepto) continue;

    const esPago = enPagos || RE_PAGO.test(textoN);
    movs.push({
      fecha,
      importe: imp.valor,
      moneda: imp.moneda,
      metodo,
      conceptoOrigen: concepto,
      origen: marca === 'master' ? 'bbva-master' : 'bbva-visa',
      socio,
      estado: esPago ? 'descartado' : 'nuevo',
      motivoDescarte: esPago ? 'Pago o ajuste del resumen' : null,
      centroSugerido: enImpuestos ? 'Gastos Bancarios' : sugerirCentroPorSocio(socio, centros),
      esImpuesto: enImpuestos,
      _lineas: [texto]
    });
  }

  return { cierre: null, marca, movimientos: movs, sinImporte };
}
