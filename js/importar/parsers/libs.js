/* ========================================
   IMPORTAR — Carga perezosa de librerías externas
   parsers/libs.js — Solo se descargan al abrir el importador
======================================== */

const CDN = {
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
};

const cargados = new Map();

function cargarScript(url) {
  if (cargados.has(url)) return cargados.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.appendChild(s);
  });
  cargados.set(url, p);
  return p;
}

/* Los Worker clásicos no pueden apuntar a otro origen, así que el worker de
   pdf.js se baja como texto y se instancia desde un blob local. Sin esto
   pdf.js cae a su worker falso, que no llega a rasterizar los resúmenes de
   Macro (son una imagen por página). */
let workerBlob = null;
async function urlWorkerPdf() {
  if (workerBlob) return workerBlob;
  const resp = await fetch(CDN.pdfWorker);
  if (!resp.ok) throw new Error('No se pudo cargar el worker de pdf.js');
  workerBlob = URL.createObjectURL(new Blob([await resp.text()], { type: 'text/javascript' }));
  return workerBlob;
}

export async function cargarPdfJs() {
  if (!window.pdfjsLib) await cargarScript(CDN.pdf);
  if (!window.pdfjsLib) throw new Error('pdf.js no disponible');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = await urlWorkerPdf();
  return window.pdfjsLib;
}

export async function cargarXlsx() {
  if (!window.XLSX) await cargarScript(CDN.xlsx);
  if (!window.XLSX) throw new Error('SheetJS no disponible');
  return window.XLSX;
}

export async function cargarTesseract() {
  if (!window.Tesseract) await cargarScript(CDN.tesseract);
  if (!window.Tesseract) throw new Error('tesseract.js no disponible');
  return window.Tesseract;
}
