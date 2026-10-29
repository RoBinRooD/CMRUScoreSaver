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

/** โดเมนตรงกัน หรือเป็นโดเมนย่อย: ตั้ง cmru.ac.th → รับ g.cmru.ac.th ด้วย (แต่ไม่รับ fakecmru.ac.th) */
function domainAllowed_(email, domains) {
  var host = String(email).split('@')[1] || '';
  return domains.some(function (d) { return host === d || host.slice(-(d.length + 1)) === '.' + d; });
}

/**
 * อาจารย์ = อีเมลอยู่ใน Settings.teacherEmails
 * นักศึกษา = บัญชีโดเมนมหาวิทยาลัย (Settings.allowedDomains) ที่สมัครแล้ว คือผูกกับรหัสนักศึกษาในแท็บ Students
 *   ยังไม่สมัคร → studentId = null และเว็บจะแสดงหน้าสมัคร (apiRegister_)
 */
function resolveUser_(ident) {
  var email = ident.email;
  if (listSetting_('teacherEmails').indexOf(email) >= 0) {
    return { email: email, name: ident.name, role: 'teacher', courses: [] };
  }
  var domains = listSetting_('allowedDomains');
  if (!domains.length) throw new Error('AUTH_DOMAIN: ระบบยังไม่เปิดรับนักศึกษา (อาจารย์ยังไม่ได้ตั้งค่าโดเมนมหาวิทยาลัย)');
  if (!domainAllowed_(email, domains)) {
    throw new Error('AUTH_DOMAIN: บัญชีนี้ใช้ไม่ได้ กรุณาเข้าสู่ระบบด้วยบัญชีของมหาวิทยาลัย (@' + domains.join(' หรือ @') + ')');
  }

  var mine = rows_('Students').filter(function (r) { return r.email.toLowerCase() === email; });
  return {
    email: email,
    name: ident.name,
    role: 'student',
    studentId: mine.length ? mine[0].studentId : null,
    studentName: mine.length ? mine[0].name : '',
    courses: mine.map(function (r) { return r.courseCode; })
  };
}

/** profile: { nickname, phone } — email ว่าง = รีเซ็ตการสมัคร */
function bindRows_(rows, email, profile) {
  var t = now_();
  rows.forEach(function (r) {
    r.email = email;
    r.boundAt = email ? t : '';
    if (!email) {
      r.nickname = '';
      r.phone = '';
    } else if (profile) {
      r.nickname = profile.nickname;
      r.phone = profile.phone;
    }
    update_('Students', r);
  });
}

/** นับจำนวนครั้งต่อ key ภายในช่วงเวลา — เกิน max แล้วโยน error */
function rateLimit_(key, max, seconds, message) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('rl_' + key) || 0);
  if (n >= max) throw new Error(message);
  return function hit() {
    cache.put('rl_' + key, String(n + 1), seconds);
  };
}

/** PIN ยืนยันการลบ — เก็บเฉพาะ hash + salt ในแท็บ Settings */
function hashPin_(salt, pin) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8));
}

function hasDeletePin_() {
  return !!settings_().deletePinHash;
}

/** ผิดเกิน 5 ครั้ง/ชม. ต่อบัญชี → ล็อก 1 ชม. */
function checkDeletePin_(user, pin) {
  if (!hasDeletePin_()) throw new Error('ยังไม่ได้ตั้ง PIN สำหรับลบ — ตั้งได้ที่แท็บ ตั้งค่า');
  var hit = rateLimit_('pin_' + user.email, 5, 3600, 'ใส่ PIN ผิดหลายครั้งเกินไป กรุณารอ 1 ชั่วโมง');
  var s = settings_();
  if (hashPin_(s.deletePinSalt || '', String(pin || '')) !== s.deletePinHash) {
    hit();
    throw new Error('PIN ไม่ถูกต้อง');
  }
}

function requireTeacher_(user) {
  if (user.role !== 'teacher') throw new Error('เฉพาะอาจารย์เท่านั้น');
}

function requireStudent_(user) {
  if (user.role !== 'student') throw new Error('เฉพาะนักศึกษาเท่านั้น');
  if (!user.studentId) throw new Error('กรุณายืนยันรหัสนักศึกษาก่อน');
}
