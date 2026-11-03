// Loads pdf.js on demand (it's large) for page counts and print previews.
let lib;
export async function pdfjs() {
  if (!lib) {
    const m = await import('./vendor/pdfjs/pdf.js');
    lib = m.p?.default || m.p || m.default;
    lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  }
  return lib;
}
export async function openPdf(data) { const p = await pdfjs(); return p.getDocument({ data, isEvalSupported: false }).promise; }
