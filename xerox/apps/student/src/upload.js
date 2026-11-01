// Uploads to the private bucket with real progress (XHR exposes upload progress; supabase-js does not).
import { supabase } from './supabase.js';
export async function uploadWithProgress(path, file, onProgress) {
  const { data } = await supabase.auth.getSession();
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/print-files/${path}`);
    x.setRequestHeader('Authorization', `Bearer ${data.session.access_token}`);
    x.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      if (x.status < 300) return resolve();
      let m = ''; try { m = JSON.parse(x.responseText).message || ''; } catch { /* body was not JSON */ }
      const info = `${m} ${x.status}`;
      reject(new Error(/row-level security|unauthorized|403/i.test(info) ? 'the storage permission rule blocked it (run migration 006 in Supabase)'
        : /too large|exceed|413/i.test(info) ? 'the file is larger than the storage limit' : m || `server answered ${x.status}`));
    };
    x.onerror = () => reject(new Error('Network error during upload'));
    x.send(file);
  });
}
