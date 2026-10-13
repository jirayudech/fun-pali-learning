// Original local vector artwork, independent of external generation services.
export const art = { guide: './assets/guide.svg', garden: './assets/garden.svg', trophy: './assets/trophy.svg' };
export const lessonArt = id => `./assets/${id}.svg`;
export const moodArt = correct => correct ? './assets/cheer.svg' : './assets/thinking.svg';
