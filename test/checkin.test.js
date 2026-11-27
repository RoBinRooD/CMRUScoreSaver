const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const C = 'DEMO2303';
const S1 = '69000101@demo.ac.th'; // สมัครแล้วในข้อมูลสาธิต
const mail = (id) => id + '@demo.ac.th';
const T0 = Date.parse('2026-11-27T09:00:00Z');
const at = (ms) => new Date(T0 + ms).toISOString();

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

function open(b, extra = {}) {
  b.setNow(at(0));
  return b.ok(T, 'openCheckIn', { courseCode: C, week: 9, lateAfterMin: 15, ...extra });
}

const scan = (b, email, v, i = 0) => b.call(email, 'checkIn', { courseCode: C, slot: v.codes[i].slot, code: v.codes[i].code });
const mark = (b, id, week = 9) => b.ok(T, 'getAttendance', { courseCode: C }).rows.find((r) => r.studentId === id).marks[week - 1];

test('teacher opens a round; only teachers; one round per course', () => {
  const b = loadBackend();
  assert.match(err(b, S1, 'openCheckIn', { courseCode: C, week: 9, lateAfterMin: 15 }), /เฉพาะอาจารย์/);
  assert.match(err(b, T, 'openCheckIn', { courseCode: C, week: 17, lateAfterMin: 15 }), /สัปดาห์/);
  assert.match(err(b, T, 'openCheckIn', { courseCode: C, week: 9, lateAfterMin: -1 }), /0–240/);
  const v = open(b);
  assert.equal(v.open, true);
  assert.equal(v.week, 9);
  assert.equal(v.codes.length, 8);
  assert.notEqual(v.codes[0].code, v.codes[1].code);
  assert.equal(v.codes[1].slot, v.codes[0].slot + 1);
  assert.ok(!('secret' in v));
  assert.match(err(b, T, 'openCheckIn', { courseCode: C, week: 10, lateAfterMin: 15 }), /เปิดอยู่/);
  assert.equal(b.ok(T, 'checkInStatus', { courseCode: 'DEMO3314' }).open, false);
  // ไม่เห็นในหน้าตั้งค่า
  assert.ok(!JSON.stringify(b.ok(T, 'getSettings')).includes('checkin'));
});

test('student scans: present, idempotent, late after the cutoff', () => {
  const b = loadBackend();
  const v = open(b);
  b.setNow(at(5000));
  const r = scan(b, S1, v);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.data.week, r.data.mark, r.data.already], [9, 'P', false]);
  assert.equal(mark(b, '69000101'), 'P');
  assert.equal(scan(b, S1, v).data.already, true);

  const s3 = mail('69000103');
  b.ok(s3, 'register', {});
  b.setNow(at(16 * 60000));
  const st = b.ok(T, 'checkInStatus', { courseCode: C });
  assert.equal(scan(b, s3, st).data.mark, 'L');
  // สแกนซ้ำหลังได้ "มา" แล้วไม่ถูกลดเป็น "สาย"
  assert.equal(scan(b, S1, st).data.mark, 'P');

  const live = b.ok(T, 'checkInStatus', { courseCode: C });
  assert.deepEqual(live.scans.map((x) => [x.studentId, x.mark]), [['69000103', 'L'], ['69000101', 'P']]);
  assert.ok(live.scans[0].name);
});

test('lateAfterMin 0 never marks late', () => {
  const b = loadBackend();
  open(b, { lateAfterMin: 0 });
  b.setNow(at(3 * 3600000));
  const st = b.ok(T, 'checkInStatus', { courseCode: C });
  assert.equal(scan(b, S1, st).data.mark, 'P');
});

