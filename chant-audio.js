// Audio stays on this device. No uploads and no generated or substituted chant melody.
const DB = 'pali-chant-audio-v1';
export async function audioDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('เบราว์เซอร์นี้เก็บไฟล์เสียงไม่ได้'));
  });
}
export async function storeAudio(key, file) {
  if (!file.type.startsWith('audio/') || file.size > 80 * 1024 * 1024) throw new Error('เลือกไฟล์เสียงขนาดไม่เกิน 80 MB');
  const db = await audioDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite'); tx.objectStore('clips').put({ blob: file, name: file.name }, key);
      tx.oncomplete = resolve; tx.onerror = () => reject(new Error('เก็บไฟล์เสียงไม่สำเร็จ กรุณาตรวจพื้นที่ในเครื่อง'));
    });
  } finally { db.close(); }
}
export async function readAudio(key) {
  const db = await audioDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('clips').objectStore('clips').get(key); req.onsuccess = () => resolve(req.result || null); req.onerror = reject;
    });
  } finally { db.close(); }
}
