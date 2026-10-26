const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const ORIGIN = 'http://localhost:8080';
const S = '69000101@demo.ac.th'; // สมัครแล้ว · DEMO2303 · มาเรียนสัปดาห์ 1–2
const base = { courseCode: 'DEMO2303', week: 5, date: '2026-11-20', type: 'sick', reason: 'ไข้หวัด' };

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

const marks = (b, id) => b.ok(T, 'getAttendance', { courseCode: 'DEMO2303' }).rows.find((r) => r.studentId === id).marks;

test('student submits a leave request; validated; one per week', () => {
  const b = loadBackend();
  assert.match(err(b, S, 'submitLeave', { ...base, week: 17 }), /สัปดาห์ 1–16/);
  assert.match(err(b, S, 'submitLeave', { ...base, date: '' }), /วันที่/);
  assert.match(err(b, S, 'submitLeave', { ...base, type: 'holiday' }), /ประเภท/);
  assert.match(err(b, S, 'submitLeave', { ...base, reason: ' ' }), /เหตุผล/);
  assert.match(err(b, S, 'submitLeave', { ...base, courseCode: 'DEMO3314' }), /ไม่ได้ลงทะเบียน/);
  assert.match(err(b, T, 'submitLeave', base), /เฉพาะนักศึกษา/);

  const v = b.ok(S, 'submitLeave', base);
  assert.equal(v.status, 'pending');
  assert.equal(v.typeLabel, 'ลาป่วย');
  assert.equal(v.week, 5);
  assert.match(err(b, S, 'submitLeave', base), /มีใบลาสัปดาห์ที่ 5 อยู่แล้ว/);
  assert.deepEqual(b.ok(S, 'myLeaves', { courseCode: 'DEMO2303' }).map((x) => x.id), [v.id]);
  // นักศึกษาคนอื่นไม่เห็น
  b.ok('69000103@demo.ac.th', 'register', {});
  assert.equal(b.ok('69000103@demo.ac.th', 'myLeaves', { courseCode: 'DEMO2303' }).length, 0);
});

test('attachments: owner only, shared with the student, limits', () => {
  const b = loadBackend();
  const v = b.ok(S, 'submitLeave', base);
  const start = { leaveId: v.id, fileName: 'ใบรับรองแพทย์.jpg', mimeType: 'image/jpeg', size: 300000, origin: ORIGIN };
  assert.match(err(b, S, 'startLeaveUpload', { ...start, size: 25 * 1024 * 1024 }), /20 MB/);
  b.ok('69000103@demo.ac.th', 'register', {});
  assert.match(err(b, '69000103@demo.ac.th', 'startLeaveUpload', start), /ไม่พบใบลา/);

  const fileId = b.ok(S, 'startLeaveUpload', start).uploadUrl.replace('demo-upload://', '');
  const f = b.db()._files[fileId];
  assert.match(f.name, /^สัปดาห์ 5 - /);
  const done = b.ok(S, 'finalizeLeaveUpload', { leaveId: v.id, fileId });
  assert.equal(done.files.length, 1);
  assert.deepEqual([...f.shared], [S]);
  assert.equal(b.ok(T, 'listLeaves', { courseCode: 'DEMO2303' }).find((x) => x.id === v.id).files.length, 1);

  // ยกเลิก → ไฟล์ไปถังขยะ
  b.ok(S, 'cancelLeave', { leaveId: v.id });
  assert.equal(f.trashed, true);
  assert.equal(b.ok(S, 'myLeaves', { courseCode: 'DEMO2303' }).length, 0);
});

