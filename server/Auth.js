/*
 * Auth — ตรวจ Google ID token แล้วระบุว่าเป็นอาจารย์หรือนักศึกษาคนไหน
 */

function settings_() {
  if (!_cache.settings) {
    var s = {};
    rows_('Settings').forEach(function (r) { s[r.key] = r.value; });
    _cache.settings = s;
  }
  return _cache.settings;
}

function listSetting_(key) {
  return String(settings_()[key] || '').split(/[,\s]+/)
    .map(function (x) { return x.trim().toLowerCase(); })
    .filter(Boolean);
}

function jsonSetting_(key, fallback) {
  try {
    var v = settings_()[key];
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

/** ตรวจ ID token กับ Google แล้วคืน { email, name } — แคช 10 นาทีเพื่อลดการเรียกซ้ำ */
function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('AUTH: กรุณาเข้าสู่ระบบ');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('AUTH: การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  var info = JSON.parse(res.getContentText());

  var clientId = settings_().clientId;
  if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า clientId ในแท็บ Settings');
  if (info.aud !== clientId) throw new Error('AUTH: โทเคนไม่ได้ออกให้เว็บนี้');
  if (String(info.email_verified) !== 'true') throw new Error('AUTH: อีเมลยังไม่ได้ยืนยัน');
  var ttl = Math.min(Number(info.exp) - Math.floor(Date.now() / 1000) - 30, 600);
  if (!(ttl > 0)) throw new Error('AUTH: การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');

  var ident = { email: String(info.email).toLowerCase(), name: info.name || '' };
  cache.put(key, JSON.stringify(ident), Math.floor(ttl));
  return ident;
}

function authenticate_(idToken) {
  return resolveUser_(verifyIdToken_(idToken));
}

/**
 * อาจารย์ = อีเมลอยู่ใน Settings.teacherEmails
 * นักศึกษา = อีเมลถูกผูกกับรหัสนักศึกษาในแท็บ Students
 *   ผูกอัตโนมัติถ้าตัวเลขหน้า @ ตรงกับรหัสนักศึกษา (เช่น 67152901@g.cmru.ac.th) มิฉะนั้นนักศึกษากรอกรหัสเองครั้งแรก
 */
function resolveUser_(ident) {
  var email = ident.email;
  if (listSetting_('teacherEmails').indexOf(email) >= 0) {
    return { email: email, name: ident.name, role: 'teacher', courses: [] };
  }
  var domains = listSetting_('allowedDomains');
  if (domains.length && domains.indexOf(email.split('@')[1]) < 0) {
    throw new Error('AUTH_DOMAIN: บัญชีนี้ใช้ไม่ได้ กรุณาเข้าสู่ระบบด้วยบัญชี @' + domains.join(' หรือ @'));
  }

  var students = rows_('Students');
  var mine = students.filter(function (r) { return r.email.toLowerCase() === email; });
  if (!mine.length) {
    var digits = email.split('@')[0].replace(/\D/g, '');
    if (digits.length >= 8) {
      var match = students.filter(function (r) { return r.studentId === digits; });
      if (match.length && !match.some(function (r) { return r.email; })) {
        bindRows_(match, email);
        mine = match;
      }
    }
  }
  return {
    email: email,
    name: ident.name,
    role: 'student',
    studentId: mine.length ? mine[0].studentId : null,
    studentName: mine.length ? mine[0].name : '',
    courses: mine.map(function (r) { return r.courseCode; })
  };
}

function bindRows_(rows, email) {
  var t = now_();
  rows.forEach(function (r) {
    r.email = email;
    r.boundAt = email ? t : '';
    update_('Students', r);
  });
}

function requireTeacher_(user) {
  if (user.role !== 'teacher') throw new Error('เฉพาะอาจารย์เท่านั้น');
}

function requireStudent_(user) {
  if (user.role !== 'student') throw new Error('เฉพาะนักศึกษาเท่านั้น');
  if (!user.studentId) throw new Error('กรุณายืนยันรหัสนักศึกษาก่อน');
}
