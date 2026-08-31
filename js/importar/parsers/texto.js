/* ========================================
   IMPORTAR — Texto pegado
   parsers/texto.js — Para copiar y pegar el listado de movimientos desde
   el home banking, sin bajar el resumen.
======================================== */
import { parseFecha, normalizarTexto, limpiarComercio, parseImporteAR } from '../normalizar.js';

/* El importe siempre viene con su marcador de moneda pegado ("$1.170.906,00",
   "U$S 29,99"). Eso alcanza para saber la moneda y, de paso, deja afuera los
   números que son parte de la descripción: el monto de origen
   ("29.99 US DOLLAR") y el total de un plan de cuotas ("DE 1.279.999,00")
   no lo llevan. */
const RE_IMPORTE_MARCADO = /(U\$S|US\$|USD|\$)\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/g;

const RE_FECHA_INICIO = /^\s*(\d{1,2}[-/][A-Za-z0-9]{1,4}[-/]\d{2,4}|\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+|\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóú]{3,10}\s+\d{2,4})\b/;
const RE_CUOTA = /CUOTA\s*(\d{1,2})\s*\/\s*(\d{1,2})/i;

/* Acreditaciones de pago: no son gastos. */
const RE_PAGO = /ACREDITACION DE VUESTRO PAGO|GRACIAS POR SU PAGO|SU PAGO\b|PAGO RECIBIDO|PAGO EN PESOS/;

/* Devoluciones y reintegros: entran con signo negativo. */
const RE_DEVOLUCION = /DEV\.? ?PERCEPCION|DEVOLUCION|REINTEGRO|IMPORTE INVESTIGADO|^CREDITO\b/;

/* En el texto pegado las columnas suelen perder la alineación, así que el
   signo se decide por el contenido y no por la posición. */
export function parseTexto(texto, opts = {}) {
  const metodo = opts.metodo || 'AMEX';
  const origen = opts.origen || 'texto';
  const movs = [];
  const sinImporte = [];

  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.replace(/\t/g, '  ').replace(/\s{2,}/g, '  ').trim();
    if (!linea) continue;

    const mf = linea.match(RE_FECHA_INICIO);
    if (!mf) continue;
    const fecha = parseFecha(mf[1].replace(/-/g, '/'), opts.cierre || null)
      || parseFecha(mf[1], opts.cierre || null);
    if (!fecha) continue;

    const marcados = [...linea.matchAll(RE_IMPORTE_MARCADO)];
    if (!marcados.length) { sinImporte.push(linea); continue; }

    const ult = marcados[marcados.length - 1];
    const valor = parseImporteAR(ult[2]);
    if (!Number.isFinite(valor) || valor === 0) { sinImporte.push(linea); continue; }
    const moneda = /^\$$/.test(ult[1]) ? 'ARS' : 'USD';

    /* La descripción es lo que va entre la fecha y el primer importe. */
    let desc = linea.slice(mf[0].length, marcados[0].index).trim();
    desc = desc.replace(/[|;,]+$/, '').trim();

    const descN = normalizarTexto(desc);
    const esPago = RE_PAGO.test(descN);
    const esDevolucion = RE_DEVOLUCION.test(descN);

    const cuota = desc.match(RE_CUOTA);
    let concepto = limpiarComercio(cuota ? desc.replace(/CUOTA\s*\d{1,2}\s*\/\s*\d{1,2}.*$/i, '') : desc) || desc;
    if (cuota) concepto = `${concepto} (${Number(cuota[1])}/${Number(cuota[2])})`;
    if (!concepto) continue;

    movs.push({
      fecha,
      importe: esDevolucion ? -Math.abs(valor) : Math.abs(valor),
      moneda,
      metodo,
      conceptoOrigen: concepto,
      origen,
      estado: esPago ? 'descartado' : 'nuevo',
      motivoDescarte: esPago ? 'Acreditación de pago, no es un gasto' : null,
      centroSugerido: '',
      cuota: cuota ? { nro: Number(cuota[1]), total: Number(cuota[2]) } : null,
      _lineas: [linea]
    });
  }

  return { cierre: opts.cierre || null, movimientos: movs, sinImporte };
}
