/*
 * Leave — ใบลา: นักศึกษาส่งใบลารายสัปดาห์ (แนบไฟล์ได้ เช่น ใบรับรองแพทย์) → อาจารย์อนุมัติ/ไม่อนุมัติ
 * อนุมัติ = ทำเครื่องหมาย "ลา" (E) ในการเช็คชื่อสัปดาห์นั้นให้อัตโนมัติ (ยกเว้นเช็คว่า "มา" ไว้แล้ว)
 * เปลี่ยนจากอนุมัติเป็นไม่อนุมัติ = คืนเครื่องหมายเดิม
 */

var LEAVE_TYPES = { sick: 'ลาป่วย', personal: 'ลากิจ', other: 'อื่นๆ' };
var LEAVE_STATUS = ['pending', 'approved', 'rejected'];
var LEAVE_MAX_FILES = 5;
var LEAVE_MAX_MB = 20;

function leaveRow_(id) {
  var r = find_(rows_('LeaveRequests'), function (x) { return x.id === id; });
  if (!r) throw new Error('ไม่พบใบลานี้');
  return r;
}

function leaveView_(r) {
  var st = studentRow_(r.courseCode, r.studentId);
  return {
    id: r.id, courseCode: r.courseCode, studentId: r.studentId, name: st ? st.name : '',
    week: Number(r.week), date: r.date, type: r.type, typeLabel: LEAVE_TYPES[r.type] || r.type,
    reason: r.reason, files: parseJson_(r.files, []), status: r.status, note: r.note,
    submittedAt: r.submittedAt, decidedAt: r.decidedAt
  };
}

function myLeave_(user, id) {
  requireStudent_(user);
  var r = leaveRow_(id);
  if (r.studentId !== user.studentId) throw new Error('ไม่พบใบลานี้');
  checkEnrolled_(user, r.courseCode);
  return r;
}

function byNewest_(a, b) {
  return a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0;
}

function pendingLeaves_(code) {
  return rows_('LeaveRequests').filter(function (r) { return r.courseCode === code && r.status === 'pending'; }).length;
}

/* ---------- นักศึกษา ---------- */

function apiMyLeaves_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  return rows_('LeaveRequests')
    .filter(function (r) { return r.courseCode === p.courseCode && r.studentId === user.studentId; })
    .sort(byNewest_)
    .map(leaveView_);
}

function apiSubmitLeave_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  var week = Number(p.week);
  if (!(week >= 1 && week <= Grade.WEEKS && week === Math.floor(week))) throw new Error('กรุณาเลือกสัปดาห์ 1–' + Grade.WEEKS);
  var date = str_(p.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) throw new Error('กรุณาเลือกวันที่ลา');
  if (!Object.prototype.hasOwnProperty.call(LEAVE_TYPES, p.type)) throw new Error('กรุณาเลือกประเภทการลา');
  var reason = str_(p.reason, 1000);
  if (!reason) throw new Error('กรุณาใส่เหตุผลการลา');
  var dup = find_(rows_('LeaveRequests'), function (r) {
    return r.courseCode === p.courseCode && r.studentId === user.studentId && Number(r.week) === week && r.status !== 'rejected';
  });
  if (dup) throw new Error('มีใบลาสัปดาห์ที่ ' + week + ' อยู่แล้ว');
  var r = {
    id: uid_('V'), courseCode: p.courseCode, studentId: user.studentId, week: String(week), date: date,
    type: p.type, reason: reason, files: '[]', status: 'pending', note: '', submittedAt: now_(), decidedAt: '', prevMark: ''
  };
  insert_('LeaveRequests', r);
  return leaveView_(r);
}

function apiStartLeaveUpload_(user, p) {
  var r = myLeave_(user, p.leaveId);
  if (r.status !== 'pending') throw new Error('ใบลานี้พิจารณาแล้ว แนบไฟล์เพิ่มไม่ได้');
  if (parseJson_(r.files, []).length >= LEAVE_MAX_FILES) throw new Error('แนบได้สูงสุด ' + LEAVE_MAX_FILES + ' ไฟล์');
  checkUploadRate_(user);
  var size = Number(p.size);
  if (!(size > 0)) throw new Error('ไฟล์ว่างเปล่า');
  if (size > LEAVE_MAX_MB * 1024 * 1024) throw new Error('ไฟล์แนบใบลาต้องไม่เกิน ' + LEAVE_MAX_MB + ' MB');
  var origin = String(p.origin || '').replace(/\/+$/, '');
  if (settingsView_().allowedOrigins.indexOf(origin) < 0) {
    throw new Error('เว็บไซต์ ' + origin + ' ไม่ได้รับอนุญาตให้อัปโหลด (ตั้งค่า allowedOrigins)');
  }
  var st = studentRow_(r.courseCode, r.studentId);
  return {
    uploadUrl: startResumable_({
      folderId: leaveFolderId_(r.courseCode, st.studentId + ' ' + st.name),
      name: safeName_('สัปดาห์ ' + r.week + ' - ' + p.fileName),
      mimeType: cleanMime_(p.mimeType),
      size: size,
      origin: origin,
      description: 'ใบลา ' + st.name + ' (' + st.studentId + ') สัปดาห์ ' + r.week,
      appProperties: { leaveId: r.id, studentId: r.studentId }
    })
  };
}

