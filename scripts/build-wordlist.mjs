// scripts/build-wordlist.mjs
// Dev-time script. Downloads two public English frequency lists and commits
// them to data/ so runtime stays offline. Run manually.
//
// 1. data/common-words.json — google-10000-english-no-swears, full filtered
//    list (length >= 3, no top-N cut). Everyday-vocabulary frequency corpus
//    used by distinctiveness scoring.
// 2. data/english-words.json — hermitdave/FrequencyWords en_50k ("word count"
//    lines), word column only, same filter, up to 50000 entries. Broader
//    real-word dictionary used by slop-filter's real-word waiver (covers
//    formal/literary words like zenith/synergy/metaphor that the 10k list
//    misses).
import { writeFileSync, mkdirSync } from 'node:fs';

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} (${url})`);
  return res.text();
}

mkdirSync('data', { recursive: true });

const COMMON_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';
const common = (await download(COMMON_URL))
  .split('\n').map((w) => w.trim().toLowerCase())
  .filter((w) => /^[a-z]{3,}$/.test(w));
writeFileSync('data/common-words.json', JSON.stringify(common));
console.log(`wrote ${common.length} words to data/common-words.json`);

const ENGLISH_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';
const english = (await download(ENGLISH_URL))
  .split('\n').map((line) => line.trim().split(/\s+/)[0]?.toLowerCase() ?? '')
  .filter((w) => /^[a-z]{3,}$/.test(w))
  .slice(0, 50000);
writeFileSync('data/english-words.json', JSON.stringify(english));
console.log(`wrote ${english.length} words to data/english-words.json`);
