import { readFileSync, writeFileSync } from 'node:fs';
import { gameQuestions } from '../grammar.js';
const quote = v => `'${String(v).replaceAll("'", "''")}'`;
const path = new URL('../supabase/games.sql', import.meta.url);
const base = readFileSync(path, 'utf8').split('-- Original grammar question seed follows.')[0];
const rows = gameQuestions.map(({ answer, why, lessonId, ...data }) => `(${quote(data.id)},${quote(lessonId)},${quote(JSON.stringify(data))}::jsonb,ARRAY[${answer.join(',')}],${quote(why)})`);
writeFileSync(path, base + '-- Original grammar question seed follows.\ninsert into public.game_bank(id,lesson_id,data,answer,explanation) values\n' + rows.join(',\n') + '\non conflict (id) do update set lesson_id=excluded.lesson_id,data=excluded.data,answer=excluded.answer,explanation=excluded.explanation;\ncommit;\n');
