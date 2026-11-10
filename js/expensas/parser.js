/* ========================================
   EXPENSAS — Lectura de la boleta del consorcio
   expensas/parser.js — Función pura: recibe las líneas que arma leerPdf()

   La boleta trae una fila por concepto: «UF   CONCEPTO   [MOTIVO]
   [lect. ant.   lect. act.   consumo]   [coeficiente]   IMPORTE», con las
   columnas separadas por tres espacios. Hay dos formatos:
   - hasta nov-2025: «TOTAL A PAGAR $ …» y «VENCIMIENTO:dd/mm/aaaa»
   - desde dic-2025: «1° VENCIMIENTO dd/mm/aaaa $ …»
   Los importes vienen en formato inglés (1,881,849.71).
   La boleta solo se acepta si los conceptos más el saldo anterior dan
   exactamente el total del 1° vencimiento.
======================================== */

const RE_IMPORTE = /^-?[\d,]+\.\d{2}$/;
const RE_ENTERO = /^\d+$/;
const RE_COEFICIENTE = /^\d+\.\d{3,}$/;

const aNumero = s => Number(String(s).replace(/,/g, ''));
const redondear = n => Math.round(n * 100) / 100;

function fechaIso(ddmmaaaa) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmaaaa || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/* Busca tres enteros seguidos ant, act, consumo con act − ant = consumo. */
function lectura(partes) {
  const nums = partes.map(p => (RE_ENTERO.test(p) ? Number(p) : null));
  for (let i = 0; i + 2 < nums.length; i++) {
    const [a, b, c] = nums.slice(i, i + 3);
    if (a !== null && b !== null && c !== null && b - a === c) return { ant: a, act: b, consumo: c, desde: i };
  }
  return null;
}

export function parsearBoleta(lineas) {
  const texto = lineas.join('\n');
  const uf = /UF\s*°\s*(\d+)/.exec(texto)?.[1];
  const periodo = /PERIODO LIQ:\s*(\d{4})(\d{2})/.exec(texto);
  if (!uf || !periodo) throw new Error('No parece una boleta de expensas: falta la unidad o el período.');

  const conceptos = [];
  let total = null, vencimiento = null, saldoAnterior = 0;

  for (const linea of lineas) {
    const partes = linea.split(/\s{3,}/).map(p => p.trim()).filter(Boolean);
    const ultimo = partes[partes.length - 1];

    if (/^Saldo Anterior/i.test(partes[0]) && RE_IMPORTE.test(ultimo)) {
      saldoAnterior = aNumero(ultimo);
      continue;
    }
    if (/^(1°\s*VENCIMIENTO|TOTAL A PAGAR)/i.test(partes[0]) && RE_IMPORTE.test(ultimo)) {
      total = aNumero(ultimo);
      vencimiento = fechaIso(partes.find(p => /^\d{2}\/\d{2}\/\d{4}$/.test(p))) || vencimiento;
      continue;
    }
    const venc = /^VENCIMIENTO:\s*(\d{2}\/\d{2}\/\d{4})/.exec(linea);
    if (venc) { vencimiento = vencimiento || fechaIso(venc[1]); continue; }

    /* Fila de concepto: arranca con el número de UF y termina en un importe. */
    if (partes[0] !== uf || partes.length < 3 || !RE_IMPORTE.test(ultimo)) continue;
    const medio = partes.slice(1, -1);
    const lec = lectura(medio);
    const motivo = medio.slice(1).filter((p, i) =>
      !(lec && i + 1 >= lec.desde && i + 1 < lec.desde + 3) && !RE_ENTERO.test(p) && !RE_COEFICIENTE.test(p));
    conceptos.push({
      concepto: medio[0],
      motivo: motivo.join(' ') || null,
      importe: aNumero(ultimo),
      lectura: lec ? { ant: lec.ant, act: lec.act, consumo: lec.consumo } : null,
    });
  }

  if (total === null) throw new Error('No encontré el total a pagar de la boleta.');
  if (!conceptos.length) throw new Error('No encontré ningún concepto en la boleta.');
  const suma = redondear(conceptos.reduce((s, c) => s + c.importe, 0) + saldoAnterior);
  if (Math.abs(suma - total) > 0.01) {
    throw new Error(`Los conceptos suman ${suma.toFixed(2)} y el total de la boleta es ${total.toFixed(2)}. No la guardo para no cargar datos mal leídos.`);
  }

  return { uf, periodo: `${periodo[1]}-${periodo[2]}`, vencimiento, saldoAnterior, total, conceptos };
}
