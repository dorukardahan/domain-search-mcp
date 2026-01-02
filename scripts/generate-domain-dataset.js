#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
};

const count = parseInt(getArg("--count", "100000"), 10);
const outPath = getArg(
  "--out",
  path.join(process.cwd(), "data", "domain-dataset-100k.jsonl"),
);
const seedInput = getArg("--seed", "20251229");

let seed = Number(seedInput);
if (!Number.isFinite(seed) || seed <= 0) seed = 20251229;

function rand() {
  // Park-Miller LCG
  seed = (seed * 48271) % 2147483647;
  return seed / 2147483647;
}

const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickN = (arr, n) => {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
};

const categories = [
  "ai productivity tool",
  "crypto task platform",
  "developer platform",
  "web3 analytics app",
  "search engine for teams",
  "security monitoring tool",
  "creator monetization platform",
  "fintech dashboard",
  "data labeling service",
  "open source devtool",
  "launch tracker",
  "design automation studio",
  "research assistant",
  "market intel platform",
  "devops observability suite",
  "domain search product",
  "community rewards app",
  "micro-saas toolkit",
  "b2b workflow app",
  "agent orchestration layer",
];

const styleTags = [
  "premium",
  "minimal",
  "technical",
  "playful",
  "elegant",
  "bold",
  "futuristic",
  "trustworthy",
  "compact",
  "friendly",
  "serious",
  "modern",
  "clean",
  "edgy",
];

const tlds = [
  ".com",
  ".ai",
  ".io",
  ".xyz",
  ".app",
  ".dev",
  ".net",
  ".co",
  ".org",
  ".me",
  ".gg",
  ".so",
  ".sh",
  ".cloud",
  ".studio",
  ".tools",
  ".site",
  ".shop",
  ".one",
  ".fun",
  ".now",
  ".quest",
  ".tech",
  ".build",
  ".link",
  ".live",
  ".media",
  ".world",
  ".team",
  ".space",
  ".design",
  ".run",
  ".digital",
  ".systems",
  ".software",
  ".services",
  ".zone",
  ".agency",
  ".capital",
  ".ventures",
  ".labs",
  ".works",
  ".page",
  ".cool",
  ".today",
  ".news",
  ".pro",
  ".group",
  ".life",
  ".bio",
  ".wiki",
  ".ink",
  ".mobi",
];

const roots = [
  "scan",
  "seek",
  "hunt",
  "query",
  "index",
  "trace",
  "grid",
  "map",
  "node",
  "flow",
  "mesh",
  "signal",
  "pulse",
  "vector",
  "relay",
  "spark",
  "lumen",
  "stride",
  "vault",
  "forge",
  "stack",
  "scale",
  "align",
  "orbit",
  "atlas",
  "prism",
  "nova",
  "axiom",
  "nexus",
  "nova",
  "kin",
  "orbit",
  "glow",
  "rift",
  "chord",
  "crest",
  "mint",
  "quill",
  "ridge",
];

const vowels = ["a", "e", "i", "o", "u", "ai", "ea", "io", "oa", "ou", "ae"];
const consonants = [
  "b",
  "c",
  "d",
  "f",
  "g",
  "h",
  "j",
  "k",
  "l",
  "m",
  "n",
  "p",
  "r",
  "s",
  "t",
  "v",
  "w",
  "x",
  "z",
  "br",
  "cr",
  "dr",
  "fr",
  "gr",
  "kr",
  "pr",
  "tr",
  "vr",
  "st",
  "sp",
  "sk",
  "gl",
  "cl",
  "pl",
  "sl",
  "sn",
  "sm",
  "th",
  "sh",
  "ch",
];

const suffixes = ["ly", "io", "ify", "labs", "hq", "os", "flow", "base", "data", "kit"];
const prefixes = ["neo", "meta", "ultra", "hyper", "proto", "zen", "vox", "nexo", "omni", "quant"];
const MIN_LEN = 4;
const MAX_LEN = 10;

function blend(a, b) {
  if (a.endsWith(b[0])) return a + b.slice(1);
  if (/[aeiou]$/.test(a) && /^[aeiou]/.test(b)) return a + b.slice(1);
  return a + b;
}

function makeSyllableName(targetLen) {
  let name = "";
  while (name.length < targetLen) {
    name += pick(consonants) + pick(vowels);
    if (name.length < targetLen && rand() < 0.3) name += pick(consonants);
  }
  return name.slice(0, targetLen);
}

function maybeAddDigit(name, targetLen) {
  if (name.length >= targetLen) return name.slice(0, targetLen);
  if (rand() > 0.25) return name;
  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const pos = Math.max(1, Math.min(name.length - 1, Math.floor(rand() * name.length)));
  const withDigit = name.slice(0, pos) + pick(digits) + name.slice(pos);
  return withDigit.slice(0, targetLen);
}

function stylize(name, style) {
  let out = name;
  if (style === "technical") {
    if (!/[xzq]/.test(out) && rand() < 0.6) out = out.slice(0, -1) + pick(["x", "z", "q"]);
  }
  if (style === "playful") {
    if (rand() < 0.5) out = out.replace(/[aeiou]/, (m) => m + m);
  }
  if (style === "premium") {
    if (rand() < 0.4) out = blend(pick(prefixes), out);
  }
  if (style === "minimal") {
    if (out.length > 7) out = out.slice(0, 7);
  }
  return out;
}

