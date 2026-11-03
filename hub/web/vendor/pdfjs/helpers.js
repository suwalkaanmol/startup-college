// The two bundler helpers pdf.js 3.11.174 (Mozilla, Apache-2.0) needs from the Xerox team's old build.
export function a(x) { return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x.default : x; }
export function g(n) {
  if (n.__esModule) return n;
  const f = n.default; let out;
  if (typeof f === 'function') {
    out = function wrapped(...args) { return this instanceof wrapped ? Reflect.construct(f, args, this.constructor) : f.apply(this, args); };
    out.prototype = f.prototype;
  } else out = {};
  Object.defineProperty(out, '__esModule', { value: true });
  for (const k of Object.keys(n)) { const d = Object.getOwnPropertyDescriptor(n, k); Object.defineProperty(out, k, d.get ? d : { enumerable: true, get: () => n[k] }); }
  return out;
}