test('codes expire, are tied to the round, and are rate limited', () => {
  const b = loadBackend();
  const v = open(b);
  // รหัสผิด / ช่วงเวลาอนาคต / หมดอายุ
  assert.match(b.call(S1, 'checkIn', { courseCode: C, slot: v.codes[0].slot, code: 'abc' }).error, /QR หมดอายุ/);
  assert.match(scan(b, S1, v, 5).error, /QR หมดอายุ/);
  b.setNow(at(3 * 60000));
  assert.match(scan(b, S1, v).error, /QR หมดอายุ/);
  // ภายใน ~2 นาทียังใช้ได้ (เผื่อเวลาล็อกอิน)
  b.setNow(at(100000));
  assert.equal(scan(b, S1, v).ok, true);

  // ปิดแล้วเปิดใหม่ → รหัสรอบเก่าใช้ไม่ได้
  b.ok(T, 'closeCheckIn', { courseCode: C });
  const s3 = mail('69000103');
  b.ok(s3, 'register', {});
  assert.match(scan(b, s3, v).error, /ยังไม่เปิด/);
  const v2 = open(b);
  b.setNow(at(1000));
  assert.match(scan(b, s3, v).error, /QR หมดอายุ/);
  assert.equal(scan(b, s3, v2).ok, true);

  for (let i = 0; i < 30; i++) b.call(s3, 'checkIn', { courseCode: C, slot: 1, code: 'x' });
  assert.match(scan(b, s3, v2).error, /บ่อยเกินไป/);
});

test('only enrolled, registered students can check in', () => {
  const b = loadBackend();
  const v = open(b);
  assert.match(scan(b, T, v).error, /เฉพาะนักศึกษา/);
  // 69000201 อยู่วิชา DEMO3314 เท่านั้น
  const other = b.ok(T, 'getAttendance', { courseCode: 'DEMO3314' }).rows[0].studentId;
  b.ok(mail(other), 'register', {});
  assert.match(scan(b, mail(other), v).error, /ไม่ได้ลงทะเบียน/);
});

test('round expires after 4 hours but can still be closed', () => {
  const b = loadBackend();
  open(b);
  b.setNow(at(4 * 3600000 + 60000));
  const st = b.ok(T, 'checkInStatus', { courseCode: C });
  assert.equal(st.expired, true);
  assert.match(scan(b, S1, st).error, /หมดเวลา/);
  // หมดเวลาแล้วเปิดรอบใหม่ได้เลย
  b.ok(T, 'openCheckIn', { courseCode: C, week: 10, lateAfterMin: 15 });
});

test('closing marks the rest absent, keeps leave and teacher marks', () => {
  const b = loadBackend();
  const v = open(b);
  b.setNow(at(1000));
  scan(b, S1, v);
  const ids = b.ok(T, 'getAttendance', { courseCode: C }).rows.map((r) => r.studentId);
  const [, a, e] = ids.filter((id) => id !== '69000101');
  b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: a, week: 9, mark: 'L' }, { studentId: e, week: 9, mark: 'E' }] });

  const res = b.ok(T, 'closeCheckIn', { courseCode: C, markAbsent: true });
  assert.equal(res.checkedIn, 1);
  assert.equal(res.absent, ids.length - 3);
  assert.ok(res.heldWeeks.includes(9));
  assert.equal(mark(b, '69000101'), 'P');
  assert.equal(mark(b, a), 'L');
  assert.equal(mark(b, e), 'E');
  assert.equal(ids.filter((id) => mark(b, id) === 'A').length, ids.length - 3);
  assert.equal(b.ok(T, 'checkInStatus', { courseCode: C }).open, false);
  assert.match(err(b, T, 'closeCheckIn', { courseCode: C }), /ไม่มีรอบ/);

  // ใบลาที่อนุมัติทีหลัง → ขาดกลายเป็นลา
  const late = ids.find((id) => mark(b, id) === 'A');
  b.ok(mail(late), 'register', {});
  const leave = b.ok(mail(late), 'submitLeave', { courseCode: C, week: 9, date: '2026-11-27', type: 'sick', reason: 'ไข้' });
  b.ok(T, 'decideLeave', { leaveId: leave.id, status: 'approved' });
  assert.equal(mark(b, late), 'E');
});

test('close without marking absent leaves blanks; a scan overrides an earlier absent mark', () => {
  const b = loadBackend();
  open(b);
  const ids = b.ok(T, 'getAttendance', { courseCode: C }).rows.map((r) => r.studentId);
  const res = b.ok(T, 'closeCheckIn', { courseCode: C, markAbsent: false });
  assert.equal(res.absent, 0);
  assert.ok(ids.every((id) => mark(b, id) === ''));

  b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '69000101', week: 9, mark: 'A' }] });
  const v = open(b);
  b.setNow(at(1000));
  assert.equal(scan(b, S1, v).data.mark, 'P');
});
