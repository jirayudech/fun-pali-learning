// Original local vector artwork, independent of external generation services.
export const art = { guide: './assets/guide.svg', garden: './assets/garden.svg', trophy: './assets/trophy.svg' };
const intensiveArt = {phonetics:'sounds',sandhi:'sentences',feminine:'pronouns',neuter:'words','place-origin':'cases',numerals:'number','verb-parts':'verbs',passive:'noun-roles',participles:'grammar-review',compounds:'genitive',taddhita:'masculine','translation-method':'sentences'};
export const lessonArt = id => `./assets/${intensiveArt[id] || id}.svg`;
export const moodArt = correct => correct ? './assets/cheer.svg' : './assets/thinking.svg';
