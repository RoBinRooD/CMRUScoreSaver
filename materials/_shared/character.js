/*
 * character.js — เอนจินวาดตัวละคร 2D แบบเวกเตอร์ (SVG) สำหรับสื่อ ARTD2303
 * ตัวละครเป็นแบบ flat มีเส้นขอบ แยกชิ้นส่วน (หัว ลำตัว แขน ขา) แต่ละชิ้นมี data-pivot
 * ให้สัปดาห์ 4, 5, 8, 10 นำไปขยับต่อได้ · ตัวละครทั้งหมดออกแบบใหม่เพื่อการสอน
 *
 * ค่าตัวละคร (c): { base, per, theme, shape, heads, pal, name, likes, dislikes, stats }
 *   เก็บในเครื่องที่ localStorage key "artd2303.character" — สัปดาห์อื่นอ่านค่านี้มาแสดงตัวละครเดียวกัน
 *
 * Character.svg(c, opts)        → <svg> ตัวละครเต็มตัว (viewBox 0 0 200 280)
 *   opts.view    'front' | 'side' | 'back'
 *   opts.expr    'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'sleepy' | 'shy' (ไม่ใส่ = ตามบุคลิก)
 *   opts.sil     เงาดำ · opts.plain ไม่มีจุดเด่น (ตัวทั่วไป) · opts.sketch แบบเส้นร่าง
 *   opts.armL / opts.armR / opts.armSide  องศาการหมุนแขนจากหัวไหล่ (+ = ตามเข็มนาฬิกา)
 *   opts.crop 'head' ครอปเฉพาะหัว
 * Character.turnaround(c, {guides, sil, wrong}) → <svg> หน้า·ข้าง·หลัง
 * Character.geo(c), Character.faceAnchors(c, view) → ตำแหน่งสำหรับวาดเส้นไกด์/ชี้ส่วนต่าง ๆ
 */
