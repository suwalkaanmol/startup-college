/* UniHub glue for every module page. Load it first in <head>:
     <script src="../hub/web/sync.js" data-module="food" data-gate="student"></script>
   - applies the light/dark choice made in the hub profile, and passes it to the module's own theme key
   - sends signed-out students back to the hub sign-in (data-gate="student"; owner pages leave it off)
   - adds a floating "Campus Hub" button when data-back="on" (for pages without their own back link)
   - canteen staff can open food/index.html#staff without a student sign-in
   - adds a corner link when data-corner-href is set (Xerox uses it for the shop staff login) */
(function () {
  var s = document.currentScript;
  var mod = (s && s.getAttribute('data-module')) || '';
  var gate = s && s.getAttribute('data-gate') === 'student';
  var home = (s && s.getAttribute('data-home')) || '../index.html';
  var root = document.documentElement;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  var pref = get('hub_theme') || 'system';
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  var theme = dark ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  if (mod) root.setAttribute('data-unihub-module', mod);
  // Each module keeps its own key; keep them in step with the hub.
  ['food_student_theme', 'food_owner_theme', 'travel_theme', 'xerox-theme'].forEach(function (k) { set(k, theme); });

  var staff = /staff/.test(location.hash);
  if (gate && !staff && !get('hub_user')) { location.replace(home + '#signin'); return; }

  function addBack() {
    if (!mod || !(s && s.getAttribute('data-back') === 'on') || document.querySelector('.uh-back')) return;
    var a = document.createElement('a');
    a.className = 'uh-back'; a.href = home; a.textContent = '← Campus Hub';
    a.setAttribute('aria-label', 'Back to Campus Hub');
    document.body.appendChild(a);
  }
  // Optional corner button: data-corner-href + data-corner-label (e.g. the shop staff login).
  function addCorner() {
    var href = s && s.getAttribute('data-corner-href');
    if (!href || document.querySelector('.uh-corner')) return;
    var a = document.createElement('a');
    a.className = 'uh-corner' + (s.getAttribute('data-corner-side') === 'left' ? ' left' : ''); a.href = href;
    a.textContent = s.getAttribute('data-corner-label') || 'Staff login';
    document.body.appendChild(a);
  }
  function ready() { addBack(); addCorner(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
