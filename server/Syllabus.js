/*
 * Syllabus — เค้าโครงรายวิชา: เนื้อหาที่อาจารย์เขียนในเว็บ + ไฟล์/ลิงก์แนบ
 * เก็บเป็น JSON ในคอลัมน์ Courses.syllabus (เซลล์ Google Sheet รับได้ไม่เกิน 50,000 ตัวอักษร)
 * ไฟล์แนบอยู่ใน <root>/<รหัสวิชา>/Syllabus และแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" (ไม่ใช่ข้อมูลส่วนตัว)
 */

var SYLLABUS_MAX_ATTACHMENTS = 20;
// ตามหัวข้อแนวการสอนของมหาวิทยาลัย
var SYLLABUS_TEXT_FIELDS = {
  description: 5000, objectives: 5000, scope: 5000, activities: 5000, materials: 5000,
  assessment: 3000, rules: 3000, contact: 2000
};

function emptySyllabus_() {
  var weeks = [];
  for (var w = 0; w < Grade.WEEKS; w++) weeks.push({ topic: '', detail: '' });
  return { description: '', objectives: '', materials: '', contact: '', weeks: weeks, attachments: [] };
}

function syllabusOf_(c) {
  var s = emptySyllabus_();
  var saved = parseJson_(c.syllabus, {});
  Object.keys(SYLLABUS_TEXT_FIELDS).forEach(function (k) { if (saved[k]) s[k] = String(saved[k]); });
  (saved.weeks || []).slice(0, Grade.WEEKS).forEach(function (w, i) {
    s.weeks[i] = { topic: String((w && w.topic) || ''), detail: String((w && w.detail) || '') };
  });
  s.attachments = Array.isArray(saved.attachments) ? saved.attachments : [];
  return s;
}

function writeSyllabus_(c, s) {
  var json = JSON.stringify(s);
  if (json.length > 45000) throw new Error('เนื้อหา syllabus ยาวเกินไป — ย่อเนื้อหา หรือแนบเป็นไฟล์แทน');
  c.syllabus = json;
  c.syllabusUpdatedAt = now_();
  update_('Courses', c);
}

function syllabusView_(c) {
  return { course: courseView_(c), syllabus: syllabusOf_(c), updatedAt: c.syllabusUpdatedAt || '', gradeCutoffs: settingsView_().gradeCutoffs };
}

function apiGetSyllabus_(user, p) {
  checkEnrolled_(user, p.courseCode);
  return syllabusView_(courseRow_(p.courseCode));
}

/** บันทึกเนื้อหา (ไฟล์แนบจัดการแยกด้วยคำสั่งด้านล่าง) */
function apiSaveSyllabus_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var cur = syllabusOf_(c);
  var inp = p.syllabus || {};
  Object.keys(SYLLABUS_TEXT_FIELDS).forEach(function (k) {
    if (inp[k] !== undefined) cur[k] = str_(inp[k], SYLLABUS_TEXT_FIELDS[k]);
  });
  if (Array.isArray(inp.weeks)) {
    cur.weeks = emptySyllabus_().weeks.map(function (blank, i) {
      var w = inp.weeks[i] || {};
      return { topic: str_(w.topic, 200), detail: str_(w.detail, 1000) };
    });
  }
  writeSyllabus_(c, cur);
  return syllabusView_(c);
}

function apiAddSyllabusLink_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var s = syllabusOf_(c);
  if (s.attachments.length >= SYLLABUS_MAX_ATTACHMENTS) throw new Error('แนบได้สูงสุด ' + SYLLABUS_MAX_ATTACHMENTS + ' รายการ');
  var url = str_(p.url, 2000);
  if (!/^https:\/\/[^\s]+$/.test(url)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://');
  s.attachments.push({ id: uid_('L'), kind: 'link', name: str_(p.name, 200) || url, url: url });
  writeSyllabus_(c, s);
  return syllabusView_(c);
}

function apiStartSyllabusUpload_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  if (syllabusOf_(c).attachments.length >= SYLLABUS_MAX_ATTACHMENTS) throw new Error('แนบได้สูงสุด ' + SYLLABUS_MAX_ATTACHMENTS + ' รายการ');
  var size = Number(p.size);
  var maxMB = settingsView_().uploadMaxMB;
  if (!(size > 0)) throw new Error('ไฟล์ว่างเปล่า');
  if (size > maxMB * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน ' + maxMB + ' MB');
  var origin = String(p.origin || '').replace(/\/+$/, '');
  if (settingsView_().allowedOrigins.indexOf(origin) < 0) {
    throw new Error('เว็บไซต์ ' + origin + ' ไม่ได้รับอนุญาตให้อัปโหลด (ตั้งค่า allowedOrigins)');
  }
  return {
    uploadUrl: startResumable_({
      folderId: syllabusFolderId_(c.courseCode),
      name: safeName_(p.fileName),
      mimeType: String(p.mimeType || 'application/octet-stream'),
      size: size,
      origin: origin,
      description: 'Syllabus ' + c.courseCode,
      appProperties: { syllabusOf: c.courseCode }
    })
  };
}

function apiFinalizeSyllabusUpload_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var f = getDriveFile_(String(p.fileId || ''));
  if (!f || f.trashed || (f.appProperties || {}).syllabusOf !== c.courseCode) throw new Error('ไม่พบไฟล์ที่อัปโหลด');
  var s = syllabusOf_(c);
  if (!s.attachments.some(function (x) { return x.id === f.id; })) {
    shareAnyoneReader_(f.id);
    s.attachments.push({ id: f.id, kind: 'file', name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType });
    writeSyllabus_(c, s);
  }
  return syllabusView_(c);
}

function apiRemoveSyllabusAttachment_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var s = syllabusOf_(c);
  var hit = find_(s.attachments, function (x) { return x.id === p.id; });
  if (!hit) throw new Error('ไม่พบไฟล์แนบ');
  if (hit.kind === 'file') trashFile_(hit.id);
  s.attachments = s.attachments.filter(function (x) { return x !== hit; });
  writeSyllabus_(c, s);
  return syllabusView_(c);
}