(function () {
  'use strict';
  const INK = '#2b2433', SIL = '#25262c', SKETCH = '#6a6570', PAPER = '#fbfaf7';
  const KEY = 'artd2303.character';

  const BASES = {
    'เห็ด': { feat: 'หมวกเห็ด', kind: 'cap' },
    'แมว': { feat: 'ฮู้ดหูแมวและหาง', kind: 'cat' },
    'กระต่าย': { feat: 'ฮู้ดหูกระต่ายยาว', kind: 'rabbit' },
    'ช้าง': { feat: 'หูใหญ่และงวง', kind: 'elephant' },
    'ก้อนเมฆ': { feat: 'ฮู้ดก้อนเมฆฟู ๆ', kind: 'cloud' },
    'ลูกชิ้นปิ้ง': { feat: 'ลูกชิ้นเสียบไม้บนหัว', kind: 'skewer' }
  };
  const PERS = {
    'ขี้เซา': { story: 'ชอบหลับในที่แปลก ๆ', expr: 'sleepy', shape: 'triangle' },
    'ขี้อาย': { story: 'ซ่อนหน้าเวลามีคนมอง', expr: 'shy', shape: 'circle' },
    'จอมซ่า': { story: 'ชอบลองของใหม่ไม่กลัวพัง', expr: 'happy', shape: 'vtri' },
    'ขี้บ่น': { story: 'บ่นทุกอย่างแต่ช่วยทุกครั้ง', expr: 'angry', shape: 'square' },
    'ใจดี': { story: 'แบ่งของให้ทุกคน', expr: 'happy', shape: 'circle' },
    'ขี้ตกใจ': { story: 'สะดุ้งได้ทุกเสียง', expr: 'surprised', shape: 'circle' }
  };
  const THEMES = {
    'ฤดูฝน': { pal: { cap: '#6f9bff', spot: '#e3efff', face: '#ffe2c6', body: '#f2c94c', acc: '#6f9bff', leg: '#3d5a99' }, keys: 'ร่ม รองเท้าบูท หยดน้ำ' },
    'ยี่เป็ง': { pal: { cap: '#ff9f43', spot: '#ffd36e', face: '#ffe6cf', body: '#3c3a7a', acc: '#ffd36e', leg: '#2d2b55' }, keys: 'โคม เทียน ผ้าทอ' },
    'ตลาดนัด': { pal: { cap: '#e25b5b', spot: '#ffd166', face: '#ffe2c6', body: '#7fd6d0', acc: '#ffd166', leg: '#4fb3a9' }, keys: 'ถุงผ้า ป้ายราคา ร่มผ้าใบ' },
    'นักบินอวกาศ': { pal: { cap: '#e9e4ff', spot: '#ef8a80', face: '#ffe9d9', body: '#dcd8f5', acc: '#ef8a80', leg: '#3c3a7a' }, keys: 'หมวกกันน็อก ดาว ยาน' },
    'สายมู': { pal: { cap: '#f2c14e', spot: '#ffffff', face: '#ffe6cf', body: '#a3264a', acc: '#f2c14e', leg: '#5e1530' }, keys: 'ด้ายแดง ดอกดาวเรือง พวงมาลัย' },
    'ไซเบอร์พังก์': { pal: { cap: '#ff4fa3', spot: '#5ee6ff', face: '#ffe2d0', body: '#2b2945', acc: '#5ee6ff', leg: '#1d1b2e' }, keys: 'ไฟนีออน แว่นไซเบอร์ สายไฟ' }
  };
  const ALT_PALS = [
    { n: 'เห็ดแดง', cap: '#e25b5b', spot: '#fff4e0', face: '#ffe2c6', body: '#8b7cf8', acc: '#f2b866', leg: '#5a4bd1' },
    { n: 'มัทฉะ', cap: '#7fae6b', spot: '#f3f7e8', face: '#ffe6cf', body: '#f3e2c4', acc: '#c0704f', leg: '#a8875f' },
    { n: 'ลูกกวาด', cap: '#ff8fb8', spot: '#ffffff', face: '#fff0e4', body: '#7fd6d0', acc: '#ffd166', leg: '#4fb3a9' }
  ];
  const SHAPES = {
    circle: { sym: '●', th: 'วงกลม' },
    square: { sym: '■', th: 'สี่เหลี่ยม' },
    triangle: { sym: '▲', th: 'สามเหลี่ยม' },
    vtri: { sym: '▼', th: 'สามเหลี่ยมกลับหัว' }
  };
  // สีหน้า: [key, ชื่อ, คิ้ว, ตา, ปาก]
  const EXPRS = [
    ['neutral', 'ปกติ', 'โค้งสบาย ๆ', 'กลม เปิดปกติ', 'ยิ้มบาง ๆ'],
    ['happy', 'ดีใจ', 'ยกขึ้น', 'ปิดเป็นรูปโค้ง ^ ^', 'เปิดกว้าง แก้มแดงขึ้น'],
    ['sad', 'เศร้า', 'หัวคิ้วยกขึ้น หางคิ้วตก', 'เล็กลง มีน้ำตา', 'มุมปากตกลง'],
    ['angry', 'โกรธ', 'หัวคิ้วกดลงเป็นตัว V', 'ครึ่งบนหายไป ดูหรี่', 'เม้มแบน มีสัญลักษณ์โกรธ'],
    ['surprised', 'ตกใจ', 'ยกสูงมาก', 'เบิกกว้าง เห็นตาขาว', 'เปิดเป็นรูปตัว O มีเหงื่อ'],
    ['sleepy', 'ง่วง', 'ต่ำ ผ่อนคลาย', 'ปิดเป็นเส้นโค้งลง', 'เล็ก ๆ มีตัว z ลอย']
  ];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const f = (n) => Math.round(n * 10) / 10;
  const pt = (p) => f(p[0]) + ' ' + f(p[1]);
  const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function defaults() {
    return { base: 'เห็ด', per: 'ขี้เซา', theme: 'ฤดูฝน', shape: 'circle', heads: 2.2, pal: null, name: '', likes: '', dislikes: '', stats: [4, 3, 2] };
  }
  function normalize(c) {
    const d = defaults();
    c = c && typeof c === 'object' ? c : {};
    const o = {
      base: BASES[c.base] ? c.base : d.base,
      per: PERS[c.per] ? c.per : d.per,
      theme: THEMES[c.theme] ? c.theme : d.theme,
      shape: SHAPES[c.shape] ? c.shape : d.shape,
      heads: clamp(Number(c.heads) || d.heads, 1.5, 5),
      pal: null,
      name: typeof c.name === 'string' ? c.name.slice(0, 40) : '',
      likes: typeof c.likes === 'string' ? c.likes.slice(0, 80) : '',
      dislikes: typeof c.dislikes === 'string' ? c.dislikes.slice(0, 80) : '',
      stats: Array.isArray(c.stats) && c.stats.length === 3 ? c.stats.map((v) => clamp(Math.round(Number(v) || 1), 1, 5)) : d.stats.slice()
    };
    if (c.pal && ['cap', 'spot', 'face', 'body', 'acc', 'leg'].every((k) => isHex(c.pal[k]))) {
      o.pal = { n: typeof c.pal.n === 'string' ? c.pal.n.slice(0, 30) : 'กำหนดเอง', cap: c.pal.cap, spot: c.pal.spot, face: c.pal.face, body: c.pal.body, acc: c.pal.acc, leg: c.pal.leg };
    }
    return o;
  }
  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return defaults(); }
  }
  function save(c) {
    try { localStorage.setItem(KEY, JSON.stringify(normalize(c))); return true; } catch (e) { return false; }
  }
  const conceptName = (c) => c.base + c.per;
  const displayName = (c) => (c.name && c.name.trim()) || conceptName(c);
  function palettes(c) {
    return [Object.assign({ n: 'ธีม' + c.theme }, THEMES[c.theme].pal), ...ALT_PALS];
  }
  function palette(c) { return c.pal || palettes(c)[0]; }

  /* ---------- geometry ---------- */
  function geo(c) {
    const heads = clamp(Number(c.heads) || 2.2, 1.5, 5);
    const G = 266, T = 58, H = G - T, cx = 100;
    const hh = H / heads, hw = Math.min(hh * 0.98, 144);
    const rx = hw / 2, ry = hh / 2, cy = T + ry;
    const R = H - hh;
    const legH = R * clamp(0.3 + (heads - 1.5) * 0.06, 0.3, 0.5);
    const hipY = G - legH, y0 = T + hh * 0.93, bodyH = hipY - y0;
    const bw = clamp(hw * (0.72 + (heads - 1.5) * 0.16), 30, 96);
    const sh = { circle: 0.44, square: 0.5, triangle: 0.34, vtri: 0.58 }[c.shape] * bw;
    const hip = { circle: 0.36, square: 0.5, triangle: 0.56, vtri: 0.3 }[c.shape] * bw;
    const armW = clamp(bw * 0.2, 8, 15), lw = clamp(bw * 0.25, 9, 19);
    const es = clamp(rx * 0.13, 3.2, 11);
    return {
      heads, G, T, H, cx, cy, hh, hw, rx, ry, R, legH, hipY, y0, bodyH, bw, sh, hip, armW, lw, es,
      armLen: bodyH * 0.8 + legH * 0.28,
      shoeH: clamp(lw * 0.75, 6, 13),
      legX: Math.max(lw * 0.62, hip * 0.5),
      eyeY: cy + ry * 0.1, ex: rx * 0.4, my: cy + ry * 0.47
    };
  }

  // โพลีกอนมุมมน: r เป็นตัวเลขหรืออาร์เรย์ (ต่อมุม)
  function rpoly(pts, r) {
    const n = pts.length;
    let d = '';
    const toward = (p, q, rr) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, k = Math.min(rr, L / 2) / L; return [p[0] + dx * k, p[1] + dy * k]; };
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], rr = Array.isArray(r) ? r[i] : r;
      d += (i ? 'L' : 'M') + pt(toward(p1, p0, rr)) + 'Q' + pt(p1) + ' ' + pt(toward(p1, p2, rr));
    }
    return d + 'Z';
  }
  const ellipseD = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;

  // รูปทรงหัวตาม shape language
  function headD(shape, cx, cy, rx, ry) {
    if (shape === 'square') return rpoly([[cx - rx, cy - ry], [cx + rx, cy - ry], [cx + rx, cy + ry], [cx - rx, cy + ry]], Math.min(rx, ry) * 0.5);
    if (shape === 'triangle') return rpoly([[cx - rx * 0.72, cy - ry], [cx + rx * 0.72, cy - ry], [cx + rx * 1.04, cy + ry], [cx - rx * 1.04, cy + ry]], [ry * 0.8, ry * 0.8, ry * 0.55, ry * 0.55]);
    if (shape === 'vtri') return rpoly([[cx - rx * 1.04, cy - ry], [cx + rx * 1.04, cy - ry], [cx + rx * 0.56, cy + ry], [cx - rx * 0.56, cy + ry]], [ry * 0.6, ry * 0.6, ry * 0.7, ry * 0.7]);
    return ellipseD(cx, cy, rx, ry);
  }
  // ลำตัว: hw = ครึ่งความกว้าง
  function bodyD(shape, cx, y0, y1, hw) {
    const h = y1 - y0;
    if (shape === 'square') return rpoly([[cx - hw, y0], [cx + hw, y0], [cx + hw, y1], [cx - hw, y1]], Math.min(hw * 2, h) * 0.22);
    if (shape === 'triangle') return rpoly([[cx - hw * 0.62, y0], [cx + hw * 0.62, y0], [cx + hw * 1.12, y1], [cx - hw * 1.12, y1]], [h * 0.3, h * 0.3, h * 0.22, h * 0.22]);
    if (shape === 'vtri') return rpoly([[cx - hw * 1.16, y0], [cx + hw * 1.16, y0], [cx + hw * 0.6, y1], [cx - hw * 0.6, y1]], [h * 0.25, h * 0.25, h * 0.3, h * 0.3]);
    return ellipseD(cx, (y0 + y1) / 2, hw, h / 2 + 3);
  }

  /* ---------- drawing ---------- */
  function draw(c, o) {
    o = o || {};
    c = normalize(c);
    const g = geo(c), view = o.view || 'front', sil = !!o.sil, sk = !!o.sketch && !sil;
    const P0 = palette(c);
    const kind = o.plain ? 'none' : BASES[c.base].kind;
    const P = Object.assign({}, P0, kind === 'elephant' ? { face: '#c9cbd6' } : {});
    const ink = sil ? SIL : sk ? SKETCH : INK;
    const ow = o.ow || 2.6;
    const fill = (col) => (sil ? SIL : sk ? PAPER : col);
    const st = `stroke="${ink}" stroke-width="${ow}" stroke-linejoin="round" stroke-linecap="round"`;
    const path = (d, col, extra) => `<path d="${d}" fill="${fill(col)}" ${st}${extra ? ' ' + extra : ''}/>`;
    const tube = (d, col, w) => sil
      ? `<path d="${d}" fill="none" stroke="${SIL}" stroke-width="${f(w + ow * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${f(w + ow * 2)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fill(col)}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // วงกลมหลายวงรวมเป็นก้อนเดียว (ไม่มีเส้นขอบตรงรอยต่อ)
    const blob = (cs, col) => cs.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r + ow / 2)}" fill="${ink}"/>`).join('') + cs.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r - ow / 2)}" fill="${fill(col)}"/>`).join('');
    const side = view === 'side', back = view === 'back';
    const { cx, cy, rx, ry, G, hipY, y0, bodyH, bw, lw, armW } = g;
    const hrx = side ? rx * 0.92 : rx;
    const depth = bw * 0.72;
    // ฮู้ด (แมว กระต่าย)
    const hood = { cx: side ? cx - rx * 0.12 : cx, cy: cy - ry * 0.05, rx: (side ? hrx * 1.12 : rx * 1.16), ry: ry * 1.09 };
    const hoodTop = (x) => hood.cy - hood.ry * Math.sqrt(Math.max(0, 1 - Math.pow((x - hood.cx) / hood.rx, 2)));

    let tail = '', legs = '', body = '', arms = '', head = '';

    /* --- legs --- */
    const legOne = (x, toe) => {
      const top = hipY - 6, bot = G - g.shoeH * 0.5;
      return `<rect x="${f(x - lw / 2)}" y="${f(top)}" width="${f(lw)}" height="${f(Math.max(4, bot - top))}" rx="${f(lw * 0.4)}" fill="${fill(P.leg)}" ${st}/>`
        + `<ellipse cx="${f(x + toe)}" cy="${f(G - g.shoeH / 2)}" rx="${f(lw * 0.8)}" ry="${f(g.shoeH / 2)}" fill="${fill(P.acc)}" ${st}/>`;
    };
    if (side) {
      legs = `<g class="ch-legL" data-pivot="${f(cx - lw * 0.3)} ${f(hipY)}">${legOne(cx - lw * 0.3, lw * 0.35)}</g><g class="ch-legR" data-pivot="${f(cx + lw * 0.3)} ${f(hipY)}">${legOne(cx + lw * 0.3, lw * 0.35)}</g>`;
    } else {
      legs = [-1, 1].map((s) => `<g class="ch-leg${s < 0 ? 'L' : 'R'}" data-pivot="${f(cx + s * g.legX)} ${f(hipY)}">${legOne(cx + s * g.legX, s * lw * 0.18)}</g>`).join('');
    }

    /* --- body --- */
    if (side) {
      body = path(bodyD(c.shape, cx, y0, hipY, depth / 2), P.body);
      if (!sil && !sk) body += `<path d="M${f(cx + depth * 0.05)} ${f(y0)}Q${f(cx + depth * 0.32)} ${f(y0 + Math.min(bodyH * 0.3, 14))} ${f(cx + depth * 0.44)} ${f(y0 + 1)}Z" fill="${P.acc}" ${st}/>`;
    } else {
      body = path(bodyD(c.shape, cx, y0, hipY, bw / 2), P.body);
      if (!sil && !sk && !back) {
        const w = Math.min(bw * 0.25, rx * 0.55), h = Math.min(bodyH * 0.3, 15);
        body += `<path d="M${f(cx - w)} ${f(y0)}Q${f(cx)} ${f(y0 + h * 2)} ${f(cx + w)} ${f(y0)}Z" fill="${P.acc}" ${st}/>`;
        body += `<circle cx="${f(cx + bw * 0.2)}" cy="${f(y0 + bodyH * 0.58)}" r="${f(clamp(bw * 0.07, 2.5, 6))}" fill="${P.spot}" ${st}/>`;
      }
    }

    /* --- arms --- */
    const armOne = (sx, sy, ang, cls, bend) => {
      const L = g.armLen, d = `M${f(sx)} ${f(sy)}Q${f(sx + bend)} ${f(sy + L / 2)} ${f(sx)} ${f(sy + L)}`;
      return `<g class="${cls}" data-pivot="${f(sx)} ${f(sy)}" transform="rotate(${f(ang)} ${f(sx)} ${f(sy)})">${tube(d, P.body, armW)}<circle cx="${f(sx)}" cy="${f(sy + L)}" r="${f(armW * 0.62)}" fill="${fill(P.face)}" ${st}/></g>`;
    };
    const sy = y0 + armW * 0.6 + (c.shape === 'circle' ? bodyH * 0.06 : 0);
    if (side) {
      arms = armOne(cx + depth * 0.04, sy, o.armSide != null ? o.armSide : -6, 'ch-armR', armW * 0.2);
    } else {
      const ang = (s) => (s < 0 ? (o.armL != null ? o.armL : 12) : (o.armR != null ? o.armR : -12));
      arms = [-1, 1].map((s) => armOne(cx + s * (g.sh - armW * 0.35), sy, ang(s), s < 0 ? 'ch-armL' : 'ch-armR', s * armW * 0.25)).join('');
    }

    /* --- tail --- */
    if (kind === 'cat') {
      const tw = lw * 0.55;
      if (side) tail = tube(`M${f(cx - depth * 0.4)} ${f(hipY - 6)}Q${f(cx - depth * 0.4 - 28)} ${f(hipY - 2)} ${f(cx - depth * 0.4 - 22)} ${f(hipY - 34)}`, P.cap, tw);
      else if (back) tail = tube(`M${f(cx)} ${f(hipY - 8)}Q${f(cx + 26)} ${f(hipY - 4)} ${f(cx + 24)} ${f(hipY - 36)}`, P.cap, tw);
      else tail = tube(`M${f(cx + g.hip * 0.6)} ${f(hipY - 6)}Q${f(cx + bw / 2 + 24)} ${f(hipY)} ${f(cx + bw / 2 + 18)} ${f(hipY - 32)}`, P.cap, tw);
    }
    if (kind === 'rabbit' && (side || back)) {
      const r = clamp(lw * 0.75, 6, 13);
      tail = side ? `<circle cx="${f(cx - depth / 2)}" cy="${f(hipY - 9)}" r="${f(r)}" fill="${fill(P.spot)}" ${st}/>` : '';
    }

    /* --- head --- */
    const headShape = path(headD(c.shape, cx, cy, hrx, ry), kind === 'cloud' && back ? P.spot : P.face);
    let behind = '', over = '', after = '';
    if (kind === 'cat' || kind === 'rabbit') {
      if (kind === 'cat') {
        const eh = Math.min(ry * 0.62, 34);
        const ear = (a, b, tip, inner) => {
          let s = path(rpoly([a, tip, b], [2, 3, 2]), P.cap);
          if (inner && !sil && !sk) {
            const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k = 0.55;
            const ia = [m[0] + (a[0] - m[0]) * k, m[1] + (a[1] - m[1]) * k + 3], ib = [m[0] + (b[0] - m[0]) * k, m[1] + (b[1] - m[1]) * k + 3], it = [tip[0] + (m[0] - tip[0]) * 0.3, tip[1] + (m[1] - tip[1]) * 0.3];
            s += `<path d="${rpoly([ia, it, ib], 2)}" fill="${P.spot}"/>`;
          }
          return s;
        };
        if (side) {
          const xa = hood.cx - hood.rx * 0.45, xb = hood.cx + hood.rx * 0.2;
          behind += ear([xa, hoodTop(xa) + 6], [xb, hoodTop(xb) + 6], [hood.cx - hood.rx * 0.2, hood.cy - hood.ry - eh], true);
        } else {
          [-1, 1].forEach((s) => {
            const xa = hood.cx + s * hood.rx * 0.88, xb = hood.cx + s * hood.rx * 0.22;
            behind += ear([xa, hoodTop(xa) + 8], [xb, hoodTop(xb) + 6], [hood.cx + s * hood.rx * 0.72, hood.cy - hood.ry - eh * 0.55], !back);
          });
        }
      } else {
        const el = Math.min(ry * 0.9, 46), ew = Math.max(rx * 0.17, 7);
        const ear = (x, ang, inner) => {
          const ecy = hood.cy - hood.ry * 0.85 - el * 0.5;
          let s = `<g transform="rotate(${ang} ${f(x)} ${f(hood.cy - hood.ry * 0.7)})">` + path(ellipseD(x, ecy, ew, el * 0.55), P.cap);
          if (inner && !sil && !sk) s += `<path d="${ellipseD(x, ecy + el * 0.06, ew * 0.5, el * 0.4)}" fill="${P.spot}"/>`;
          return s + '</g>';
        };
        if (side) behind += ear(hood.cx - hood.rx * 0.05, -16, true);
        else [-1, 1].forEach((s) => { behind += ear(hood.cx + s * hood.rx * 0.36, s * 10, !back); });
      }
      if (back) over += path(headD(c.shape, hood.cx, hood.cy, hood.rx, hood.ry), P.cap);
      else behind += path(headD(c.shape, hood.cx, hood.cy, hood.rx, hood.ry), P.cap);
    }
    if (kind === 'elephant') {
      const er = Math.min(rx * 0.5, 26);
      const earE = (x, y, sx) => path(ellipseD(x, y, er * sx, er * 1.15), P.face) + (sil || sk || back ? '' : `<path d="${ellipseD(x, y + 2, er * sx * 0.58, er * 0.75)}" fill="#f3b6c4"/>`);
      if (side) after += earE(cx - hrx * 0.22, cy - ry * 0.02, 0.72);
      else if (back) over += [-1, 1].map((s) => earE(cx + s * rx * 0.92, cy - ry * 0.05, 1)).join('');
      else behind += [-1, 1].map((s) => earE(cx + s * rx * 0.95, cy - ry * 0.05, 1)).join('');
      const tw = Math.max(rx * 0.2, 6);
      if (side) after += tube(`M${f(cx + hrx * 0.8)} ${f(cy + ry * 0.12)}Q${f(cx + hrx * 1.28)} ${f(cy + ry * 0.25)} ${f(cx + hrx * 1.18)} ${f(cy + ry * 0.72)}`, P.face, tw);
    }
    if (kind === 'cloud') {
      const br = Math.max(rx, ry) * 0.36, hcx = side ? cx - rx * 0.15 : cx;
      const angs = back ? [150, 190, 230, 270, 310, 350, 30] : [160, 200, 236, 270, 304, 340, 20];
      const cs = angs.map((a) => { const t = a * Math.PI / 180; return [hcx + Math.cos(t) * hrx * 0.92, cy - ry * 0.05 + Math.sin(t) * ry * 0.92, br]; });
      behind += blob(cs, P.spot);
      if (back) over += blob(cs.concat([[cx, cy + ry * 0.1, Math.min(rx, ry) * 0.7]]), P.spot);
    }
    if (kind === 'skewer') {
      const sh = Math.min(ry * 1.0, 46), x0 = cx + rx * 0.08, y0s = cy - ry * 0.7, x1 = cx + rx * 0.25, y1 = cy - ry - sh;
      let s = tube(`M${f(x0)} ${f(y0s)}L${f(x1)} ${f(y1)}`, '#c99a5b', 3.2);
      const br = Math.min(rx * 0.21, 12);
      [0.42, 0.66, 0.9].forEach((t) => {
        const x = x0 + (x1 - x0) * t, y = y0s + (y1 - y0s) * t;
        s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(br)}" fill="${fill(P.cap)}" ${st}/>`;
        if (!sil && !sk) s += `<circle cx="${f(x - br * 0.35)}" cy="${f(y - br * 0.35)}" r="${f(br * 0.28)}" fill="#fff" opacity=".55"/>`;
      });
      behind += s;
    }
    if (kind === 'cap') {
      const W = rx * 1.32, mid = side ? cx - rx * 0.06 : cx, base = cy - ry * (back ? 0.05 : 0.22), top = cy - ry * 1.38, Hc = base - top;
      let s = path(`M${f(mid - W)} ${f(base)}Q${f(mid - W)} ${f(top)} ${f(mid)} ${f(top)}Q${f(mid + W)} ${f(top)} ${f(mid + W)} ${f(base)}Q${f(mid)} ${f(base + ry * 0.24)} ${f(mid - W)} ${f(base)}Z`, P.cap);
      if (!sil && !sk) {
        [[-0.52, 0.42, 0.13], [0.04, 0.2, 0.11], [0.56, 0.44, 0.1]].forEach(([dx, dy, r]) => {
          s += `<circle cx="${f(mid + dx * W)}" cy="${f(top + dy * Hc + (Math.abs(dx) > 0.3 ? Hc * 0.08 : 0))}" r="${f(r * W)}" fill="${P.spot}"/>`;
        });
      }
      over += s;
    }

    /* --- face --- */
    let faceS = '';
    if (!sil && !back) {
      let expr = o.expr || PERS[c.per].expr;
      if (!EXPRS.some((e) => e[0] === expr) && expr !== 'shy') expr = 'neutral';
      faceS = face(g, expr, side, kind, ink, sk, c);
      if (kind === 'elephant' && !side) {
        const tw = Math.max(rx * 0.17, 5.5), es = g.es;
        faceS = faceS.replace('<!--trunk-->', tube(`M${f(cx)} ${f(g.eyeY + es * 0.5)}C${f(cx)} ${f(g.eyeY + es * 3)} ${f(cx - es * 0.4)} ${f(cy + ry * 0.5)} ${f(cx + es * 1.3)} ${f(cy + ry * 0.46)}`, P.face, tw));
      }
    }
    let guides = '';
    if (sk) {
      guides = `<g stroke="#6fa8ff" stroke-width="1.2" stroke-dasharray="4 3" fill="none" opacity=".9"><path d="M${f(side ? cx + hrx * 0.3 : cx)} ${f(cy - ry)}V${f(cy + ry)}"/><path d="M${f(cx - hrx)} ${f(g.eyeY)}H${f(cx + hrx)}"/></g>`;
    }

    // หน้าอยู่บนสุด (หมวกเห็ดไม่บังคิ้ว) · ด้านหลังไม่มีหน้า
    head = behind + headShape + after + over + `<g class="ch-face">${faceS}</g>` + guides;
    const neck = g.T + g.hh;
    return `<g class="ch" data-view="${view}">`
      + (back ? '' : `<g class="ch-tail">${tail}</g>`)
      + `<g class="ch-legs">${legs}</g>`
      + `<g class="ch-body" data-pivot="${f(cx)} ${f(hipY)}">${body}</g>`
      + (back ? `<g class="ch-tail">${tail}${kind === 'rabbit' ? `<circle cx="${f(cx)}" cy="${f(hipY - 8)}" r="${f(clamp(lw * 0.75, 6, 13))}" fill="${fill(P.spot)}" ${st}/>` : ''}</g>` : '')
      + `<g class="ch-arms">${arms}</g>`
      + `<g class="ch-head" data-pivot="${f(cx)} ${f(neck)}">${head}</g>`
      + '</g>';
  }

  function face(g, expr, side, kind, ink, sk, c) {
    const { cx, cy, rx, ry, es } = g;
    const hrx = side ? rx * 0.92 : rx;
    const eyes = side ? [[cx + hrx * 0.45, 1]] : [[cx - g.ex, 1], [cx + g.ex, -1]];
    const mx = side ? cx + hrx * 0.68 : cx;
    const ey = g.eyeY, my = kind === 'elephant' && !side ? cy + ry * 0.74 : g.my;
    const mouthFill = sk ? 'none' : '#7a3b3b';
    const sw = (k) => `stroke="${ink}" stroke-width="${f(es * k)}" stroke-linecap="round" stroke-linejoin="round"`;
    const B = { neutral: [0, 0, 0.35], happy: [-0.5, -0.2, 0.5], sad: [-0.2, -0.9, 0], angry: [0.35, 1, -0.1], surprised: [-1, 0, 0.6], sleepy: [0.35, 0, 0.1], shy: [-0.2, -0.45, 0.3] }[expr];
    let s = '';
    // แก้ม
    const blushA = { neutral: 0.35, happy: 0.55, sad: 0.2, angry: 0.3, surprised: 0.2, sleepy: 0.3, shy: 0.85 }[expr];
    const blushR = es * (expr === 'shy' ? 1.45 : 1.1);
    if (!sk) (side ? [cx + hrx * 0.25] : [cx - rx * 0.62, cx + rx * 0.62]).forEach((x) => { s += `<ellipse cx="${f(x)}" cy="${f(cy + ry * 0.36)}" rx="${f(blushR)}" ry="${f(blushR * 0.7)}" fill="${expr === 'angry' ? '#ff6b6b' : '#ff8fa3'}" opacity="${blushA}"/>`; });
    // ตา + คิ้ว
    let eyeS = '';
    eyes.forEach(([x, inner]) => {
      const by = ey - es * 2.1 + es * B[0];
      const ox = x - inner * es * 1.1, ix = x + inner * es * 1.1;
      s += `<path d="M${f(ox)} ${f(by)}Q${f(x)} ${f(by - es * B[2] - es * B[1] * 0.35)} ${f(ix)} ${f(by + es * B[1] * 0.75)}" fill="none" ${sw(0.45)}/>`;
      const hl = (dx, dy, r) => (sk ? '' : `<circle cx="${f(x + dx)}" cy="${f(ey + dy)}" r="${f(r)}" fill="#fff"/>`);
      if (expr === 'happy') eyeS += `<path d="M${f(x - es)} ${f(ey + es * 0.25)}Q${f(x)} ${f(ey - es * 1.05)} ${f(x + es)} ${f(ey + es * 0.25)}" fill="none" ${sw(0.5)}/>`;
      else if (expr === 'sleepy') eyeS += `<path d="M${f(x - es)} ${f(ey)}Q${f(x)} ${f(ey + es * 0.75)} ${f(x + es)} ${f(ey)}" fill="none" ${sw(0.5)}/>`;
      else if (expr === 'angry') eyeS += `<path d="M${f(x - es * 0.85)} ${f(ey - es * 0.2)}A${f(es * 0.85)} ${f(es * 0.9)} 0 0 0 ${f(x + es * 0.85)} ${f(ey - es * 0.2)}Z" fill="${sk ? 'none' : ink}" ${sw(0.2)}/>` + hl(es * 0.2, es * 0.15, es * 0.22);
      else if (expr === 'surprised') eyeS += `<circle cx="${f(x)}" cy="${f(ey)}" r="${f(es * 1.15)}" fill="#fff" ${sw(0.3)}/><circle cx="${f(x)}" cy="${f(ey + es * 0.1)}" r="${f(es * 0.52)}" fill="${sk ? 'none' : ink}" ${sw(0.15)}/>`;
      else {
        const sad = expr === 'sad', shy = expr === 'shy';
        eyeS += `<ellipse cx="${f(x)}" cy="${f(ey + (sad ? es * 0.15 : 0) + (shy ? es * 0.2 : 0))}" rx="${f(es * (sad ? 0.7 : 0.78))}" ry="${f(es * (sad ? 0.85 : 1))}" fill="${sk ? 'none' : ink}" ${sw(0.15)}/>` + hl(es * 0.25, -es * 0.3 + (shy ? es * 0.25 : 0), es * 0.3);
      }
    });
    s += `<g class="ch-eyes">${eyeS}</g>`;
    s += '<!--trunk-->';
    // ปาก
    const mw = side ? 0.7 : 1;
    let m = '';
    if (expr === 'happy') m = `<path d="M${f(mx - es * 1.5 * mw)} ${f(my - es * 0.2)}Q${f(mx)} ${f(my + es * 2.4)} ${f(mx + es * 1.5 * mw)} ${f(my - es * 0.2)}Z" fill="${mouthFill}" ${sw(0.3)}/>` + (sk ? '' : `<ellipse cx="${f(mx)}" cy="${f(my + es * 0.75)}" rx="${f(es * 0.6 * mw)}" ry="${f(es * 0.32)}" fill="#ef8a80"/>`);
    else if (expr === 'sad') m = `<path d="M${f(mx - es * mw)} ${f(my + es * 0.6)}Q${f(mx)} ${f(my - es * 0.5)} ${f(mx + es * mw)} ${f(my + es * 0.6)}" fill="none" ${sw(0.42)}/>`;
    else if (expr === 'angry') m = `<path d="M${f(mx - es * 1.3 * mw)} ${f(my + es * 0.45)}Q${f(mx)} ${f(my - es * 0.3)} ${f(mx + es * 1.3 * mw)} ${f(my + es * 0.45)}" fill="none" ${sw(0.5)}/>`;
    else if (expr === 'surprised') m = `<ellipse cx="${f(mx)}" cy="${f(my + es * 0.3)}" rx="${f(es * 0.7 * mw)}" ry="${f(es * 0.95)}" fill="${mouthFill}" ${sw(0.3)}/>`;
    else if (expr === 'sleepy') m = `<ellipse cx="${f(mx)}" cy="${f(my + es * 0.2)}" rx="${f(es * 0.38)}" ry="${f(es * 0.46)}" fill="${mouthFill}" ${sw(0.25)}/>`;
    else if (expr === 'shy') m = `<path d="M${f(mx - es * 0.7 * mw)} ${f(my)}Q${f(mx - es * 0.35 * mw)} ${f(my + es * 0.45)} ${f(mx)} ${f(my)}Q${f(mx + es * 0.35 * mw)} ${f(my + es * 0.45)} ${f(mx + es * 0.7 * mw)} ${f(my)}" fill="none" ${sw(0.38)}/>`;
    else m = `<path d="M${f(mx - es * mw)} ${f(my)}Q${f(mx)} ${f(my + es * 0.8)} ${f(mx + es * mw)} ${f(my)}" fill="none" ${sw(0.42)}/>`;
    s += `<g class="ch-mouth">${m}</g>`;
    // สัญลักษณ์เสริม
    if (!sk) {
      const ax = Math.min(side ? cx + hrx * 0.2 : cx + rx * 0.78, 196 - es * 4.6);
      if (expr === 'sleepy') s += `<text x="${f(ax)}" y="${f(cy - ry * 0.55)}" font-family="Prompt,sans-serif" font-weight="700" font-size="${f(es * 2.2)}" fill="#8b7cf8">z</text><text x="${f(ax + es * 1.6)}" y="${f(cy - ry * 0.55 - es * 2)}" font-family="Prompt,sans-serif" font-weight="700" font-size="${f(es * 3)}" fill="#8b7cf8">Z</text>`;
      if (expr === 'angry') {
        const k = es * 0.9, x = ax, y = cy - ry * 0.5;
        s += `<g stroke="#e2564f" stroke-width="${f(es * 0.4)}" fill="none" stroke-linecap="round">` + [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => `<path d="M${f(x + a * k)} ${f(y + b * k * 0.3)}Q${f(x + a * k * 0.3)} ${f(y + b * k * 0.3)} ${f(x + a * k * 0.3)} ${f(y + b * k)}"/>`).join('') + '</g>';
      }
      if (expr === 'surprised') { const x = ax, y = cy - ry * 0.3; s += `<path d="M${f(x)} ${f(y - es * 1.4)}Q${f(x + es * 0.9)} ${f(y)} ${f(x)} ${f(y + es * 0.3)}Q${f(x - es * 0.9)} ${f(y)} ${f(x)} ${f(y - es * 1.4)}Z" fill="#9ed8ff" stroke="${ink}" stroke-width="1.2"/>`; }
      if (expr === 'sad') { const [x] = eyes[eyes.length - 1]; s += `<path d="M${f(x + es * 0.5)} ${f(ey + es * 0.9)}Q${f(x + es * 1.2)} ${f(ey + es * 2.2)} ${f(x + es * 0.5)} ${f(ey + es * 2.3)}Q${f(x - es * 0.2)} ${f(ey + es * 2.2)} ${f(x + es * 0.5)} ${f(ey + es * 0.9)}Z" fill="#9ed8ff" stroke="${ink}" stroke-width="1"/>`; }
    }
    return s;
  }

  /* ตำแหน่งคิ้ว ตา ปาก (ใช้ชี้ใน expression sheet) */
  function faceAnchors(c, view) {
    const g = geo(normalize(c)), side = view === 'side', hrx = side ? g.rx * 0.92 : g.rx;
    const x = side ? g.cx + hrx * 0.45 : g.cx + g.ex;
    const my = BASES[normalize(c).base].kind === 'elephant' && !side ? g.cy + g.ry * 0.74 : g.my;
    return { brow: [x, g.eyeY - g.es * 2.2], eye: [x, g.eyeY], mouth: [side ? g.cx + hrx * 0.68 : g.cx, my + g.es * 0.3], es: g.es };
  }

  function featureTop(c) {
    const g = geo(c), k = BASES[c.base].kind;
    const hood = { cy: g.cy - g.ry * 0.05, ry: g.ry * 1.09 };
    if (k === 'cap') return g.cy - g.ry * 1.38;
    if (k === 'cat') return hood.cy - hood.ry - Math.min(g.ry * 0.62, 34) * 0.55;
    if (k === 'rabbit') { const el = Math.min(g.ry * 0.9, 46); return hood.cy - hood.ry * 0.85 - el * 1.05; }
    if (k === 'cloud') return g.cy - g.ry * 0.97 - Math.max(g.rx, g.ry) * 0.36;
    if (k === 'skewer') return g.cy - g.ry - Math.min(g.ry, 46) - Math.min(g.rx * 0.21, 12);
    return g.T;
  }

  function headBox(c) {
    const g = geo(c);
    const top = Math.min(featureTop(c), g.T) - 8, bot = g.T + g.hh + 8, h = bot - top;
    const w = Math.max(h, g.rx * 3.1);
    return [f(g.cx - w / 2), f(top), f(w), f(h)].join(' ');
  }

  function svg(c, o) {
    o = o || {};
    c = normalize(c);
    const g = geo(c);
    const vb = o.crop === 'head' ? headBox(c) : '0 0 200 280';
    const shadow = o.crop === 'head' || o.noShadow ? '' : `<ellipse cx="100" cy="${g.G + 3}" rx="${f(g.bw * 0.7 + g.lw)}" ry="5" fill="#000" opacity="${o.sil ? 0.18 : 0.12}"/>`;
    return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"${o.cls ? ` class="${o.cls}"` : ''} role="img" aria-label="${esc(o.label || displayName(c))}">${shadow}${draw(c, o)}${o.extra || ''}</svg>`;
  }

  function guides(c) {
    c = normalize(c);
    const g = geo(c);
    const out = [];
    if (BASES[c.base].kind !== 'none') out.push([featureTop(c), 'จุดเด่น']);
    out.push([g.T, 'ยอดหัว'], [g.eyeY, 'ตา'], [g.T + g.hh, 'คาง'], [g.hipY, 'สะโพก'], [g.G, 'เท้า']);
    return out;
  }

  /* turnaround หน้า · ข้าง · หลัง */
  function turnaround(c, o) {
    o = o || {};
    c = normalize(c);
    const W = 680, Hh = 310;
    const views = [['front', 'หน้า', 10, 1, 0], ['side', 'ข้าง', 220, o.wrong ? 0.88 : 1, 0], ['back', 'หลัง', 430, o.wrong ? 1.08 : 1, o.wrong ? -14 : 0]];
    let s = `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="turnaround ${esc(displayName(c))}">`;
    views.forEach(([v, label, x, k, dy]) => {
      const tr = `translate(${x} ${dy}) translate(100 ${266 * (1 - k)}) scale(${k}) translate(-100 0)`;
      s += `<g transform="${tr}"><ellipse cx="100" cy="269" rx="${f(geo(c).bw * 0.7 + geo(c).lw)}" ry="5" fill="#000" opacity=".1"/>${draw(c, { view: v, sil: o.sil, expr: 'neutral' })}</g>`;
      s += `<text x="${x + 100}" y="${Hh - 10}" text-anchor="middle" font-family="Prompt,'Noto Sans Thai',sans-serif" font-size="15" font-weight="600" fill="#6b6660">${label}</text>`;
    });
    if (o.guides) {
      s += '<g font-family="Prompt,\'Noto Sans Thai\',sans-serif" font-size="11" fill="#d0685e" text-anchor="end">';
      let lastY = -99;
      guides(c).forEach(([y, l]) => {
        const lab = y - lastY < 13 ? '' : l; lastY = y; s += `<line x1="0" x2="${W - 46}" y1="${f(y)}" y2="${f(y)}" stroke="#ef8a80" stroke-width="1.2" stroke-dasharray="5 4"/><text x="${W - 4}" y="${f(y + 4)}">${lab}</text>`; });
      s += '</g>';
    }
    if (o.wrong) s += `<text x="${W / 2}" y="22" text-anchor="middle" font-family="Prompt,'Noto Sans Thai',sans-serif" font-size="15" font-weight="700" fill="#e2564f">✕ ขนาดและระดับไม่เท่ากัน เส้นไกด์ไม่ตรง</text>`;
    return s + '</svg>';
  }

  /* สุ่มแบบร่างหลายแบบจากคอนเซปต์เดียวกัน (รูปทรง สัดส่วน ชุดสี) */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function variants(c, n, seed) {
    c = normalize(c);
    const r = rng(seed);
    const keys = Object.keys(SHAPES);
    const shapes = keys.concat(keys).slice(0, Math.max(n, 4));
    for (let i = shapes.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shapes[i], shapes[j]] = [shapes[j], shapes[i]]; }
    const pals = palettes(c);
    return Array.from({ length: n }, (_, i) => Object.assign({}, c, {
      shape: shapes[i],
      heads: Math.round((1.6 + r() * 2.2) * 10) / 10,
      pal: Object.assign({}, pals[Math.floor(r() * pals.length)])
    }));
  }

  window.Character = {
    BASES, PERS, THEMES, ALT_PALS, SHAPES, EXPRS, KEY,
    defaults, normalize, load, save, palettes, palette, conceptName, displayName,
    geo, svg, draw, turnaround, guides, faceAnchors, headBox, variants
  };
})();
