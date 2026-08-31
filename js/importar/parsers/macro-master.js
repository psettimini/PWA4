/* ========================================
   IMPORTAR — Parser Master Macro (resumen de cuenta)
   parsers/macro-master.js — Llega por OCR con posición de palabras.
   Cada consumo ocupa dos filas: una con el comercio y otra con el importe.
======================================== */
import { parseFecha, limpiarComercio, normalizarTexto } from '../normalizar.js';
import { importesPosicionados, detectarColumnas, elegirImporte } from './columnas.js';
import { sugerirCentroPorSocio } from '../clasificar.js';

export const METODO = 'Master Macro';

const RE_MOV = /^(\d{1,2}\/\d{1,2})\s+(\d{3,5})\s*(.*)$/;
const RE_SALDO = /SALDO AL (\d{1,2}\/\d{1,2}\/\d{2,4})/;
const RE_TOTAL_SOCIO = /^TOTAL\s+(?:TITULAR|ADICIONAL)\s+(.+?)\s*$/i;
const RE_DESCARTE = /SALDO AL|SU PAGO|^TOTAL\b|TRANSFER ENTRE MONEDAS|S\.E\.U\.O/;

export function detectarCierre(filas) {
  const fechas = [];
  for (const f of filas) {
    const m = f.texto.match(RE_SALDO);
    if (m) { const iso = parseFecha(m[1], null); if (iso) fechas.push(iso); }
  }
  fechas.sort();
  return fechas[fechas.length - 1] || null;
}

/* Master imprime DOLARES a la izquierda y PESOS a la derecha. Se agrupan
   los importes en columnas y se decide cuál es cuál con los encabezados;
   si el OCR no los reconoce, se usa ese orden. */
function detectarAnclas(filas) {
  const bordes = [];
  for (const f of filas) for (const i of importesPosicionados(f)) bordes.push(i.x1);
  if (!bordes.length) return {};
  /* Solo interesan las dos columnas más a la derecha: las de moneda.
     Las demás son importes que aparecen dentro del detalle, como el monto
     de origen entre paréntesis de los consumos en el exterior. */
  const todas = detectarColumnas(bordes, 150);
  const cols = todas.slice(-2);
  if (cols.length === 1) return { USD: cols[0] };

  const izq = cols[0], der = cols[cols.length - 1];
  let cDol = null, cPes = null;
  for (const f of filas) {
    for (const p of f.palabras || []) {
      const t = normalizarTexto(p.texto);
      if (t.startsWith('DOLARE')) cDol = p.centro;
      if (t.startsWith('PESO')) cPes = p.centro;
    }
    if (cDol !== null && cPes !== null) break;
  }
  if (cDol !== null && cPes !== null && cDol > cPes) return { ARS: izq, USD: der };
  return { USD: izq, ARS: der };
}

export function parseMacroMaster(filas, opts = {}) {
  const cierre = detectarCierre(filas) || opts.cierre || null;
  const anclas = detectarAnclas(filas);
  const movs = [];
  const pendientes = new Map();
  let desdeSocio = 0;

  for (const fila of filas) {
    const texto = fila.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const textoN = normalizarTexto(texto);
    const imp = elegirImporte(fila, anclas);

    /* "TOTAL ADICIONAL SETTIMINI JUANA" cierra el bloque de un adicional:
       los consumos anteriores sin socio son suyos. */
    const socio = texto.match(RE_TOTAL_SOCIO);
    if (socio) {
      const nombre = socio[1].replace(/[\d.,-]+$/, '').trim();
      for (let i = desdeSocio; i < movs.length; i++) {
        if (movs[i].socio) continue;
        movs[i].socio = nombre;
        movs[i].centroSugerido = sugerirCentroPorSocio(nombre, opts.centros || []);
      }
      desdeSocio = movs.length;
      continue;
    }
    if (RE_DESCARTE.test(textoN)) continue;

    const m = texto.match(RE_MOV);
    if (m) {
      const fecha = parseFecha(m[1], cierre);
      const ref = m[2];
      const resto = m[3].trim();
      if (!fecha) continue;

      if (!imp) { pendientes.set(ref, resto); continue; }

      const desdePendiente = pendientes.get(ref);
      const concepto = limpiarComercio(desdePendiente || resto) || resto;
      pendientes.delete(ref);
      if (!concepto) continue;

      movs.push({
        fecha, importe: imp.valor, moneda: imp.moneda, metodo: METODO,
        conceptoOrigen: concepto, origen: 'macro-master', estado: 'nuevo',
        motivoDescarte: null, socio: '', centroSugerido: '', _lineas: [texto]
      });
      continue;
    }

    /* Impuestos y percepciones del pie: vienen sin fecha. */
    if (imp && /IMPUESTO|PERCEP|IIBB|RG\s*\d|IVA\b|SELLOS/.test(textoN)) {
      const pos = texto.lastIndexOf(imp.texto);
      const concepto = limpiarComercio(pos > 0 ? texto.slice(0, pos) : texto);
      if (!concepto || !cierre) continue;
      movs.push({
        fecha: cierre, importe: imp.valor, moneda: imp.moneda, metodo: METODO,
        conceptoOrigen: concepto, origen: 'macro-master', estado: 'nuevo',
        motivoDescarte: null, socio: '', centroSugerido: '', _lineas: [texto]
      });
    }
  }

  /* Comercios que quedaron sin su línea de importe: el resumen los lista en
     dos renglones y el segundo no se pudo leer. */
  const sinImporte = [...pendientes.values()];
  return {
    cierre,
    movimientos: movs.filter(m => Number.isFinite(m.importe) && m.importe !== 0),
    sinImporte
  };
}
