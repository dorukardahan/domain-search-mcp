// scripts/build-wordlist.mjs
// Dev-time script. Downloads a public 10k English frequency list and commits
// the top 5000 (length >= 3) to data/common-words.json. Run manually; the
// output file is committed so runtime stays offline.
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';
const res = await fetch(URL);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const words = (await res.text())
  .split('\n').map((w) => w.trim().toLowerCase())
  .filter((w) => /^[a-z]{3,}$/.test(w))
  .slice(0, 5000);
mkdirSync('data', { recursive: true });
writeFileSync('data/common-words.json', JSON.stringify(words));
console.log(`wrote ${words.length} words to data/common-words.json`);
