// Reviewed spellings for vocabulary used in this course. Not an automatic translator.
export const paliSpellings = {
  buddha: 'พุทฺธ', buddho: 'พุทฺโธ', dhamma: 'ธมฺม', dhammo: 'ธมฺโม', 'dhammaṃ': 'ธมฺมํ', 'dhammā': 'ธมฺมา',
  'mettā': 'เมตฺตา', 'paññā': 'ปญฺญา', dukkha: 'ทุกฺข', deseti: 'เทเสติ',
  purisa: 'ปุริส', puriso: 'ปุริโส', 'purisaṃ': 'ปุริสํ', purisena: 'ปุริเสน', 'purisā': 'ปุริสา',
  'suṇāti': 'สุณาติ', 'suṇanti': 'สุณนฺติ', hattha: 'หตฺถ', hattho: 'หตฺโถ', 'hatthaṃ': 'หตฺถํ', hatthena: 'หตฺเถน', likhati: 'ลิขติ',
  gacchati: 'คจฺฉติ', gacchanti: 'คจฺฉนฺติ', 'gacchāmi': 'คจฺฉามิ', gacchasi: 'คจฺฉสิ', 'gacchāma': 'คจฺฉาม',
  'ahaṃ': 'อหํ', 'tvaṃ': 'ตฺวํ', so: 'โส', 'mayaṃ': 'มยํ', tumhe: 'ตุมฺเห', passati: 'ปสฺสติ', passanti: 'ปสฺสนฺติ',
  buddhassa: 'พุทฺธสฺส', 'buddhaṃ': 'พุทฺธํ', 'pupphaṃ': 'ปุปฺผํ', deti: 'เทติ',
  a: 'อ', 'ā': 'อา', i: 'อิ', 'ī': 'อี', u: 'อุ', 'ū': 'อู', e: 'เอ', o: 'โอ', 'ṃ': 'ํ', 'ñ': 'ญ'
};
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function annotate(text, format) {
  // Apply the same Thai exam terminology to older Supabase question records.
  text = String(text ?? '').replace(/\ba-stem\b/gi, 'อการันต์');
  let out = '', cursor = 0;
  for (const match of text.matchAll(/[A-Za-zāīūṅñṭḍṇḷṃṁ]+/g)) {
    const word = match[0], start = match.index;
    out += format.plain(text.slice(cursor, start));
    const thai = paliSpellings[word.toLowerCase()];
    // Existing Thai (roman) annotations stay intact.
    const alreadyAnnotated = /[\u0e00-\u0e7f]\s*\($/.test(text.slice(0, start));
    const isStem = text.slice(start + word.length).startsWith('-stem');
    out += thai && !alreadyAnnotated && !isStem ? format.term(thai, word) : format.plain(word);
    cursor = start + word.length;
  }
  return out + format.plain(text.slice(cursor));
}
export function paliText(text) {
  return annotate(text, { plain: v => v, term: (thai, roman) => `${thai} (${roman})` });
}
export function paliMarkup(text) {
  return annotate(text, {
    plain: escape,
    term: (thai, roman) => `<span class="pali-term"><span class="pali-script" lang="pi-Thai">${escape(thai)}</span><small class="pali-roman" lang="pi-Latn">${escape(roman)}</small></span>`
  });
}
