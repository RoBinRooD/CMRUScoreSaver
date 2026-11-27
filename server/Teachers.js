/*
 * Teachers — บัญชีอาจารย์ ผู้ดูแลระบบ และสิทธิ์ต่อวิชา
 * แท็บ Teachers: role admin = ผู้ดูแลระบบ (จัดการบัญชีอาจารย์และการตั้งค่ารวมได้) · teacher = อาจารย์ทั่วไป
 *   status disabled = เข้าระบบไม่ได้ · expiresAt (YYYY-MM-DD) หมดอายุแล้ว = ดูได้อย่างเดียว · quotaGB ว่าง = ไม่จำกัด
 * Courses.owners = อีเมลอาจารย์ผู้สอน (JSON) คนแรก = เจ้าของพื้นที่ Drive ของวิชา
 * อาจารย์เข้าถึงได้เฉพาะวิชาที่มีชื่อตัวเองใน owners — ผู้ดูแลระบบก็เช่นกัน (โอนวิชาได้ที่หน้าผู้ดูแลระบบ)
 */

var TEACHER_ROLES = ['admin', 'teacher'];
var TEACHER_STATUS = ['active', 'disabled'];
var MAX_COURSE_OWNERS = 10;

function teacherRow_(email) {
  email = String(email || '').toLowerCase();
  return find_(rows_('Teachers'), function (r) { return r.email.toLowerCase() === email; });
}

/** หมดอายุหลังสิ้นวัน expiresAt ตามเวลาไทย */
function teacherExpired_(t) {
  return !!t.expiresAt && new Date(now_()).getTime() > new Date(t.expiresAt + 'T23:59:59+07:00').getTime();
}

function courseOwners_(c) {
  return parseJson_(c.owners, []);
}

function ownsCourse_(user, c) {
  return user.role === 'teacher' && courseOwners_(c).indexOf(user.email) >= 0;
}

/** อาจารย์ที่สอนวิชานี้เท่านั้น — วิชาของคนอื่นตอบเหมือนไม่มีวิชานี้ */
function requireCourseTeacher_(user, code) {
  requireTeacher_(user);
  var c = courseRow_(code);
  if (!ownsCourse_(user, c)) throw new Error('ไม่พบวิชา ' + code);
  return c;
}

function requireAdmin_(user) {
  requireTeacher_(user);
  if (!user.admin) throw new Error('เฉพาะผู้ดูแลระบบเท่านั้น');
}

