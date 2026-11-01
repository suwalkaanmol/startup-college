// A small SMTP client (node:net + node:tls) so UniHub can email sign-in codes with no packages.
// SMTP_URL examples:
//   smtps://you%40gmail.com:app-password@smtp.gmail.com:465   (implicit TLS)
//   smtp://apikey:SG.xxxx@smtp.sendgrid.net:587               (STARTTLS)
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';

function parse(url) {
  const u = new URL(url);
  const secure = u.protocol === 'smtps:';
  return {
    host: u.hostname,
    port: Number(u.port) || (secure ? 465 : 587),
    secure,
    user: decodeURIComponent(u.username),
    pass: decodeURIComponent(u.password),
  };
}

function session(socket) {
  let buf = '';
  let waiter = null;
  const lines = [];
  const pump = () => {
    // A reply is complete when a line has "NNN " (space) after the code.
    const idx = lines.findIndex((l) => /^\d{3} /.test(l));
    if (idx === -1 || !waiter) return;
    const reply = lines.splice(0, idx + 1);
    const code = Number(reply[reply.length - 1].slice(0, 3));
    const w = waiter; waiter = null;
    w({ code, text: reply.join('\n') });
  };
  const onData = (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) !== -1) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 2); }
    pump();
  };
  socket.on('data', onData);
  const read = () => new Promise((res) => { waiter = res; pump(); });
  return {
    read,
    detach: () => socket.off('data', onData),
    async cmd(line, okCodes) {
      socket.write(line + '\r\n');
      const r = await read();
      if (!okCodes.includes(r.code)) throw new Error(`SMTP ${line.split(' ')[0]} failed: ${r.text}`);
      return r;
    },
  };
}

const connect = (opts) => new Promise((resolve, reject) => {
  const s = opts.secure
    ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host })
    : net.connect({ host: opts.host, port: opts.port });
  s.setTimeout(20000, () => s.destroy(new Error('SMTP timeout')));
  s.once(opts.secure ? 'secureConnect' : 'connect', () => resolve(s));
  s.once('error', reject);
});

const dotStuff = (text) => text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

export async function sendMail(smtpUrl, { from, to, subject, text, html }) {
  const opts = parse(smtpUrl);
  let sock = await connect(opts);
  let s = session(sock);
  try {
    let greet = await s.read();
    if (greet.code !== 220) throw new Error('SMTP greeting failed: ' + greet.text);
    const helo = os.hostname() || 'unihub.local';
    let ehlo = await s.cmd(`EHLO ${helo}`, [250]);
    if (!opts.secure && /STARTTLS/i.test(ehlo.text)) {
      await s.cmd('STARTTLS', [220]);
      s.detach();
      sock = await new Promise((resolve, reject) => {
        const t = tls.connect({ socket: sock, servername: opts.host }, () => resolve(t));
        t.once('error', reject);
      });
      s = session(sock);
      ehlo = await s.cmd(`EHLO ${helo}`, [250]);
    }
    if (opts.user) {
      const plain = Buffer.from(`\u0000${opts.user}\u0000${opts.pass}`).toString('base64');
      await s.cmd(`AUTH PLAIN ${plain}`, [235]);
    }
    const addr = (v) => (v.match(/<([^>]+)>/) || [null, v])[1];
    await s.cmd(`MAIL FROM:<${addr(from)}>`, [250]);
    await s.cmd(`RCPT TO:<${addr(to)}>`, [250, 251]);
    await s.cmd('DATA', [354]);
    const boundary = 'uh' + Date.now().toString(36);
    const msg = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${opts.host}>`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      html || text,
      `--${boundary}--`,
    ].join('\r\n');
    sock.write(dotStuff(msg) + '\r\n.\r\n');
    const sent = await s.read();
    if (sent.code !== 250) throw new Error('SMTP send failed: ' + sent.text);
    await s.cmd('QUIT', [221]).catch(() => {});
  } finally {
    sock.end();
  }
}
