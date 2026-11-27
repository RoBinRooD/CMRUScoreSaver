/*
 * CheckIn — เช็คชื่อด้วย QR
 * อาจารย์เปิดรอบเช็คชื่อ (วิชา + สัปดาห์) → จอแสดง QR ที่เปลี่ยนรหัสทุก 15 วินาที
 * นักศึกษาสแกนด้วยกล้องมือถือ → เข้าเว็บ → ระบบลง "มา" (หรือ "สาย" ถ้าเกินเวลาที่ตั้ง)
 * ปิดรอบ → คนที่ยังว่างในสัปดาห์นั้น = "ขาด" (คนที่มีใบลาอนุมัติแล้วเป็น "ลา" อยู่แล้ว ไม่ถูกแตะ)
 *
 * รอบที่เปิดอยู่เก็บในแท็บ Settings คีย์ checkin:<รหัสวิชา> (JSON) — ไม่ต้องรัน setup เพิ่ม
 * รหัสใน QR = hash(secret, วิชา, ช่วงเวลา) ถ่ายรูป QR ส่งต่อให้เพื่อนได้ไม่นาน เพราะหมดอายุภายใน ~2 นาที
 */

var CHECKIN_SLOT_MS = 15000;
var CHECKIN_GRACE_SLOTS = 8;            // รับรหัสย้อนหลังได้ 8 ช่วง (~2 นาที) เผื่อเวลาล็อกอิน/เน็ตช้า
var CHECKIN_MAX_HOURS = 4;              // ลืมปิด → สแกนไม่ได้หลังเปิดไว้ 4 ชม. (ยังกดปิดเพื่อลง "ขาด" ได้)
var CHECKIN_AHEAD_SLOTS = 8;            // ส่งรหัสล่วงหน้าให้จออาจารย์ ~2 นาที จะได้ไม่ต้องถามเซิร์ฟเวอร์ทุก 15 วิ

function checkinKey_(code) {
  return 'checkin:' + code;
}

function checkinRow_(code) {
  return find_(rows_('Settings'), function (r) { return r.key === checkinKey_(code); });
}

function checkinSession_(code) {
  var r = checkinRow_(code);
  return r ? parseJson_(r.value, null) : null;
}

function saveCheckinSession_(code, s) {
  var r = checkinRow_(code);
  if (r) {
    r.value = JSON.stringify(s);
    update_('Settings', r);
  } else {
    insert_('Settings', { key: checkinKey_(code), value: JSON.stringify(s) });
  }
}

function checkinSlot_(atMs) {
  return Math.floor(atMs / CHECKIN_SLOT_MS);
}

function checkinHash_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function checkinCode_(s, courseCode, slot) {
  return checkinHash_(s.secret + ':' + courseCode + ':' + s.week + ':' + slot).slice(0, 10);
}

function checkinExpired_(s, atMs) {
  return atMs - new Date(s.openedAt).getTime() > CHECKIN_MAX_HOURS * 3600000;
}