function cleanEmail_(e) {
  var email = str_(e, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง: ' + (e || '(ว่าง)'));
  return email;
}

/* ---------- พื้นที่ Drive ---------- */

function filesSize_(json) {
  return parseJson_(json, []).reduce(function (n, f) { return n + (Number(f.size) || 0); }, 0);
}

/** ไบต์ที่ใช้ต่อวิชา (งานที่ส่ง + ใบลา + ไฟล์ syllabus) */
function courseUsage_() {
  var byCourse = {};
  var add = function (code, n) { byCourse[code] = (byCourse[code] || 0) + n; };
  var courseOf = {};
  rows_('Assignments').forEach(function (a) { courseOf[a.id] = a.courseCode; });
  rows_('Submissions').forEach(function (s) { if (courseOf[s.assignmentId]) add(courseOf[s.assignmentId], filesSize_(s.files)); });
  rows_('LeaveRequests').forEach(function (r) { add(r.courseCode, filesSize_(r.files)); });
  rows_('Courses').forEach(function (c) {
    add(c.courseCode, (parseJson_(c.syllabus, {}).attachments || []).reduce(function (n, f) { return n + (Number(f.size) || 0); }, 0));
  });
  return byCourse;
}

/** ไบต์ที่อาจารย์แต่ละคนใช้ — นับวิชาเข้ากับเจ้าของพื้นที่ (owners คนแรก) */
function teacherUsage_() {
  var byCourse = courseUsage_();
  var byTeacher = {};
  rows_('Courses').forEach(function (c) {
    var o = courseOwners_(c)[0];
    if (o) byTeacher[o] = (byTeacher[o] || 0) + (byCourse[c.courseCode] || 0);
  });
  return byTeacher;
}

/** ก่อนเริ่มอัปโหลดไฟล์เข้าวิชานี้ — เกินโควตาของเจ้าของพื้นที่ = ไม่ให้อัป */
function checkQuota_(courseCode, size) {
  var o = courseOwners_(courseRow_(courseCode))[0];
  var t = o && teacherRow_(o);
  var gb = t ? Number(t.quotaGB) : 0;
  if (!(gb > 0)) return;
  var used = teacherUsage_()[o] || 0;
  if (used + Number(size || 0) > gb * 1024 * 1024 * 1024) {
    throw new Error('พื้นที่เก็บไฟล์ของวิชานี้เต็ม (' + gb + ' GB) — แจ้งอาจารย์ผู้สอน');
  }
}

/* ---------- ผู้สอนร่วม ---------- */

function setCourseOwners_(c, owners) {
  var before = courseOwners_(c);
  c.owners = JSON.stringify(owners);
  update_('Courses', c);
  owners.forEach(function (e) { if (before.indexOf(e) < 0) shareCourseFolder_(c.courseCode, e, true); });
  before.forEach(function (e) { if (owners.indexOf(e) < 0) shareCourseFolder_(c.courseCode, e, false); });
}

/** { courseCode, owners: [email] } — ผู้สอนของวิชา หรือผู้ดูแลระบบ */
function apiSetCourseOwners_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  if (!user.admin && !ownsCourse_(user, c)) throw new Error('ไม่พบวิชา ' + p.courseCode);
  var owners = [];
  (p.owners || []).forEach(function (e) {
    e = cleanEmail_(e);
    var t = teacherRow_(e);
    if (!t || t.status === 'disabled') throw new Error(e + ' ยังไม่มีบัญชีอาจารย์ในระบบ — ให้ผู้ดูแลระบบเพิ่มก่อน');
    if (owners.indexOf(e) < 0) owners.push(e);
  });
  if (!owners.length) throw new Error('วิชาต้องมีอาจารย์ผู้สอนอย่างน้อย 1 คน');
  if (owners.length > MAX_COURSE_OWNERS) throw new Error('มีผู้สอนได้สูงสุด ' + MAX_COURSE_OWNERS + ' คน');
  setCourseOwners_(c, owners);
  return { courseCode: c.courseCode, owners: owners, removedSelf: owners.indexOf(user.email) < 0 };
}

/* ---------- ผู้ดูแลระบบ ---------- */

function teacherView_(t, usage, courses) {
  return {
    email: t.email, name: t.name, role: t.role, status: t.status || 'active', expiresAt: t.expiresAt,
    expired: t.role !== 'admin' && teacherExpired_(t), quotaGB: numOrNull_(t.quotaGB), note: t.note, createdAt: t.createdAt,
    hasPin: !!t.pinHash, usedBytes: usage[t.email.toLowerCase()] || 0,
    courses: courses.filter(function (c) { return courseOwners_(c).indexOf(t.email.toLowerCase()) >= 0; })
      .map(function (c) { return c.courseCode; })
  };
}

function apiAdminOverview_(user) {
  requireAdmin_(user);
  var usage = teacherUsage_();
  var byCourse = courseUsage_();
  var courses = rows_('Courses');
  var counts = {};
  rows_('Students').forEach(function (r) { counts[r.courseCode] = (counts[r.courseCode] || 0) + 1; });
  return {
    me: user.email,
    teachers: rows_('Teachers').map(function (t) { return teacherView_(t, usage, courses); })
      .sort(function (a, b) { return a.email < b.email ? -1 : 1; }),
    courses: courses.map(function (c) {
      return {
        courseCode: c.courseCode, title: c.title, section: c.section, term: c.term,
        owners: courseOwners_(c), students: counts[c.courseCode] || 0, usedBytes: byCourse[c.courseCode] || 0
      };
    }).sort(function (a, b) { return a.courseCode < b.courseCode ? -1 : 1; })
  };
}

