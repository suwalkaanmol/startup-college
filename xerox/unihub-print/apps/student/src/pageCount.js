// Counts pages on upload. Returns null when it cannot (the student is then asked to type it).
import { PDFDocument } from 'pdf-lib';
export async function countPages(file) {
  try {
    if (file.type.startsWith('image/')) return 1;
    if (file.type === 'application/pdf') return (await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })).getPageCount();
  } catch { /* fall through to manual entry */ }
  return null; // DOCX/PPTX: server-side conversion arrives with the owner app phase
}
