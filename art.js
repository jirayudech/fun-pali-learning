// Original local vector artwork, independent of external generation services.
export const art = { guide: './assets/guide.svg', garden: './assets/garden.svg', trophy: './assets/trophy.svg' };
const intensiveArt = {phonetics:'sounds',sandhi:'sentences',feminine:'pronouns',neuter:'words','place-origin':'cases',numerals:'number','verb-parts':'verbs',passive:'noun-roles',participles:'grammar-review',compounds:'genitive',taddhita:'masculine','translation-method':'sentences'};
const followupArt = { 'adjective-agreement': 'masculine', 'verb-person-drill': 'verbs', 'negation-links': 'sentences', 'sequence-practice': 'grammar-review', 'compound-analysis': 'genitive', 'translation-boss': 'exam' };
export const lessonArt = id => id.startsWith('akkhara-') ? './assets/akkhara.svg' : `./assets/${followupArt[id] || intensiveArt[id] || id}.svg`;
export const moodArt = correct => correct ? './assets/cheer.svg' : './assets/thinking.svg';