function apiFinalizeLeaveUpload_(user, p) {
  var r = myLeave_(user, p.leaveId);
  var f = getDriveFile_(String(p.fileId || ''));
  var props = (f && f.appProperties) || {};
  if (!f || f.trashed || props.leaveId !== r.id || props.studentId !== user.studentId) throw new Error('ไม่พบไฟล์ที่อัปโหลด');
  var files = parseJson_(r.files, []);
  if (!files.some(function (x) { return x.id === f.id; })) {
    // ตรวจซ้ำตอนจบ: อาจถูกพิจารณาไปแล้วระหว่างอัปโหลด หรือเปิด session ไว้เกินจำนวน
    if (r.status !== 'pending') throw new Error('ใบลานี้พิจารณาแล้ว แนบไฟล์เพิ่มไม่ได้');
    if (files.length >= LEAVE_MAX_FILES) throw new Error('แนบได้สูงสุด ' + LEAVE_MAX_FILES + ' ไฟล์');
    shareReader_(f.id, user.email);
    files.push({ id: f.id, name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType });
    r.files = JSON.stringify(files);
    update_('LeaveRequests', r);
  }
  return leaveView_(r);
}

/** ยกเลิกใบลาที่ยังไม่ได้พิจารณา — ไฟล์แนบย้ายไปถังขยะ */
function apiCancelLeave_(user, p) {
  var r = myLeave_(user, p.leaveId);
  if (r.status !== 'pending') throw new Error('ใบลานี้พิจารณาแล้ว ยกเลิกไม่ได้ (ติดต่ออาจารย์)');
  parseJson_(r.files, []).forEach(function (f) { trashFile_(f.id); });
  remove_('LeaveRequests', function (x) { return x.id === r.id; });
  return { cancelled: r.id };
}

/* ---------- อาจารย์ ---------- */

function apiListLeaves_(user, p) {
  requireTeacher_(user);
  courseRow_(p.courseCode);
  return rows_('LeaveRequests')
    .filter(function (r) { return r.courseCode === p.courseCode; })
    .sort(function (a, b) {
      // รออนุมัติขึ้นก่อน แล้วเรียงใหม่ → เก่า
      var pa = a.status === 'pending' ? 0 : 1, pb = b.status === 'pending' ? 0 : 1;
      return pa - pb || byNewest_(a, b);
    })
    .map(leaveView_);
}

/** status: approved | rejected | pending — อนุมัติแล้วเปลี่ยนใจได้ */
function apiDecideLeave_(user, p) {
  requireTeacher_(user);
  var r = leaveRow_(p.leaveId);
  if (LEAVE_STATUS.indexOf(p.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  var att = find_(rows_('Attendance'), function (x) { return x.courseCode === r.courseCode && x.studentId === r.studentId; });
  var key = 'w' + r.week;
  if (p.status === 'approved' && r.status !== 'approved') {
    if (!att) {
      att = { courseCode: r.courseCode, studentId: r.studentId };
      for (var w = 1; w <= Grade.WEEKS; w++) att['w' + w] = '';
      rows_('Attendance').push(att);
    }
    r.prevMark = att[key] || '';
    if (att[key] !== 'P') att[key] = 'E';
  } else if (p.status !== 'approved' && r.status === 'approved' && att && att[key] === 'E') {
    att[key] = r.prevMark || '';
  }
  // ไม่แตะ heldWeeks: สัปดาห์ที่มีแค่ "ลา" ยังไม่นับว่าเช็คชื่อแล้ว (ดู apiSaveAttendance_)
  if (att) saveAll_('Attendance');
  r.status = p.status;
  r.note = str_(p.note, 1000);
  r.decidedAt = p.status === 'pending' ? '' : now_();
  update_('LeaveRequests', r);
  return leaveView_(r);
}
