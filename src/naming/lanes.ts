import type { LaneKey, NamingLane } from './types.js';

export const LANES: readonly NamingLane[] = [
  { key: 'literal', label: 'Literal', weights: { slop: 0.3, phon: 0.3, distinct: 0.4 },
    promptFragment: 'Plain, descriptive names that say what the thing does (e.g. a log viewer named LogView). Prefer real words.' },
  { key: 'evocative', label: 'Evocative', weights: { slop: 0.4, phon: 0.35, distinct: 0.25 },
    promptFragment: 'Real words borrowed for their feeling, not their meaning (like Slack, Notion, Bolt). Single dictionary words preferred.' },
  { key: 'invented', label: 'Invented', weights: { slop: 0.45, phon: 0.4, distinct: 0.15 },
    promptFragment: 'Coined words that do not exist but sound like they could (like Zapier, Klarna). Must be pronounceable on first read.' },
  { key: 'compound', label: 'Compound', weights: { slop: 0.4, phon: 0.3, distinct: 0.3 },
    promptFragment: 'Two short real words fused (like Facebook, Snapchat). Both halves must stay readable; no glue letters.' },
  { key: 'mythic', label: 'Mythic', weights: { slop: 0.3, phon: 0.35, distinct: 0.35 },
    promptFragment: 'Names drawn from mythology, astronomy, botany, old languages (like Atlas, Vesta). Obscure over overused (avoid Apollo/Titan).' },
  { key: 'playful', label: 'Playful', weights: { slop: 0.35, phon: 0.4, distinct: 0.25 },
    promptFragment: 'Light, humorous, human names (like Wombat, Beeper). Should make a person smile without being a joke.' },
  { key: 'premium', label: 'Premium', weights: { slop: 0.35, phon: 0.4, distinct: 0.25 },
    promptFragment: 'Short, expensive-feeling names: 4-7 letters, strong single or double syllable (like Stripe, Vercel, Arc).' },
  { key: 'weird', label: 'Weird', weights: { slop: 0.5, phon: 0.25, distinct: 0.25 },
    promptFragment: 'Deliberately odd, memorable outliers (like Hoodmaps, Gumroad-era internet-weird). Break conventions on purpose, stay typeable.' },
];

export function getLane(key: LaneKey): NamingLane {
  const lane = LANES.find((l) => l.key === key);
  if (!lane) throw new Error(`Unknown naming lane: ${key}`);
  return lane;
}
