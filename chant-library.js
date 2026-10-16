export const chantCollections = [ ['kathina','กฐิน'], ['patimokkha','ปาฏิโมกข์'], ['seven','7 ตำนาน'], ['twelve','12 ตำนาน'], ['general','บทสวดอื่น ๆ'] ];
export function validateChantLibrary(raw = []) {
  if (!Array.isArray(raw) || raw.length > 64) throw new Error('เก็บบทสวดส่วนตัวได้ไม่เกิน 64 บทในชุดนี้');
  const seen = new Set();
  return raw.map(item => {
    if (!item || typeof item.id !== 'string' || !/^custom-[a-z0-9-]{8,80}$/.test(item.id) || seen.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100 || !chantCollections.some(([id]) => id === item.collection)) throw new Error('ชื่อหรือรหัสบทสวดส่วนตัวไม่ถูกต้อง');
    seen.add(item.id);
    return { id: item.id, title: item.title.trim(), collection: item.collection, intro: 'บทสวดจากต้นฉบับที่คุณเพิ่ม ฝึกได้ทีละวรรค', source: 'ต้นฉบับส่วนตัว', complete: false, note: 'ตรวจข้อความและคำแปลกับฉบับที่ใช้จริง คำแปลรายคำพื้นฐานอาจต้องปรับตามวรรค' };
  });
}
