// Draws every printed sheet of a PDF inside the app (no new tab, so nothing is blocked by pop-up blockers).
import { useEffect, useRef, useState } from 'react';
export function SheetViewer({ bytes, maxSheets = 20, gray = false }) {
  const box = useRef(null), [state, setState] = useState('loading');
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        box.current.replaceChildren();
        for (let i = 1; i <= Math.min(doc.numPages, maxSheets); i++) {
          const page = await doc.getPage(i), vp = page.getViewport({ scale: 320 / page.getViewport({ scale: 1 }).width });
          const c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height; c.className = 'pvc';
          c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Sheet ${i} of ${doc.numPages}`);
          box.current.appendChild(c);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          if (dead) return;
        }
        if (!dead) setState('ready');
      } catch { if (!dead) setState('failed'); }
    })();
    return () => { dead = true; };
  }, [bytes, maxSheets]);
  return <>{state === 'loading' && <p className="sub" role="status">Preparing preview…</p>}
    {state === 'failed' && <p role="alert" className="err">Could not show this preview.</p>}<div ref={box} style={{ filter: gray ? 'grayscale(1)' : 'none' }} /></>;
}
