// อัปโหลดไฟล์เป็นชิ้นตรงไปที่ Google Drive ผ่าน resumable upload session ที่ backend เปิดให้
import { call } from './api.js';

const CHUNK = 8 * 1024 * 1024; // ต้องเป็นทวีคูณของ 256 KB

export async function uploadFile(file, assignmentId, onProgress) {
  const { uploadUrl } = await call('startUpload', {
    assignmentId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    origin: location.origin
  });
  const meta = uploadUrl.startsWith('demo-upload://')
    ? await fakeUpload(uploadUrl, file, onProgress)
    : await putChunks(uploadUrl, file, onProgress);
  return call('finalizeUpload', { assignmentId, fileId: meta.id });
}

async function putChunks(url, file, onProgress) {
  let start = 0;
  while (true) {
    const end = Math.min(start + CHUNK, file.size);
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await putChunk(url, file.slice(start, end), start, file.size, (loaded) => onProgress((start + loaded) / file.size));
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    if (res.status === 200 || res.status === 201) {
      onProgress(1);
      return JSON.parse(res.body);
    }
    if (res.status !== 308) throw new Error('อัปโหลดไม่สำเร็จ (' + res.status + ')');
    start = end;
  }
}

function putChunk(url, blob, start, total, onLoaded) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${start + blob.size - 1}/${total}`);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => (xhr.status >= 500 ? reject(new Error('server ' + xhr.status)) : resolve({ status: xhr.status, body: xhr.responseText }));
    xhr.onerror = () => reject(new Error('การเชื่อมต่อขาดหาย'));
    xhr.send(blob);
  });
}

async function fakeUpload(url, file, onProgress) {
  for (let p = 0; p <= 1; p += 0.2) {
    onProgress(p);
    await new Promise((r) => setTimeout(r, 120));
  }
  return { id: url.replace('demo-upload://', '') };
}
