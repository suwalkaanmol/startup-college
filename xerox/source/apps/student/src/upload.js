// Uploads to the private bucket with real progress (XHR exposes upload progress; supabase-js does not).
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase.js';

function send(token, path, file, onProgress) {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${SUPABASE_URL}/storage/v1/object/print-files/${path}`);
    x.setRequestHeader('Authorization', `Bearer ${token}`);
    x.setRequestHeader('apikey', SUPABASE_KEY);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { let m = ''; try { m = JSON.parse(x.responseText).message || ''; } catch { /* body was not JSON */ } resolve({ code: x.status, message: m }); };
    x.onerror = () => resolve({ code: 0, message: 'network error during upload' });
    x.send(file);
  });
}
const explain = ({ code, message }) => (code === 0 ? message
  : code === 413 || /too large|exceed/i.test(message) ? 'the file is larger than the storage limit'
  : code === 401 || code === 403 ? 'your session expired. Reload the page and try again' : message || `server answered ${code}`);

export async function uploadWithProgress(path, file, onProgress) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await supabase.auth.getSession();
    const res = await send(data.session?.access_token, path, file, onProgress);
    if (res.code >= 200 && res.code < 300) return;
    if (attempt === 0 && (res.code === 401 || res.code === 403)) { await supabase.auth.refreshSession(); continue; } // expired session: refresh, then try once more
    throw new Error(explain(res));
  }
}
