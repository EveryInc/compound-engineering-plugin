/*
 * "What is Compound Engineering?" — the homepage explainer animation.
 *
 * Ported from the Claude Design project "Compound Engineering Explainer"
 * (ce-video.jsx on the animations-v3 engine). The site loads nothing
 * third-party, so instead of React this file carries a ~60-line patcher:
 * the whole 1920x1080 frame is a pure function of one time axis T, rebuilt
 * as a lightweight node tree each frame and patched onto the DOM by position.
 * The tree's shape never changes (absent nodes render as comment
 * placeholders), so positional patching is enough.
 *
 * Mount point: <div class="ce-explainer" data-skills="N" data-hosts="N">.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var LOGO = script ? new URL('../logo.png', script.src).href : '';

  // ── Tiny DOM patcher ──────────────────────────────────────────────────────
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var UNITLESS = { opacity: 1, zIndex: 1, fontWeight: 1, flex: 1, flexShrink: 1, lineHeight: 1 };
  var CAMEL_ATTRS = { pathLength: 1, viewBox: 1 };
  var kebab = function (s) { return s.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }); };

  function h(t, p) {
    var c = [];
    (function flat(a) {
      for (var i = 0; i < a.length; i++) Array.isArray(a[i]) ? flat(a[i]) : c.push(a[i]);
    })(Array.prototype.slice.call(arguments, 2));
    if (typeof t === 'function') return t(Object.assign({}, p, { children: c }));
    return { t: t, p: p || {}, c: c };
  }

  function kindOf(v) {
    if (v == null || v === false || v === true) return '#comment';
    if (typeof v !== 'object') return '#text';
    return v.t.toUpperCase();
  }

  function patch(parent, i, v, svg) {
    var el = parent.childNodes[i];
    var kind = kindOf(v);
    if (!el || el.nodeName.toUpperCase() !== kind) {
      var next = kind === '#comment' ? document.createComment('')
        : kind === '#text' ? document.createTextNode('')
        : (svg || v.t === 'svg') ? document.createElementNS(SVG_NS, v.t) : document.createElement(v.t);
      el ? parent.replaceChild(next, el) : parent.appendChild(next);
      el = next;
    }
    if (kind === '#comment') return;
    if (kind === '#text') {
      var s = String(v);
      if (el.data !== s) el.data = s;
      return;
    }
    var isSvg = svg || v.t === 'svg';
    var prev = el.__p || {};
    var props = v.p;
    for (var k in props) {
      if (k === 'style') {
        var st = props.style, ps = prev.style || {};
        for (var sk in st) {
          if (st[sk] === ps[sk]) continue;
          var val = typeof st[sk] === 'number' && !UNITLESS[sk] ? st[sk] + 'px' : String(st[sk]);
          el.style.setProperty(kebab(sk), val);
        }
        for (var rk in ps) if (!(rk in st)) el.style.removeProperty(kebab(rk));
      } else if (props[k] !== prev[k]) {
        var name = k === 'className' ? 'class' : isSvg && !CAMEL_ATTRS[k] ? kebab(k) : k;
        el.setAttribute(name, props[k]);
      }
    }
    el.__p = props;
    var kids = v.c;
    for (var j = 0; j < kids.length; j++) patch(el, j, kids[j], isSvg && v.t !== 'foreignObject');
    while (el.childNodes.length > kids.length) el.removeChild(el.lastChild);
  }

  // ── Motion vocabulary (from the design) ───────────────────────────────────
  var Easing = {
    easeOutCubic: function (t) { return (--t) * t * t + 1; },
    easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
    easeOutBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var prog = function (T, s, d) { return clamp((T - s) / d, 0, 1); };
  var MOTION = {
    enter: function (T, s, d) { return Easing.easeOutCubic(prog(T, s, d == null ? 0.7 : d)); },
    draw: function (T, s, d) { return Easing.easeInOutCubic(prog(T, s, d == null ? 1 : d)); },
    pop: function (T, s, d) { return Easing.easeOutBack(prog(T, s, d == null ? 0.5 : d)); },
  };
  var win = function (T, a, b, fi, fo) {
    fi = fi == null ? 0.6 : fi; fo = fo == null ? 0.5 : fo;
    return MOTION.enter(T, a, fi) * (1 - MOTION.draw(T, b - fo, fo));
  };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var C = { paper: '#1B1B1F', ink: '#DFDFD6', mute: '#98989F', line: '#2E2E32', term: '#161618', onAcc: '#111111' };
  var ACC = ['#DCEFAE', '#5C7F14'];
  var SERIF = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  var SANS = "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  var MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  var SCENES = [
    ['Debt', 5.5], ['Invert', 4.5], ['Loop', 11.5], ['Return', 5.5],
    ['Remember', 7.5], ['Ratio', 4.5], ['Outro', 5.5],
  ];
  var CUES = {}, TOTAL = 0;
  SCENES.forEach(function (s) { CUES[s[0]] = TOTAL; TOTAL += s[1]; });

  function Rise(o) {
    var fi = o.fi == null ? 0.7 : o.fi, fo = o.fo == null ? 0.5 : o.fo, dy = o.dy == null ? 28 : o.dy;
    var e = MOTION.enter(o.T, o.a, fi);
    var op = win(o.T, o.a, o.b, fi, fo);
    return h('div', { style: Object.assign({ position: 'absolute', opacity: op, transform: 'translateY(' + (1 - e) * dy + 'px)' }, o.style) }, o.children);
  }

  function Headline(o) {
    var size = o.size || 76;
    return h(Rise, { T: o.T, a: o.a, b: o.b, style: { left: o.x || 140, top: o.y || 130, width: o.width || 1700 } },
      h('div', { style: { font: '500 22px ' + MONO, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.mute, marginBottom: 18 } }, o.eyebrow),
      h('div', { style: { font: '600 ' + size + 'px/1.08 ' + SERIF, color: C.ink, letterSpacing: '-0.025em', textWrap: 'pretty' } }, o.text));
  }

  // ── 1+2. The curve: debt rises, compounding falls ─────────────────────────
  function Chart(o) {
    var T = o.T, a = CUES.Debt, inv = CUES.Invert, end = CUES.Loop + 0.6;
    var op = win(T, a + 0.3, end, 0.7, 0.8);
    var W = 1640, H = 500, n = 9;
    var p = MOTION.draw(T, a + 1.0, 3.4);
    var m = MOTION.draw(T, inv + 0.5, 1.8);
    var debt = function (t) { return 0.1 + 0.82 * (Math.pow(1.45, t) - 1) / (Math.pow(1.45, n) - 1); };
    var comp = function (t) { return 0.1 + 0.5 * Math.pow(0.7, t); };
    var f = function (t) { return lerp(debt(t), comp(t), m); };
    var X = function (t) { return 70 + t * (W - 140) / n; };
    var Y = function (v) { return H - 30 - v * (H - 60); };
    var d = '';
    for (var k = 0; k <= 90; k++) { var t = k / 10; d += (k ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(f(t)).toFixed(1); }
    var area = d + 'L' + X(n) + ' ' + (H - 30) + 'L' + X(0) + ' ' + (H - 30) + 'Z';
    var endE = MOTION.enter(T, a + 4.2, 0.6);
    var dots = [];
    for (var i = 0; i <= n; i++) {
      var s = MOTION.pop(T, a + 1.0 + (i / n) * 3.2, 0.4);
      dots.push(h('circle', { cx: X(i), cy: Y(f(i)), r: Math.max(0, 9 * s), fill: C.paper, stroke: C.ink, strokeWidth: 4 }));
    }
    return h('div', { style: { position: 'absolute', left: 140, top: 440, width: W, height: H + 60, opacity: op } },
      h('svg', { width: W, height: H, style: { position: 'absolute', left: 0, top: 0, overflow: 'visible' } },
        h('line', { x1: 40, y1: 0, x2: 40, y2: H - 30, stroke: C.line, strokeWidth: 2 }),
        h('line', { x1: 40, y1: H - 30, x2: W, y2: H - 30, stroke: C.line, strokeWidth: 2 }),
        h('path', { d: area, fill: o.acc[0], opacity: m * 0.22 }),
        h('path', { d: d, fill: 'none', stroke: C.ink, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p }),
        dots),
      h('div', { style: { position: 'absolute', left: -6, top: H / 2 - 30, transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: '0 0', font: '500 22px ' + SANS, color: C.mute, whiteSpace: 'nowrap' } }, 'Effort per change'),
      h('div', { style: { position: 'absolute', right: 0, top: H - 10, font: '500 22px ' + SANS, color: C.mute, whiteSpace: 'nowrap' } }, 'Changes over time →'),
      h('div', { style: { position: 'absolute', left: X(n) - 360, top: Y(f(n)) - 70, width: 330, textAlign: 'right', font: '500 26px ' + SANS, color: C.ink, opacity: endE } },
        h('span', { style: { opacity: 1 - m, position: 'absolute', right: 0, top: 0, whiteSpace: 'nowrap' } }, 'Next change: slower'),
        h('span', { style: { opacity: m, position: 'absolute', right: 0, top: 0, whiteSpace: 'nowrap' } }, 'Next change: easier')));
  }

  // ── 3+4. The loop and its return arrow ────────────────────────────────────
  var STEPS = [
    { k: 'Brainstorm', cmd: '/ce-brainstorm', d: 'Think the problem through. Write down the requirements.' },
    { k: 'Plan', cmd: '/ce-plan', d: 'Turn requirements into an implementation-ready plan.' },
    { k: 'Work', cmd: '/ce-work', d: 'Execute the plan. Verify and commit.' },
    { k: 'Simplify', cmd: '/ce-simplify-code', d: 'Refine the fresh code for clarity and reuse.' },
    { k: 'Review', cmd: '/ce-code-review', d: 'Multi-agent review against the plan.' },
    { k: 'Compound', cmd: '/ce-compound', d: 'Capture what you learned, so the next loop starts smarter.' },
  ];
  var CX = 960, CY = 560, R = 300, NR = 64;
  var ang = function (i) { return (-90 + i * 60) * Math.PI / 180; };
  var pt = function (a, r) { r = r == null ? R : r; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
  function arcPath(a0, a1) {
    var d = '';
    for (var k = 0; k <= 64; k++) { var q = pt(lerp(a0, a1, k / 64)); d += (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }
    return d;
  }

  function Loop(o) {
    var T = o.T, acc = o.acc, L = CUES.Loop, Rt = CUES.Return, M = CUES.Remember;
    var op = MOTION.enter(T, L + 0.1, 0.8) * (1 - MOTION.draw(T, M - 0.2, 0.7));
    var s0 = L + 2.0, step = 1.45;
    var si = function (i) { return s0 + i * step; };
    var pos = -1;
    for (var i = 0; i < 6; i++) pos += MOTION.draw(T, si(i) - 0.5, 0.5);
    pos += MOTION.draw(T, Rt + 0.7, 1.4);
    var dotA = ang(0) + (Math.max(pos, 0) * Math.PI) / 3;
    var ringP = MOTION.draw(T, L + 0.3, 1.3);
    var active = {};
    if (T >= si(0) - 0.25 && T < Rt + 0.7) active[Math.min(5, Math.round(pos))] = true;
    if (T >= Rt + 2.1) { active[0] = true; active[1] = true; }
    var z = MOTION.draw(T, Rt - 0.3, 1.6) * (1 - MOTION.draw(T, M - 0.3, 1.0));
    var sc = 1 + 0.45 * z, tx = z * (900 - 1.45 * 810), ty = z * (560 - 1.45 * 330);
    var retP = clamp(pos - 5, 0, 1);
    var card = MOTION.pop(T, Rt + 0.15, 0.5);
    var cardPt = pt(dotA, R - 140);
    var headA = ang(5) + (Math.PI / 3) * 0.78;
    var hp = pt(headA);
    var hRot = (headA * 180) / Math.PI + 90;
    var dotPt = pt(dotA);

    var ripples = [0, 1].map(function (i) {
      var e = MOTION.enter(T, Rt + 2.1 + i * 0.3, 1.0);
      var q = pt(ang(i));
      return h('circle', { cx: q[0], cy: q[1], r: NR + 60 * e, fill: 'none', stroke: acc[0], strokeWidth: 4, opacity: e > 0 ? 1 - e : 0 });
    });

    var nodes = STEPS.map(function (st, i) {
      var q = pt(ang(i)), lq = pt(ang(i), R + 158);
      var pp = MOTION.pop(T, L + 0.5 + i * 0.13, 0.5);
      var on = !!active[i];
      return [
        h('div', { style: { position: 'absolute', left: q[0] - NR, top: q[1] - NR, width: NR * 2, height: NR * 2, borderRadius: '50%', background: on ? acc[0] : C.paper, border: '3px solid ' + C.ink, boxSizing: 'border-box', transform: 'scale(' + pp * (on ? 1.1 : 1) + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 44px ' + SERIF, color: on ? C.onAcc : C.ink } }, i + 1),
        h('div', { style: { position: 'absolute', left: lq[0], top: lq[1], transform: 'translate(-50%,-50%)', textAlign: 'center', opacity: MOTION.enter(T, L + 0.7 + i * 0.13, 0.5), whiteSpace: 'nowrap' } },
          h('div', { style: { font: '600 34px/1 ' + SERIF, color: C.ink } }, st.k),
          h('div', { style: { font: '500 20px ' + MONO, color: on ? acc[0] : C.mute, marginTop: 8 } }, st.cmd)),
      ];
    });

    var centers = STEPS.map(function (st, i) {
      var b = i < 5 ? si(i + 1) : Rt + 0.4;
      var e = MOTION.enter(T, si(i), 0.45);
      return h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, opacity: win(T, si(i), b, 0.45, 0.3), transform: 'translateY(' + (1 - e) * 16 + 'px)' } },
        h('div', { style: { font: '600 64px/1 ' + SERIF, letterSpacing: '-0.02em', color: C.ink } }, st.k),
        h('div', { style: { font: '400 26px/1.35 ' + SANS, color: C.mute, textWrap: 'balance' } }, st.d));
    });

    return h('div', { style: { position: 'absolute', inset: 0, opacity: op } },
      h('div', { style: { position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + sc + ')' } },
        h('svg', { width: 1920, height: 1080, style: { position: 'absolute', inset: 0 } },
          h('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: C.line, strokeWidth: 3, pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - ringP, transform: 'rotate(-90 ' + CX + ' ' + CY + ')' }),
          pos > 0 && h('path', { d: arcPath(ang(0), ang(0) + Math.min(pos, 5) * Math.PI / 3), fill: 'none', stroke: C.ink, strokeWidth: 4, strokeLinecap: 'round' }),
          retP > 0 && h('path', { d: arcPath(ang(5), ang(5) + retP * Math.PI / 3), fill: 'none', stroke: acc[0], strokeWidth: 9, strokeLinecap: 'round' }),
          h('polygon', { points: '-14,10 0,-12 14,10', fill: acc[0], transform: 'translate(' + hp[0] + ' ' + hp[1] + ') rotate(' + hRot + ') scale(' + (retP >= 0.78 ? 1 : 0) + ')' }),
          ripples),
        pos >= -0.5 && h('div', { style: { position: 'absolute', left: dotPt[0] - 11, top: dotPt[1] - 11, width: 22, height: 22, borderRadius: '50%', background: C.ink, opacity: MOTION.enter(T, si(0) - 0.5, 0.3) * (1 - prog(T, Rt + 2.1, 0.3)) } }),
        nodes,
        h('div', { style: { position: 'absolute', left: CX - 210, top: CY - 150, width: 420, height: 300 } },
          h('div', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '500 22px ' + MONO, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.mute, opacity: win(T, L + 0.9, si(0), 0.5, 0.35) } }, 'The loop'),
          centers),
        h('div', { style: { position: 'absolute', left: cardPt[0], top: cardPt[1], transform: 'translate(-50%,-50%) scale(' + card + ')', background: C.paper, border: '3px solid ' + C.ink, borderRadius: 12, padding: '12px 18px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', whiteSpace: 'nowrap', opacity: T >= Rt ? 1 : 0 } },
          h('div', { style: { font: '500 14px ' + MONO, color: C.mute, letterSpacing: '0.06em' } }, 'docs/solutions/'),
          h('div', { style: { font: '600 20px ' + MONO, color: C.ink, marginTop: 4 } }, 'env-var-trap.md'))),
      h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 330, background: 'linear-gradient(to bottom, rgba(27,27,31,0), ' + C.paper + ' 38%)', opacity: win(T, Rt + 2.2, M + 0.2, 0.7, 0.5) } }),
      h(Headline, { T: T, a: Rt + 2.4, b: M + 0.2, eyebrow: 'Compound feeds the next brainstorm and plan', text: 'That return arrow is the whole point.', y: 860, size: 64 }));
  }

  // ── 5. Run one teaches it. Run two remembers. ─────────────────────────────
  function Term(o) {
    var T = o.T;
    var dots = [0, 1, 2].map(function () { return h('div', { style: { width: 14, height: 14, borderRadius: '50%', background: '#3A3A3A' } }); });
    var lines = o.lines.map(function (ln) {
      var text = ln.type ? ln.t.slice(0, Math.floor(ln.t.length * prog(T, ln.at, ln.dur || 0.8))) : ln.t;
      return h('div', { style: { font: (ln.b ? 600 : 400) + ' 26px/1.5 ' + MONO, color: ln.hl ? o.acc[0] : ln.dim ? '#8E897E' : '#EDEAE2', whiteSpace: 'pre', opacity: ln.type ? (T >= ln.at ? 1 : 0) : MOTION.enter(T, ln.at, 0.35), minHeight: 39 } }, text);
    });
    return h('div', { style: { position: 'absolute', left: o.x, top: o.y, width: o.w, height: o.h, background: C.term, borderRadius: 18, opacity: o.op, transform: 'translateX(' + o.dx + 'px)', overflow: 'hidden', border: '1px solid ' + C.line, boxShadow: '0 30px 60px rgba(0,0,0,0.35)' } },
      h('div', { style: { height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', borderBottom: '1px solid #2A2A2A' } },
        dots,
        h('div', { style: { font: '500 18px ' + MONO, color: '#A29D92', marginLeft: 14, whiteSpace: 'nowrap' } }, o.title)),
      h('div', { style: { padding: '28px 34px', display: 'flex', flexDirection: 'column', gap: 6 } }, lines));
  }

  function Remember(o) {
    var T = o.T, M = CUES.Remember, end = CUES.Ratio + 0.4;
    var drift = 1 + 0.025 * prog(T, M, CUES.Ratio - M);
    var l = win(T, M + 0.3, end, 0.8, 0.6), r = win(T, M + 2.4, end, 0.8, 0.6);
    return h('div', { style: { position: 'absolute', inset: 0, transform: 'scale(' + drift + ')', transformOrigin: '50% 60%' } },
      h(Headline, { T: T, a: M + 0.2, b: end, eyebrow: 'Two real sessions, 18 days apart', text: 'Run one teaches it. Run two remembers.' }),
      h(Term, { T: T, acc: o.acc, x: 140, y: 390, w: 800, h: 500, op: l, dx: (1 - MOTION.enter(T, M + 0.3, 0.8)) * -40, title: 'run 1 · day 0',
        lines: [
          { at: M + 0.9, t: '$ /ce-compound', type: true, dur: 0.6 },
          { at: M + 1.7, t: '✓ Captured 1 learning' },
          { at: M + 2.0, t: '  docs/solutions/env-var-trap.md', hl: true, b: true },
          { at: M + 2.4, t: '  Workers read env vars at boot —', dim: true },
          { at: M + 2.6, t: '  restart them after config changes.', dim: true },
        ] }),
      h(Term, { T: T, acc: o.acc, x: 980, y: 390, w: 800, h: 500, op: r, dx: (1 - MOTION.enter(T, M + 2.4, 0.8)) * 40, title: 'run 2 · day 18 · unrelated work',
        lines: [
          { at: M + 3.0, t: '$ /ce-plan add a job timeout', type: true, dur: 0.8 },
          { at: M + 4.1, t: '→ Searching docs/solutions/ …', dim: true },
          { at: M + 4.7, t: '✓ Found 1 relevant learning' },
          { at: M + 5.0, t: '  env-var-trap.md', hl: true, b: true },
          { at: M + 5.5, t: '  Plan: restart workers on deploy', dim: true },
        ] }));
  }

  // ── 6. 80 / 20 ────────────────────────────────────────────────────────────
  function Ratio(o) {
    var T = o.T, acc = o.acc, Ra = CUES.Ratio, end = CUES.Outro + 0.3;
    var op = win(T, Ra + 0.2, end, 0.6, 0.6);
    var a = MOTION.draw(T, Ra + 0.8, 1.3), b = MOTION.draw(T, Ra + 1.8, 0.8);
    var W = 1640, w80 = W * 0.8, w20 = W * 0.2 - 12;
    return h('div', { style: { position: 'absolute', inset: 0, opacity: op } },
      h(Headline, { T: T, a: Ra + 0.2, b: end, eyebrow: 'Where the effort goes', text: '80% planning and review. 20% execution.' }),
      h('div', { style: { position: 'absolute', left: 140, top: 520, width: W, height: 170, display: 'flex', gap: 12 } },
        h('div', { style: { width: w80 * a, height: '100%', background: C.ink, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 40px', boxSizing: 'border-box' } },
          h('div', { style: { font: '600 60px/1 ' + SERIF, color: C.paper, opacity: MOTION.enter(T, Ra + 1.6, 0.5), whiteSpace: 'nowrap' } }, '80%'),
          h('div', { style: { font: '500 22px ' + MONO, color: '#3C3C43', marginTop: 12, opacity: MOTION.enter(T, Ra + 1.8, 0.5), whiteSpace: 'nowrap' } }, 'brainstorm · plan · review · compound')),
        h('div', { style: { width: w20 * b, height: '100%', background: acc[0], borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px', boxSizing: 'border-box' } },
          h('div', { style: { font: '600 60px/1 ' + SERIF, color: C.onAcc, opacity: MOTION.enter(T, Ra + 2.3, 0.5), whiteSpace: 'nowrap' } }, '20%'),
          h('div', { style: { font: '500 22px ' + MONO, color: C.onAcc, marginTop: 12, opacity: MOTION.enter(T, Ra + 2.4, 0.5), whiteSpace: 'nowrap' } }, 'work'))),
      h(Rise, { T: T, a: Ra + 2.8, b: end, style: { left: 140, top: 760, font: '400 34px ' + SANS, color: C.mute, whiteSpace: 'nowrap' } }, 'The point is leverage, not ceremony.'));
  }

  // ── 7. Outro ──────────────────────────────────────────────────────────────
  function Outro(o) {
    var T = o.T, O = CUES.Outro;
    var op = MOTION.enter(T, O + 0.1, 0.6) * (1 - MOTION.draw(T, TOTAL - 0.8, 0.8));
    var drift = 1 + 0.03 * prog(T, O, TOTAL - O);
    var lg = MOTION.pop(T, O + 0.2, 0.7);
    var facts = [o.skills && o.skills + ' skills', o.hosts && o.hosts + ' agent hosts', 'github.com/EveryInc/compound-engineering-plugin'].filter(Boolean).join(' · ');
    return h('div', { style: { position: 'absolute', inset: 0, opacity: op, transform: 'scale(' + drift + ')', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' } },
      h('img', { src: LOGO, alt: '', style: { width: 170, height: 170, borderRadius: 36, transform: 'scale(' + lg + ')', marginBottom: 40 } }),
      h('div', { style: { font: '600 112px/1 ' + SERIF, letterSpacing: '-0.03em', color: C.ink, opacity: MOTION.enter(T, O + 0.5, 0.6), transform: 'translateY(' + (1 - MOTION.enter(T, O + 0.5, 0.7)) * 24 + 'px)' } }, 'Compound Engineering'),
      h('div', { style: { font: '400 34px ' + SANS, color: C.mute, marginTop: 26, opacity: MOTION.enter(T, O + 0.9, 0.6) } }, 'Each unit of engineering work should make the next one easier.'),
      h('div', { style: { font: '500 30px ' + MONO, color: C.ink, background: C.term, border: '1px solid ' + C.line, borderRadius: 14, padding: '20px 32px', marginTop: 56, opacity: MOTION.enter(T, O + 1.4, 0.6) } }, '/plugin install compound-engineering'),
      h('div', { style: { font: '500 22px ' + MONO, color: C.mute, marginTop: 40, opacity: MOTION.enter(T, O + 1.8, 0.6), letterSpacing: '0.04em' } }, facts));
  }

  function Piece(o) {
    var T = o.T, acc = ACC, D = CUES.Debt, I = CUES.Invert;
    return h('div', { style: { position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, background: C.paper, overflow: 'hidden' } },
      h(Headline, { T: T, a: D + 0.3, b: I + 0.45, eyebrow: 'Traditional development', text: 'Every change makes the next one harder.' }),
      h(Headline, { T: T, a: I + 0.55, b: CUES.Loop + 0.4, eyebrow: 'Compound engineering', text: 'Every change makes the next one easier.' }),
      h(Chart, { T: T, acc: acc }),
      h(Loop, { T: T, acc: acc }),
      h(Remember, { T: T, acc: acc }),
      h(Ratio, { T: T, acc: acc }),
      h(Outro, { T: T, skills: o.skills, hosts: o.hosts }));
  }

  // ── Player ────────────────────────────────────────────────────────────────
  // Plays while on screen, pauses when scrolled away or the tab is hidden.
  // Reduced-motion visitors get a still frame and a play button instead of
  // autoplay. The button pauses and resumes for everyone.
  function mount(root) {
    var skills = +root.getAttribute('data-skills') || 0;
    var hosts = +root.getAttribute('data-hosts') || 0;
    var stage = document.createElement('div');
    stage.className = 'ce-explainer-stage';
    stage.setAttribute('aria-hidden', 'true');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce-explainer-toggle';
    root.appendChild(stage);
    root.appendChild(btn);

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Still frame: the loop, zoomed in on the return arrow.
    var T = reduced ? CUES.Remember - 1.2 : 0;
    var wanted = !reduced, visible = false, raf = 0, last = 0;

    function render() {
      patch(stage, 0, Piece({ T: T, skills: skills, hosts: hosts }), false);
    }
    function fit() {
      var s = root.clientWidth / 1920;
      stage.firstChild && (stage.firstChild.style.transform = 'scale(' + s + ')');
    }
    function frame(ts) {
      if (last) T = (T + Math.min(0.1, (ts - last) / 1000)) % TOTAL;
      last = ts;
      render();
      fit();
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      var run = wanted && visible && !document.hidden;
      if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
      btn.setAttribute('aria-label', wanted ? 'Pause animation' : 'Play animation');
      btn.setAttribute('data-state', wanted ? 'playing' : 'paused');
    }

    btn.addEventListener('click', function () { wanted = !wanted; sync(); });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }, { threshold: 0.2 }).observe(root);
    } else {
      visible = true;
    }
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(root);
    else window.addEventListener('resize', fit);

    render();
    fit();
    sync();
  }

  var roots = document.querySelectorAll('.ce-explainer');
  for (var i = 0; i < roots.length; i++) mount(roots[i]);
})();