/** เพิ่ม/แก้บัญชีอาจารย์ { email, name, role, status, expiresAt, quotaGB, note, resetPin } */
function apiAdminSaveTeacher_(user, p) {
  requireAdmin_(user);
  var email = cleanEmail_(p.email);
  var role = p.role || 'teacher';
  var status = p.status || 'active';
  if (TEACHER_ROLES.indexOf(role) < 0) throw new Error('บทบาทไม่ถูกต้อง');
  if (TEACHER_STATUS.indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  var expiresAt = str_(p.expiresAt, 10);
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw new Error('วันหมดอายุไม่ถูกต้อง');
  var quota = p.quotaGB === null || p.quotaGB === undefined || p.quotaGB === '' ? '' : numOrNull_(p.quotaGB);
  if (quota !== '' && !(quota > 0)) throw new Error('โควตาต้องมากกว่า 0 GB (เว้นว่าง = ไม่จำกัด)');
  if (email === user.email && (role !== 'admin' || status !== 'active')) {
    throw new Error('ลดสิทธิ์หรือปิดบัญชีของตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นทำ');
  }
  if (rows_('Students').some(function (r) { return r.email.toLowerCase() === email; })) {
    throw new Error(email + ' ผูกกับนักศึกษาอยู่ — ใช้อีเมลอื่น');
  }
  var t = teacherRow_(email);
  if (!t) {
    t = { email: email, createdAt: now_(), pinSalt: '', pinHash: '' };
  }
  t.name = str_(p.name, 200);
  t.role = role;
  t.status = status;
  t.expiresAt = expiresAt;
  t.quotaGB = quota === '' ? '' : String(quota);
  t.note = str_(p.note, 1000);
  if (p.resetPin) { t.pinSalt = ''; t.pinHash = ''; }
  update_('Teachers', t);
  return teacherView_(t, teacherUsage_(), rows_('Courses'));
}

/** ลบบัญชีได้เมื่อไม่ได้สอนวิชาใดแล้ว (ปิดบัญชีแทนได้ ข้อมูลไม่หาย) */
function apiAdminRemoveTeacher_(user, p) {
  requireAdmin_(user);
  var email = cleanEmail_(p.email);
  if (email === user.email) throw new Error('ลบบัญชีของตัวเองไม่ได้');
  var owned = rows_('Courses').filter(function (c) { return courseOwners_(c).indexOf(email) >= 0; });
  if (owned.length) {
    throw new Error('ยังสอนวิชา ' + owned.map(function (c) { return c.courseCode; }).join(', ') + ' อยู่ — โอนวิชาก่อน หรือปิดบัญชีแทน');
  }
  var n = remove_('Teachers', function (t) { return t.email.toLowerCase() === email; });
  if (!n) throw new Error('ไม่พบบัญชีนี้');
  return { removed: email };
}

/**
 * ย้ายจากระบบเดิม (Settings.teacherEmails) — เรียกจาก setup()
 * owner (เจ้าของสคริปต์) = ผู้ดูแลระบบ · วิชาที่ยังไม่มีผู้สอน = ทุกคนในรายชื่อเดิม (สิทธิ์เหมือนเดิม)
 */
function migrateTeachers_(owner) {
  owner = String(owner || '').toLowerCase();
  var legacy = listSetting_('teacherEmails');
  if (owner && legacy.indexOf(owner) < 0) legacy.unshift(owner);
  var s = settings_();
  var made = 0;
  if (!rows_('Teachers').length) {
    legacy.forEach(function (e, i) {
      var admin = e === owner || (!owner && i === 0);
      insert_('Teachers', {
        email: e, name: '', role: admin ? 'admin' : 'teacher', status: 'active', expiresAt: '', quotaGB: '',
        note: 'ย้ายจากระบบเดิม', createdAt: now_(),
        // PIN ลบวิชาเดิมเป็นของผู้ตั้ง (เจ้าของสคริปต์)
        pinSalt: admin ? s.deletePinSalt || '' : '', pinHash: admin ? s.deletePinHash || '' : ''
      });
      made++;
    });
  }
  var courses = 0;
  rows_('Courses').forEach(function (c) {
    if (courseOwners_(c).length) return;
    setCourseOwners_(c, legacy.slice());
    courses++;
  });
  return { teachers: made, courses: courses };
}
