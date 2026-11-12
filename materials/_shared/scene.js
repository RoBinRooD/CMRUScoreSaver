/*
 * scene.js — ฉาก 2D สำหรับสอนขนาดภาพ มุมกล้อง และ storyboard (ใช้กับ character.js)
 * โลกขนาด 1600 × 900 มีฟ้า พื้น อาคารเรียน ต้นไม้ ตัวละครยืนกลางฉาก แล้วครอปด้วย viewBox 16:9 ตามขนาดภาพ
 *
 * Scene.svg({ c, shot, angle, expr, pose, chars, vb, cls, label }) → <svg>
 *   shot  'ELS' | 'LS' | 'MS' | 'CU' | 'ECU'
 *   angle 'eye' | 'high' | 'low' | 'dutch'
 *   chars [{ c, x, view, flip, expr, armL, armR, armSide }] (ถ้าไม่ใส่ = ตัวละคร c ตัวเดียวกลางฉาก)
 */
(function () {
  'use strict';
  const W = 1600, H = 900, FY = 800, K = 1.5; // FY = ระดับเท้า, K = สเกลตัวละคร (viewBox 200×280 → 300×420)
  const SHOTS = [
    { k: 'ELS', th: 'Extreme Long Shot', short: 'ไกลมาก', use: 'เปิดเรื่อง บอกสถานที่ ตัวละครเล็กมากเมื่อเทียบกับโลก' },
    { k: 'LS', th: 'Long Shot', short: 'เต็มตัว', use: 'เห็นทั้งตัวและท่าทาง บอกว่าตัวละครทำอะไร อยู่ตรงไหน' },
    { k: 'MS', th: 'Medium Shot', short: 'ครึ่งตัว', use: 'ช็อตเล่าเรื่องหลัก เห็นมือและสีหน้าพร้อมกัน' },
    { k: 'CU', th: 'Close-up', short: 'ใกล้', use: 'เน้นอารมณ์ เห็นสีหน้าชัด คนดูรู้สึกตาม' },
    { k: 'ECU', th: 'Extreme Close-up', short: 'ใกล้มาก', use: 'เน้นรายละเอียด เช่น ดวงตา สร้างความตื่นเต้นหรือจุดหักมุม' }
  ];
  const ANGLES = [
    { k: 'eye', th: 'ระดับสายตา', feel: 'เป็นกลาง เท่ากับคนดู เหมือนคุยกันตรง ๆ' },
    { k: 'high', th: 'มุมสูง', feel: 'กล้องมองลง ตัวละครดูเล็ก อ่อนแอ หรือโดดเดี่ยว' },
    { k: 'low', th: 'มุมต่ำ', feel: 'กล้องมองขึ้น ตัวละครดูใหญ่ มีพลัง น่าเกรงขาม' },
    { k: 'dutch', th: 'มุมเอียง', feel: 'เส้นขอบฟ้าเอียง ดูไม่มั่นคง สับสน หรือตื่นเต้น' }
  ];
  const f = (n) => Math.round(n * 10) / 10;

  function bg(horizon, angle) {
    const hz = horizon, far = Math.max(0.35, Math.min(1.2, (hz + 200) / 760));
    let s = `<rect x="-900" y="-900" width="${W + 1800}" height="${hz + 900}" fill="#cfe7f7"/>`;
    s += `<rect x="-900" y="${f(hz)}" width="${W + 1800}" height="${H + 900 - hz}" fill="#d7ebc2"/>`;
    s += `<circle cx="1330" cy="${f(Math.min(hz - 120, 190))}" r="70" fill="#ffd36e"/>`;
    [[260, 140, 1], [980, 110, 0.8], [620, 210, 0.6]].forEach(([x, y, k]) => {
      const yy = Math.min(y, hz - 60);
      s += `<g fill="#fff" opacity=".9"><ellipse cx="${x}" cy="${f(yy)}" rx="${90 * k}" ry="${30 * k}"/><ellipse cx="${x - 40 * k}" cy="${f(yy + 8)}" rx="${55 * k}" ry="${24 * k}"/><ellipse cx="${x + 45 * k}" cy="${f(yy + 6)}" rx="${60 * k}" ry="${22 * k}"/></g>`;
    });
    // อาคารเรียน (ไกล)
    const bh = 300 * far, bw = 420 * far, bx = 1060, by = hz + 10 * far;
    s += `<g><rect x="${f(bx)}" y="${f(by - bh)}" width="${f(bw)}" height="${f(bh)}" fill="#f2e3cf" stroke="#c9b79e" stroke-width="3"/>`;
    s += `<path d="M${f(bx - 20 * far)} ${f(by - bh)}L${f(bx + bw / 2)} ${f(by - bh - 70 * far)}L${f(bx + bw + 20 * far)} ${f(by - bh)}Z" fill="#d97a5b"/>`;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) s += `<rect x="${f(bx + (30 + c * 95) * far)}" y="${f(by - bh + (40 + r * 80) * far)}" width="${f(50 * far)}" height="${f(46 * far)}" rx="${f(6 * far)}" fill="#8fb6d9"/>`;
    s += `<rect x="${f(bx + bw / 2 - 30 * far)}" y="${f(by - 80 * far)}" width="${f(60 * far)}" height="${f(80 * far)}" fill="#a2785b"/></g>`;
    // ต้นไม้ (ใกล้กว่า)
    const tk = far * 1.15, tx = 300, ty = hz + 70 * far;
    s += `<rect x="${f(tx - 18 * tk)}" y="${f(ty - 170 * tk)}" width="${f(36 * tk)}" height="${f(170 * tk)}" fill="#9a6b47"/><circle cx="${tx}" cy="${f(ty - 220 * tk)}" r="${f(110 * tk)}" fill="#7fbf6a"/><circle cx="${f(tx - 70 * tk)}" cy="${f(ty - 170 * tk)}" r="${f(70 * tk)}" fill="#6fae5c"/><circle cx="${f(tx + 75 * tk)}" cy="${f(ty - 175 * tk)}" r="${f(72 * tk)}" fill="#6fae5c"/>`;
    // ทางเดินแบบเปอร์สเปกทีฟ
    s += `<path d="M${f(760)} ${f(hz)}L${f(840)} ${f(hz)}L${f(1180)} ${H + 400}L${f(420)} ${H + 400}Z" fill="#efe2c8" opacity=".85"/>`;
    if (angle === 'high') for (let i = 1; i < 6; i++) { const y = hz + (H - hz) * i / 6; s += `<line x1="-900" x2="${W + 900}" y1="${f(y)}" y2="${f(y)}" stroke="#c4dcae" stroke-width="3"/>`; }
    return s;
  }

  // วางตัวละคร 1 ตัวในโลก
  function placeChar(o, scale) {
    const C = window.Character;
    const w = 200 * K * scale, h = 280 * K * scale, x0 = o.x - w / 2, y0 = FY - 266 * K * scale;
    let svg = C.svg(o.c, { view: o.view || 'front', expr: o.expr, armL: o.armL, armR: o.armR, armSide: o.armSide, cls: o.cls });
    svg = svg.replace('<svg ', `<svg x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" `);
    if (o.flip) svg = `<g transform="translate(${f(2 * o.x)} 0) scale(-1 1)">${svg}</g>`;
    // เปอร์สเปกทีฟอย่างง่าย: มุมสูง หัวใหญ่ขาสั้น · มุมต่ำ ขายาวหัวเล็ก
    if (o.angle === 'high') svg = `<g transform="translate(${f(o.x)} ${f(y0)}) scale(1.05 0.86) translate(${f(-o.x)} ${f(-y0)})">${svg}</g>`;
    if (o.angle === 'low') svg = `<g transform="translate(${f(o.x)} ${FY}) scale(0.95 1.1) translate(${f(-o.x)} ${-FY})">${svg}</g>`;
    return svg;
  }

  // ตำแหน่งสำคัญของตัวละครในโลก (ใช้คำนวณกรอบภาพ)
  function marks(c, scale, x) {
    const C = window.Character, g = C.geo(C.normalize(c)), k = K * scale, y0 = FY - 266 * k;
    const guides = C.guides(c);
    const top = Math.min(...guides.map((q) => q[0]));
    return { x, top: y0 + top * k, headTop: y0 + g.T * k, eye: y0 + g.eyeY * k, chin: y0 + (g.T + g.hh) * k, hip: y0 + g.hipY * k, feet: FY, es: g.es * k, rx: g.rx * k };
  }

  function frame(shot, m, angle) {
    // มุมสูง: เห็นพื้นเหนือหัว · มุมต่ำ: ถอยกล้องให้เห็นฟ้าเหนือหัวและเท้ายังอยู่ในภาพ
    if (angle === 'high' && shot !== 'ELS' && shot !== 'ECU') { const r = frame(shot, m); const d = r[3] * 0.16; return [r[0], r[1] - d, r[2], r[3]]; }
    if (angle === 'low' && shot !== 'ELS' && shot !== 'ECU') { const r = frame(shot, m); const h = r[3] * 1.22, w = h * 16 / 9; return [r[0] + r[2] / 2 - w / 2, r[1] + r[3] * (shot === 'LS' ? 1.08 : 1) - h, w, h]; }
    const box = (top, bottom, cx) => { let h = bottom - top, w = h * 16 / 9; if (w > W) { w = W; h = W * 9 / 16; } let y = Math.max(-40, Math.min(top, H + 40 - h)); return [cx - w / 2, y, w, h]; };
    if (shot === 'ELS') return [0, 0, W, H];
    if (shot === 'LS') return box(m.top - 60, m.feet + 70, m.x);
    if (shot === 'MS') return box(m.top - 40, m.hip + (m.feet - m.hip) * 0.12, m.x);
    if (shot === 'CU') { const t = m.top - 24, b = m.chin + (m.hip - m.chin) * 0.3; return box(t, b, m.x); }
    const h = Math.max(m.es * 7.5, 60); return [m.x - h * 8 / 9, m.eye - h * 0.5, h * 16 / 9, h];
  }

  function svg(o) {
    o = o || {};
    const shot = o.shot || 'LS', angle = o.angle || 'eye';
    const scale = angle === 'high' ? 0.8 : angle === 'low' ? 1.18 : 1;
    const chars = o.chars || [{ c: o.c, x: 800, expr: o.expr, armL: o.armL, armR: o.armR }];
    const m = marks(chars[0].c, scale, o.chars ? 800 : chars[0].x);
    const horizon = angle === 'high' ? 250 : angle === 'low' ? 860 : m.eye;
    const vb = o.vb || frame(shot, m, angle);
    let inner = bg(horizon, angle) + chars.map((ch) => placeChar(Object.assign({ angle }, ch), scale)).join('');
    if (angle === 'dutch') inner = `<g transform="rotate(-11 ${f(vb[0] + vb[2] / 2)} ${f(vb[1] + vb[3] / 2)})">${inner}</g>`;
    return `<svg viewBox="${vb.map(f).join(' ')}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"${o.cls ? ` class="${o.cls}"` : ''} role="img" aria-label="${o.label || 'ฉากตัวอย่าง'}">${inner}</svg>`;
  }

  // ภาพรวมทั้งฉาก พร้อมกรอบแสดงว่ากล้องครอปตรงไหน
  function overview(o) {
    o = o || {};
    const angle = o.angle || 'eye', scale = angle === 'high' ? 0.8 : angle === 'low' ? 1.18 : 1;
    const m = marks(o.c, scale, 800);
    const horizon = angle === 'high' ? 250 : angle === 'low' ? 860 : m.eye;
    const r = frame(o.shot || 'LS', m, angle);
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ภาพรวมฉาก">${bg(horizon, angle)}${placeChar({ c: o.c, x: 800, angle }, scale)}<path d="M-900 -900H${W + 900}V${H + 900}H-900Z M${f(r[0])} ${f(r[1])}h${f(r[2])}v${f(r[3])}h${f(-r[2])}Z" fill="#000" opacity=".35" fill-rule="evenodd"/><rect x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}" fill="none" stroke="#fff" stroke-width="10"/><rect x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}" fill="none" stroke="#8b7cf8" stroke-width="5" stroke-dasharray="24 12"/></svg>`;
  }

  window.Scene = { W, H, SHOTS, ANGLES, svg, overview };
})();