function generateBaseName(targetLen) {
  const mode = rand();
  if (mode < 0.4) {
    const a = pick(roots);
    const b = pick(roots);
    return blend(a, b).slice(0, targetLen);
  }
  if (mode < 0.7) {
    const a = pick(roots);
    const suf = pick(suffixes);
    return blend(a, suf).slice(0, targetLen);
  }
  return makeSyllableName(targetLen);
}

function buildConstraint() {
  const constraintType = pick(["length", "suffix", "prefix", "contains"]);
  if (constraintType === "length") {
    return {
      text: `Length ${MIN_LEN}-${MAX_LEN} characters`,
      apply: (name) => name.length >= MIN_LEN && name.length <= MAX_LEN,
      targetLen: () => Math.floor(MIN_LEN + rand() * (MAX_LEN - MIN_LEN + 1)),
    };
  }
  if (constraintType === "suffix") {
    const suffix = pick(["r", "rr", "x", "io", "ly", "ai"]);
    return {
      text: `Must end with "${suffix}"`,
      apply: (name) =>
        name.length >= MIN_LEN && name.length <= MAX_LEN && name.endsWith(suffix),
      targetLen: () => Math.floor(MIN_LEN + rand() * (MAX_LEN - MIN_LEN + 1)),
      suffix,
    };
  }
  if (constraintType === "prefix") {
    const prefix = pick(["neo", "pro", "zen", "meta", "core", "micro"]);
    return {
      text: `Must start with "${prefix}"`,
      apply: (name) =>
        name.length >= MIN_LEN && name.length <= MAX_LEN && name.startsWith(prefix),
      targetLen: () => Math.floor(MIN_LEN + rand() * (MAX_LEN - MIN_LEN + 1)),
      prefix,
    };
  }
  if (constraintType === "contains") {
    const fragment = pick(["va", "io", "syn", "grid", "flux", "nova"]);
    return {
      text: `Must include "${fragment}"`,
      apply: (name) => name.includes(fragment),
      targetLen: () => Math.floor(6 + rand() * 5),
      fragment,
    };
  }
  const fragment = pick(["va", "io", "syn", "grid", "flux", "nova"]);
  return {
    text: `Must include "${fragment}"`,
    apply: (name) =>
      name.length >= MIN_LEN && name.length <= MAX_LEN && name.includes(fragment),
    targetLen: () => Math.floor(MIN_LEN + rand() * (MAX_LEN - MIN_LEN + 1)),
    fragment,
  };
}

function generateNames({ count, styles, tldChoices, constraint }) {
  const names = new Set();
  let guard = 0;
  while (names.size < count && guard < count * 50) {
    guard += 1;
    const targetLen = constraint.targetLen ? constraint.targetLen() : Math.floor(5 + rand() * 6);
    let name = generateBaseName(targetLen);
    for (const style of styles) name = stylize(name, style);

    if (constraint.prefix && !name.startsWith(constraint.prefix)) {
      name = constraint.prefix + name;
    }
    if (constraint.suffix && !name.endsWith(constraint.suffix)) {
      name = name + constraint.suffix;
    }
    if (constraint.fragment && !name.includes(constraint.fragment)) {
      const insertAt = Math.min(2, name.length);
      name = name.slice(0, insertAt) + constraint.fragment + name.slice(insertAt);
    }

    name = maybeAddDigit(name, targetLen);
    if (name.length > MAX_LEN) continue;
    name = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!constraint.apply(name)) continue;

    const tld = pick(tldChoices);
    names.add(name + tld);
  }
  return Array.from(names);
}

function makePrompt({ n, category, styles, tldChoices, constraint }) {
  const styleText = styles.join(", ");
  const tldText = tldChoices.join(", ");
  return `Generate ${n} brandable domain names for a ${category}. Style: ${styleText}. Length ${MIN_LEN}-${MAX_LEN}. Constraints: ${constraint.text}. Use TLDs: ${tldText}. Provide a short reason for each name.`;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const stream = fs.createWriteStream(outPath, { encoding: "utf8" });

for (let i = 0; i < count; i += 1) {
  const n = pick([6, 8, 10, 12]);
  const category = pick(categories);
  const styles = pickN(styleTags, pick([1, 2, 3]));
  const tldChoices = pickN(tlds, pick([2, 3]));
  const constraint = buildConstraint();

  const names = generateNames({ count: n, styles, tldChoices, constraint });
  if (names.length < n) {
    i -= 1;
    continue;
  }

  const prompt = makePrompt({ n, category, styles, tldChoices, constraint });
  const response = names
    .map((name) => {
      const styleHint = pick(styles);
      const rationale = pick([
        `Short and ${styleHint}, fits ${category}`,
        `Memorable, ${styleHint} tone for ${category}`,
        `Compact brand feel with ${styleHint} vibe`,
        `Evokes ${pick(roots)} while staying ${styleHint}`,
      ]);
      return `- ${name} — ${rationale}`;
    })
    .join("\n");

  const row = {
    prompt,
    response,
    meta: {
      category,
      styles,
      tlds: tldChoices,
      constraint: constraint.text,
    },
  };

  stream.write(JSON.stringify(row) + "\n");
}

stream.end();
console.log(`Wrote ${count} rows to ${outPath}`);
