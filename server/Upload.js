/*
 * Upload — ส่งงานเข้า Google Drive ของอาจารย์
 *
 * ไฟล์ใหญ่: สคริปต์เปิด "resumable upload session" ของ Drive ด้วยสิทธิ์อาจารย์ แล้วส่งแค่ URL ของ session
 * ให้เบราว์เซอร์ → เบราว์เซอร์อัปโหลดเป็นชิ้นตรงไปที่ Google (ไม่ผ่าน Apps Script, ไม่จำกัด 50MB)
 * URL นี้ใช้ได้กับไฟล์นี้ไฟล์เดียว และไม่เปิดเผย token ของอาจารย์
 */

var MAX_FILES_PER_SUBMISSION = 20;

function checkCanSubmit_(a, sub) {
  if (a.published !== 'true') throw new Error('งานนี้ยังไม่เปิดให้ส่ง');
  if (sub && sub.score !== '') throw new Error('งานนี้ตรวจให้คะแนนแล้ว แก้ไขไม่ได้ (ติดต่ออาจารย์)');
  if (isPastDue_(a) && a.allowLate !== 'true') throw new Error('เลยกำหนดส่งแล้ว');
}

function studentRow_(courseCode, studentId) {
  return find_(rows_('Students'), function (r) { return r.courseCode === courseCode && r.studentId === studentId; });
}

function safeName_(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150) || 'file';
}

function apiStartUpload_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var sub = submissionRow_(a.id, user.studentId);
  checkCanSubmit_(a, sub);
  if (sub && parseJson_(sub.files, []).length >= MAX_FILES_PER_SUBMISSION) {
    throw new Error('ส่งได้สูงสุด ' + MAX_FILES_PER_SUBMISSION + ' ไฟล์ต่องาน');
  }
  var size = Number(p.size);
  var maxMB = settingsView_().uploadMaxMB;
  if (!(size > 0)) throw new Error('ไฟล์ว่างเปล่า');
  if (size > maxMB * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน ' + maxMB + ' MB');
  var origin = String(p.origin || '').replace(/\/+$/, '');
  if (settingsView_().allowedOrigins.indexOf(origin) < 0) {
    throw new Error('เว็บไซต์ ' + origin + ' ไม่ได้รับอนุญาตให้อัปโหลด (ตั้งค่า allowedOrigins)');
  }

  var st = studentRow_(a.courseCode, user.studentId);
  var folderId = submissionFolderId_(a, st);
  var uploadUrl = startResumable_({
    folderId: folderId,
    name: safeName_(p.fileName),
    mimeType: String(p.mimeType || 'application/octet-stream'),
    size: size,
    origin: origin,
    description: 'ส่งโดย ' + st.name + ' (' + st.studentId + ') ' + user.email,
    appProperties: { assignmentId: a.id, studentId: user.studentId }
  });
  return { uploadUrl: uploadUrl };
}

function apiFinalizeUpload_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var f = getDriveFile_(String(p.fileId || ''));
  var props = (f && f.appProperties) || {};
  if (!f || f.trashed || props.studentId !== user.studentId || props.assignmentId !== a.id) {
    throw new Error('ไม่พบไฟล์ที่อัปโหลด');
  }
  var sub = submissionRow_(a.id, user.studentId) || newSubmission_(a.id, user.studentId);
  var files = parseJson_(sub.files, []);
  if (!files.some(function (x) { return x.id === f.id; })) {
    shareReader_(f.id, user.email);
    files.push({ id: f.id, name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType });
  }
  markSubmitted_(a, sub, files);
  return submissionView_(sub);
}

function apiSubmitLink_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var sub = submissionRow_(a.id, user.studentId);
  checkCanSubmit_(a, sub);
  var link = str_(p.link, 2000);
  if (link && !/^https:\/\/[^\s]+$/.test(link)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://');
  sub = sub || newSubmission_(a.id, user.studentId);
  sub.link = link;
  markSubmitted_(a, sub, parseJson_(sub.files, []));
  return submissionView_(sub);
}