/** สิ่งที่จออาจารย์ต้องใช้: รหัสช่วงปัจจุบันและล่วงหน้า + ใครเช็คแล้ว */
function checkinView_(code, s) {
  if (!s) return { open: false };
  var nowMs = new Date(now_()).getTime();
  var slot = checkinSlot_(nowMs);
  var codes = [];
  for (var i = 0; i < CHECKIN_AHEAD_SLOTS; i++) codes.push({ slot: slot + i, code: checkinCode_(s, code, slot + i) });
  var names = {};
  rosterOf_(code).forEach(function (r) { names[r.studentId] = r.name; });
  var scans = Object.keys(s.scans || {}).map(function (id) {
    return { studentId: id, name: names[id] || '', at: s.scans[id].at, mark: s.scans[id].mark };
  }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  return {
    open: true,
    week: s.week,
    openedAt: s.openedAt,
    lateAfterMin: s.lateAfterMin,
    expired: checkinExpired_(s, nowMs),
    serverNow: now_(),
    slotMs: CHECKIN_SLOT_MS,
    codes: codes,
    scans: scans,
    roster: rosterOf_(code).length
  };
}

/* ---------- อาจารย์ ---------- */

function apiOpenCheckIn_(user, p) {
  requireCourseTeacher_(user, p.courseCode);
  var week = Number(p.week);
  if (!(week >= 1 && week <= Grade.WEEKS && week === Math.floor(week))) throw new Error('สัปดาห์ไม่ถูกต้อง');
  var late = Number(p.lateAfterMin);
  if (!(late >= 0 && late <= 240 && late === Math.floor(late))) throw new Error('นาทีที่นับว่าสายต้องเป็นจำนวนเต็ม 0–240 (0 = ไม่นับสาย)');
  var cur = checkinSession_(p.courseCode);
  if (cur && !checkinExpired_(cur, new Date(now_()).getTime())) {
    throw new Error('มีรอบเช็คชื่อสัปดาห์ ' + cur.week + ' เปิดอยู่ — ปิดรอบเดิมก่อน');
  }
  var s = { week: week, openedAt: now_(), lateAfterMin: late, secret: uid_('K') + Math.random().toString(36).slice(2), scans: {} };
  saveCheckinSession_(p.courseCode, s);
  return checkinView_(p.courseCode, s);
}

function apiCheckInStatus_(user, p) {
  requireCourseTeacher_(user, p.courseCode);
  return checkinView_(p.courseCode, checkinSession_(p.courseCode));
}

/** ปิดรอบ: markAbsent = true → ช่องที่ยังว่างในสัปดาห์นั้นเป็น "ขาด" */
function apiCloseCheckIn_(user, p) {
  var course = requireCourseTeacher_(user, p.courseCode);
  var s = checkinSession_(p.courseCode);
  if (!s) throw new Error('ไม่มีรอบเช็คชื่อที่เปิดอยู่');
  var absent = 0;
  if (p.markAbsent) {
    var key = 'w' + s.week;
    var rows = rows_('Attendance');
    rosterOf_(p.courseCode).forEach(function (st) {
      var r = find_(rows, function (x) { return x.courseCode === p.courseCode && x.studentId === st.studentId; });
      if (!r) {
        r = { courseCode: p.courseCode, studentId: st.studentId };
        for (var w = 1; w <= Grade.WEEKS; w++) r['w' + w] = '';
        rows.push(r);
      }
      if (!r[key]) { r[key] = 'A'; absent++; }
    });
    saveAll_('Attendance');
  }
  remove_('Settings', function (r) { return r.key === checkinKey_(p.courseCode); });
  _cache.settings = null;
  return { week: s.week, checkedIn: Object.keys(s.scans || {}).length, absent: absent, heldWeeks: updateHeldWeeks_(course) };
}

/* ---------- นักศึกษา ---------- */

/** { courseCode, slot, code } จาก QR — ตรวจรหัสก่อนเข้าคิว lock เพื่อไม่ให้คนสแกนพร้อมกันรอนาน */
function apiCheckIn_(user, p) {
  requireStudent_(user);
  var code = str_(p.courseCode, 20);
  checkEnrolled_(user, code);
  rateLimit_('ci_' + user.email, 30, 600, 'ลองบ่อยเกินไป กรุณารอสักครู่')();
  var arrivedMs = new Date(now_()).getTime();
  var s = checkinSession_(code);
  if (!s) throw new Error('ยังไม่เปิดเช็คชื่อ หรืออาจารย์ปิดรอบไปแล้ว');
  if (checkinExpired_(s, arrivedMs)) throw new Error('รอบเช็คชื่อนี้หมดเวลาแล้ว');
  var slot = Number(p.slot);
  var cur = checkinSlot_(arrivedMs);
  if (!(slot === Math.floor(slot) && slot <= cur + 1 && slot >= cur - CHECKIN_GRACE_SLOTS) ||
      String(p.code || '') !== checkinCode_(s, code, slot)) {
    throw new Error('QR หมดอายุหรือไม่ถูกต้อง — สแกน QR บนจออีกครั้ง');
  }
  var late = s.lateAfterMin > 0 && arrivedMs - new Date(s.openedAt).getTime() > s.lateAfterMin * 60000;
  var at = new Date(arrivedMs).toISOString();

  return withLock_(function () {
    resetCache_();
    var fresh = checkinSession_(code);
    if (!fresh || fresh.secret !== s.secret) throw new Error('อาจารย์ปิดรอบเช็คชื่อไปแล้ว');
    var key = 'w' + fresh.week;
    var r = find_(rows_('Attendance'), function (x) { return x.courseCode === code && x.studentId === user.studentId; });
    if (!r) {
      r = { courseCode: code, studentId: user.studentId };
      for (var w = 1; w <= Grade.WEEKS; w++) r['w' + w] = '';
      rows_('Attendance').push(r);
    }
    var already = r[key] === 'P' || r[key] === 'L';
    if (!already) {
      r[key] = late ? 'L' : 'P';
      update_('Attendance', r);
      fresh.scans = fresh.scans || {};
      fresh.scans[user.studentId] = { at: at, mark: r[key] };
      saveCheckinSession_(code, fresh);
      updateHeldWeeks_(courseRow_(code));
    }
    return { courseCode: code, week: fresh.week, mark: r[key], already: already, at: already && fresh.scans[user.studentId] ? fresh.scans[user.studentId].at : at };
  });
}