test('approve marks the week as leave; reversing restores the old mark', () => {
  const b = loadBackend();
  // สัปดาห์ 2 เช็คชื่อแล้ว (69000104 ขาด) — ใบลาในข้อมูลตัวอย่าง V1
  assert.equal(marks(b, '69000104')[1], 'A');
  const list = b.ok(T, 'listLeaves', { courseCode: 'DEMO2303' });
  assert.equal(list[0].status, 'pending');
  assert.equal(b.ok(T, 'teacherDashboard', { courseCode: 'DEMO2303' }).counts.pendingLeaves, 1);

  const ok = b.ok(T, 'decideLeave', { leaveId: 'V1', status: 'approved', note: 'หายไวๆ' });
  assert.equal(ok.status, 'approved');
  assert.ok(ok.decidedAt);
  assert.equal(marks(b, '69000104')[1], 'E');
  assert.equal(b.ok(T, 'teacherDashboard', { courseCode: 'DEMO2303' }).counts.pendingLeaves, 0);
  // ลา = ได้คะแนนเข้าเรียน (ค่าเริ่มต้น E = 1)
  const st = b.ok(T, 'gradebook', { courseCode: 'DEMO2303' }).students.find((s) => s.studentId === '69000104');
  assert.equal(st.result.parts.attendance.pct, 100);

  // อนุมัติซ้ำไม่ทับเครื่องหมายเดิมที่จำไว้
  b.ok(T, 'decideLeave', { leaveId: 'V1', status: 'approved' });
  b.ok(T, 'decideLeave', { leaveId: 'V1', status: 'rejected', note: 'ไม่มีใบรับรอง' });
  assert.equal(marks(b, '69000104')[1], 'A', 'back to absent');

  // นักศึกษาเห็นผลและความเห็น · ยกเลิก/แนบไฟล์หลังพิจารณาไม่ได้
  b.ok(T, 'setStudentEmail', { studentId: '69000104', email: '69000104@demo.ac.th' });
  const mine = b.ok('69000104@demo.ac.th', 'myLeaves', { courseCode: 'DEMO2303' })[0];
  assert.equal(mine.status, 'rejected');
  assert.equal(mine.note, 'ไม่มีใบรับรอง');
  assert.match(err(b, '69000104@demo.ac.th', 'cancelLeave', { leaveId: 'V1' }), /พิจารณาแล้ว/);
  assert.match(err(b, '69000104@demo.ac.th', 'startLeaveUpload', { leaveId: 'V1', fileName: 'x', size: 1, origin: ORIGIN }), /พิจารณาแล้ว/);
  // ไม่อนุมัติแล้ว ส่งใบลาสัปดาห์เดิมใหม่ได้
  assert.equal(b.ok('69000104@demo.ac.th', 'submitLeave', { ...base, week: 2 }).status, 'pending');

  assert.match(err(b, S, 'decideLeave', { leaveId: 'V1', status: 'approved' }), /เฉพาะอาจารย์/);
  assert.match(err(b, T, 'decideLeave', { leaveId: 'V1', status: 'maybe' }), /สถานะ/);
});

test('approving leave for a future week does not mark that week as held for everyone', () => {
  const b = loadBackend();
  const v = b.ok(S, 'submitLeave', { ...base, week: 9 });
  b.ok(T, 'decideLeave', { leaveId: v.id, status: 'approved' });
  assert.equal(marks(b, '69000101')[8], 'E');
  const att = b.ok(T, 'getAttendance', { courseCode: 'DEMO2303' });
  assert.deepEqual([...att.heldWeeks], [1, 2]);
  // บันทึกเช็คชื่อทีหลังก็ยังไม่นับสัปดาห์ที่มีแค่ "ลา"
  b.ok(T, 'saveAttendance', { courseCode: 'DEMO2303', rows: att.rows.map((r) => ({ studentId: r.studentId, marks: r.marks })) });
  assert.deepEqual([...b.ok(T, 'getAttendance', { courseCode: 'DEMO2303' }).heldWeeks], [1, 2]);
  // ถ้าเช็คชื่อว่า "มา" ไว้แล้ว อนุมัติไม่ทับ
  const w1 = b.ok(S, 'submitLeave', { ...base, week: 1 });
  b.ok(T, 'decideLeave', { leaveId: w1.id, status: 'approved' });
  assert.equal(marks(b, '69000101')[0], 'P');
});