function apiRemoveFile_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var sub = submissionRow_(a.id, user.studentId);
  checkCanSubmit_(a, sub);
  var files = sub ? parseJson_(sub.files, []) : [];
  var keep = files.filter(function (x) { return x.id !== p.fileId; });
  if (keep.length === files.length) throw new Error('ไม่พบไฟล์');
  trashFile_(p.fileId);
  markSubmitted_(a, sub, keep);
  return submissionView_(sub);
}

function markSubmitted_(a, sub, files) {
  sub.files = JSON.stringify(files);
  if (files.length || sub.link) {
    sub.submittedAt = now_();
    sub.isLate = isPastDue_(a) ? 'true' : 'false';
  } else {
    sub.submittedAt = '';
    sub.isLate = '';
  }
  update_('Submissions', sub);
}

/* ---------- Google Drive (โหมดทดลองเขียนทับฟังก์ชันชุดนี้) ---------- */

function driveFetch_(method, url, body, headers) {
  var opt = {
    method: method,
    muteHttpExceptions: true,
    headers: Object.assign({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, headers || {})
  };
  if (body) {
    opt.contentType = 'application/json; charset=UTF-8';
    opt.payload = JSON.stringify(body);
  }
  return UrlFetchApp.fetch(url, opt);
}

/** โฟลเดอร์: <root>/<รหัสวิชา>/<งาน>/<รหัส ชื่อ> — จำ id ไว้ใน Script Properties */
function ensureFolder_(parentId, name) {
  var props = PropertiesService.getScriptProperties();
  var key = 'folder_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, parentId + '/' + name, Utilities.Charset.UTF_8));
  var id = props.getProperty(key);
  if (id) {
    try {
      if (!DriveApp.getFolderById(id).isTrashed()) return id;
    } catch (e) { /* โฟลเดอร์ถูกลบ — สร้างใหม่ */ }
  }
  var parent = DriveApp.getFolderById(parentId);
  var it = parent.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : parent.createFolder(name);
  props.setProperty(key, folder.getId());
  return folder.getId();
}

function submissionFolderId_(a, st) {
  var root = settings_().rootFolderId;
  if (!root) throw new Error('ยังไม่ได้ตั้งค่า rootFolderId — รัน setup()');
  var course = ensureFolder_(root, a.courseCode);
  var work = ensureFolder_(course, safeName_(a.title + ' [' + a.id + ']'));
  return ensureFolder_(work, safeName_(st.studentId + ' ' + st.name));
}

function startResumable_(o) {
  var res = driveFetch_('post',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType',
    { name: o.name, parents: [o.folderId], description: o.description, appProperties: o.appProperties },
    { 'X-Upload-Content-Type': o.mimeType, 'X-Upload-Content-Length': String(o.size), Origin: o.origin });
  var h = res.getHeaders();
  var url = h.Location || h.location;
  if (res.getResponseCode() !== 200 || !url) {
    throw new Error('เปิดการอัปโหลดไม่สำเร็จ (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  }
  return url;
}

function getDriveFile_(id) {
  if (!/^[\w-]{10,}$/.test(id)) return null;
  var res = driveFetch_('get', 'https://www.googleapis.com/drive/v3/files/' + id +
    '?fields=id,name,size,mimeType,trashed,appProperties');
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
}

/** ให้สิทธิ์ "ผู้ดู" กับเจ้าของงานคนเดียว (ไม่ส่งอีเมลแจ้ง) */
function shareReader_(id, email) {
  var res = driveFetch_('post', 'https://www.googleapis.com/drive/v3/files/' + id +
    '/permissions?sendNotificationEmail=false', { role: 'reader', type: 'user', emailAddress: email });
  if (res.getResponseCode() !== 200) {
    console.warn('share failed ' + id + ' ' + email + ': ' + res.getContentText());
  }
}

function trashFile_(id) {
  DriveApp.getFileById(id).setTrashed(true);
}
