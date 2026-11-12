/*
 * lesson.js — โครงหน้าร่วมของสื่อการสอน (ดึงมาจาก week02-infographic.html)
 * แถบบน + เมนูหัวข้อ, แถบความคืบหน้า, ปุ่มถัดไป, คีย์บอร์ด, แอนิเมชันเผยตัว
 * และตัวช่วย: Lesson.store, Lesson.checklist(), Lesson.flipCards(), Lesson.stepper(), Lesson.switcher()
 *
 * ใช้: <body data-course="ARTD2303" data-title="Character Design" data-home="index.html">
 *      แต่ละหัวข้อเป็น <section class="sec" id="..." data-nav="ชื่อในเมนู">
 * หน้าเรียก Lesson.init() เองหลังสร้างเนื้อหาเสร็จ (สคริปต์ของหน้าวางไว้ท้าย body)
 */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ค่าที่นักศึกษาปรับไว้ เก็บในเครื่อง — ใช้ไม่ได้ (โหมดส่วนตัว, ปิด cookie) ก็ทำงานต่อได้ */
  const PREFIX = 'artd2303.';
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ } }
  };

  const STAR = '<path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" fill="url(#lessonStar)"/>';
  const STAR_DEFS = '<defs><linearGradient id="lessonStar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6f9bff"/><stop offset="1" stop-color="#b38cf5"/></linearGradient></defs>';

  function chrome() {
    const b = document.body;
    if (!$('#top')) {
      const course = b.dataset.course || '';
      const title = b.dataset.title || document.title;
      const home = b.dataset.home;
      const h = document.createElement('header');
      h.id = 'top';
      h.innerHTML = `<a class="brand" ${home ? `href="${esc(home)}" title="สารบัญทุกสัปดาห์"` : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${STAR_DEFS}${STAR}</svg><span>${esc(course)}${course && title ? ' · ' : ''}${esc(title)}</span></a>`
        + '<button id="menuBtn" aria-label="สารบัญหัวข้อ" aria-expanded="false" aria-controls="navlinks">☰ สารบัญ</button><nav id="navlinks" aria-label="หัวข้อในหน้านี้"></nav>';
      b.prepend(h);
    }
    if (!$('#prog')) { const p = document.createElement('div'); p.id = 'prog'; $('#top').after(p); }
    if (!$('#nextbtn')) { const n = document.createElement('button'); n.id = 'nextbtn'; n.textContent = 'ถัดไป ↓'; n.setAttribute('aria-label', 'หัวข้อถัดไป'); b.append(n); }
  }

  let secs = [];
  function curIndex() {
    let idx = 0;
    const y = innerHeight * 0.4;
    secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= y) idx = i; });
    return idx;
  }
  function goSec(d) {
    const i = curIndex();
    const t = d > 0 ? (i >= secs.length - 1 ? 0 : i + 1) : Math.max(0, i - 1);
    secs[t].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }

  function init() {
    chrome();
    secs = $$('.sec');
    const nav = $('#navlinks');
    nav.innerHTML = '';
    secs.forEach((s) => { const a = document.createElement('a'); a.href = '#' + s.id; a.textContent = s.dataset.nav || s.id; nav.appendChild(a); });
    const links = $$('a', nav);
    const menu = $('#menuBtn');
    const setOpen = (o) => { nav.classList.toggle('open', o); menu.setAttribute('aria-expanded', String(o)); };
    menu.onclick = () => setOpen(!nav.classList.contains('open'));
    links.forEach((a) => a.addEventListener('click', () => setOpen(false)));

    if ('IntersectionObserver' in window && !reduced) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
      $$('.rv').forEach((el) => io.observe(el));
    } else {
      $$('.rv').forEach((el) => el.classList.add('in'));
    }

    const nb = $('#nextbtn');
    const prog = $('#prog');
    let last = -1;
    function onScroll() {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      prog.style.width = (max > 0 ? h.scrollTop / max * 100 : 0) + '%';
      const i = curIndex();
      if (i === last) return;
      last = i;
      links.forEach((a, k) => a.classList.toggle('on', k === i));
      const l = links[i];
      if (l && !nav.classList.contains('open') && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: l.offsetLeft - nav.clientWidth / 2 + l.clientWidth / 2, behavior: reduced ? 'auto' : 'smooth' });
      const end = i >= secs.length - 1;
      nb.textContent = end ? 'กลับด้านบน ↑' : 'ถัดไป ↓';
      nb.classList.toggle('top', end);
    }
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { last = -1; onScroll(); });
    onScroll();
    nb.onclick = () => goSec(1);

    addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.matches('input,textarea,select,[contenteditable],[contenteditable] *') || e.altKey || e.ctrlKey || e.metaKey)) return;
      // ปุ่มที่โฟกัสอยู่ใช้ Space กดตัวเอง ไม่ใช่เลื่อนหัวข้อ
      if (e.key === ' ' && t && t.matches('button,a,[role=button]')) return;
      if (['ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); goSec(1); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); goSec(-1); }
    });
  }

  /* เช็กลิสต์ติ๊กได้ พร้อมแถบความคืบหน้า · key = เก็บสถานะในเครื่อง */
  function checklist(el, items, opts) {
    opts = opts || {};
    const saved = opts.key ? store.get(opts.key, []) : [];
    el.innerHTML = '';
    const list = document.createElement('div');
    items.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chk' + (saved[i] ? ' on' : '');
      b.setAttribute('aria-pressed', String(!!saved[i]));
      b.innerHTML = `<span class="cb" aria-hidden="true"></span><span>${c}</span>`;
      b.onclick = () => { const on = b.classList.toggle('on'); b.setAttribute('aria-pressed', String(on)); upd(true); };
      list.appendChild(b);
    });
    const bar = document.createElement('div');
    bar.innerHTML = `<div class="chkbar"><div class="track"><div class="fill" style="width:0"></div></div><span class="small"></span></div><p class="chkdone">${opts.done || 'พร้อมส่งแล้ว 🎉'}</p>`;
    el.append(list, bar);
    function upd(save) {
      const states = $$('.chk', list).map((b) => b.classList.contains('on'));
      const n = states.filter(Boolean).length;
      $('.fill', bar).style.width = (n / items.length * 100) + '%';
      $('.small', bar).textContent = `${n}/${items.length}`;
      $('.chkdone', bar).classList.toggle('on', n === items.length);
      if (save && opts.key) store.set(opts.key, states);
      if (opts.onChange) opts.onChange(n, items.length);
    }
    upd(false);
    return { count: () => $$('.chk.on', list).length };
  }

  /* การ์ดพลิก: items = [[หน้า, หลัง], ...] */
  function flipCards(el, items) {
    el.classList.add('flips');
    el.innerHTML = '';
    items.forEach((m) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'flip';
      d.setAttribute('aria-pressed', 'false');
      d.innerHTML = `<div class="in2"><div class="f"><h3 style="font-size:20px"><span class="x">✕</span> ${m[0]}</h3><p class="small" style="margin-top:8px">แตะเพื่อดูวิธีแก้</p></div><div class="b"><h3 style="font-size:19px"><span class="ok">✓</span> ${m[1]}</h3></div></div>`;
      d.onclick = () => d.setAttribute('aria-pressed', String(d.classList.toggle('on')));
      el.appendChild(d);
    });
  }

  /* ปุ่มขั้นตอน 1-2-3: steps = [{label, render(bodyEl)}] */
  function stepper(btnsEl, bodyEl, steps, start) {
    btnsEl.classList.add('steps');
    btnsEl.innerHTML = '';
    const show = (i) => {
      $$('button', btnsEl).forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('done', k < i); b.setAttribute('aria-pressed', String(k === i)); });
      steps[i].render(bodyEl, i);
    };
    steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="n">${i + 1}</span>${s.label}`;
      b.onclick = () => show(i);
      btnsEl.appendChild(b);
    });
    show(start || 0);
    return show;
  }

  /* ปุ่มสลับ (.switch หรือ .seg-btns): เรียก onChange(value, button) เมื่อกด */
  function switcher(el, onChange, initial) {
    const btns = $$('button', el);
    const set = (v) => {
      btns.forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      onChange(v, btns.find((b) => b.dataset.v === v));
    };
    btns.forEach((b) => { b.type = 'button'; b.onclick = () => set(b.dataset.v); });
    if (initial != null) set(initial);
    return set;
  }

  /* เล่นแอนิเมชันในกล่องซ้ำ (ใช้กับ .ani) */
  function replay(el) { el.classList.remove('ani'); void el.offsetWidth; el.classList.add('ani'); }

  window.Lesson = { init, store, checklist, flipCards, stepper, switcher, replay, reduced, esc, $, $$ };
})();
