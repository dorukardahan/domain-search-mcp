/**
 * name_project Tool - Two-Phase Naming Engine.
 *
 * Phase 1 (no candidates): returns generation instructions for the CALLING
 * model to produce name candidates across selected naming lanes.
 * Phase 2 (candidates given): scores, ranks, and optionally runs
 * availability checks (domain/social) on the submitted candidates.
 */

import { z } from 'zod';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LANES, getLane } from '../naming/lanes.js';
import { scoreName } from '../naming/scorer.js';
import { clearName, type ClearanceReport } from '../naming/clearance.js';
import type { LaneKey, ScoredName } from '../naming/types.js';
import { wrapError } from '../utils/errors.js';
import { getTransport } from '../runtime-context.js';

const LANE_KEYS = LANES.map((l) => l.key) as [LaneKey, ...LaneKey[]];
const DEFAULT_LANES: LaneKey[] = ['evocative', 'invented', 'compound', 'premium'];

/**
 * Input schema for name_project.
 */
export const nameProjectSchema = z.object({
  mode: z.enum(['brief', 'auto', 'from_name', 'from_domain']),
  brief: z.string().min(1).max(2000).optional(),
  name: z.string().min(1).max(63).optional(),
  candidates: z.array(z.string().min(1).max(63)).max(50).optional(),
  lanes: z.array(z.enum(LANE_KEYS)).min(1).max(8).optional(),
  targets: z.object({
    tlds: z.array(z.string()).max(10).optional(),
    platforms: z.array(z.string()).max(10).optional(),
  }).optional(),
  constraints: z.object({
    max_length: z.number().int().min(2).max(63).optional(),
    must_include: z.string().max(30).optional(),
  }).optional(),
  project_path: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.mode === 'brief' && !v.brief && !v.candidates) ctx.addIssue({ code: 'custom', message: 'mode=brief requires a brief' });
  if ((v.mode === 'from_name' || v.mode === 'from_domain') && !v.name) ctx.addIssue({ code: 'custom', message: `mode=${v.mode} requires a name` });
});
export type NameProjectInput = z.infer<typeof nameProjectSchema>;

export interface NameProjectResult {
  phase: 1 | 2;
  mode: NameProjectInput['mode'];
  instructions?: string;
  lanes?: { key: LaneKey; promptFragment: string }[];
  resubmit_hint?: string;
  shortlist?: (ScoredName & { clearance?: ClearanceReport })[];
  notes?: string[];
}

/**
 * Tool definition for MCP.
 */
export const nameProjectTool = {
  name: 'name_project',
  description:
    'Two-phase naming engine. Call without candidates to receive generation instructions for YOUR model ' +
    '(you generate the names). Call again with candidates[] to get anti-slop scoring, ranking, and live ' +
    'availability checks (domains, socials, npm). Modes: brief (describe it), auto (I analyze the current ' +
    'workspace), from_name (find domains/variants for a name), from_domain (fit a found domain to a project).',
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['brief', 'auto', 'from_name', 'from_domain'] },
      brief: { type: 'string', description: 'What you are naming (mode=brief).' },
      name: { type: 'string', description: 'Existing name or found domain (from_name / from_domain).' },
      candidates: { type: 'array', items: { type: 'string' }, description: 'Phase 2: names your model generated (max 50).' },
      lanes: { type: 'array', items: { type: 'string' }, description: 'Naming lanes to use.' },
      targets: { type: 'object', description: 'Availability-check targets: {tlds:[...], platforms:[...]}. Empty = pure naming, no availability checks.' },
      constraints: { type: 'object', description: '{max_length, must_include}' },
      project_path: { type: 'string', description: 'auto mode: project dir for a light server-side scan (package.json name/description + top-level directory names, best-effort, no throw on missing/unreadable path).' },
    },
    required: ['mode'],
  },
};

/**
 * Light server-side scan of a project directory: manifest name/description
 * (package.json only, best-effort) plus top-level directory names. Purely
 * additive context for phase-1 instructions - any FS error (missing path,
 * unreadable manifest, corrupt JSON) is swallowed and the caller falls back
 * silently to the plain path-mention wording. Never throws.
 */
function scanProjectPath(projectPath: string): string | null {
  try {
    let manifestPart = '';
    try {
      const pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8')) as {
        name?: string; description?: string;
      };
      if (pkg.name) manifestPart = `manifest name ${pkg.name}${pkg.description ? ` - ${pkg.description}` : ''}`;
    } catch {
      // No readable/valid package.json - continue with directory listing only.
    }

    const dirs = readdirSync(projectPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .slice(0, 15)
      .map((e) => e.name);

    const parts = [manifestPart, dirs.length ? `top-level dirs: ${dirs.join(', ')}` : ''].filter(Boolean);
    return parts.length ? `Server scan: ${parts.join('; ')}.` : null;
  } catch {
    return null;
  }
}

function phase1(input: NameProjectInput): NameProjectResult {
  const laneKeys = input.lanes ?? DEFAULT_LANES;
  const lanes = laneKeys.map((k) => ({ key: k, promptFragment: getLane(k).promptFragment }));
  const constraints = [
    input.constraints?.max_length ? `Maximum length: ${input.constraints.max_length} characters.` : '',
    input.constraints?.must_include ? `Must include the token "${input.constraints.must_include}".` : '',
  ].filter(Boolean).join(' ');

  let subject: string;
  if (input.mode === 'auto') {
    subject =
      'First, analyze the CURRENT workspace yourself: read the README, the package.json/pyproject/Cargo manifest, ' +
      'the source tree top level, and any docs/ overview. Derive a one-paragraph brief: what the project does, ' +
      'who uses it, its personality.';
    if (input.project_path) {
      if (getTransport() === 'http') {
        // Remote HTTP callers must not be able to trigger a server-side filesystem
        // scan (package.json read + directory enumeration) - see runtime-context.ts.
        subject += ` Project root: ${input.project_path}. ` +
          'Note: server-side project scan is disabled over HTTP transport.';
      } else {
        const scan = scanProjectPath(input.project_path);
        subject += ` Project root: ${input.project_path}.` + (scan ? ` ${scan}` : '');
      }
    }
  } else if (input.mode === 'from_name') {
    subject = `The user already loves the name "${input.name}". Generate close variants, spellings, and sibling names around it.`;
  } else if (input.mode === 'from_domain') {
    subject = `The user found the available domain "${input.name}". Generate project/brand names that fit this domain, including casing and treatment of the bare name.`;
  } else {
    subject = `Brief: ${input.brief}`;
  }

  const laneBlock = lanes.map((l) => `- [${l.key}] ${l.promptFragment}`).join('\n');
  return {
    phase: 1,
    mode: input.mode,
    lanes,
    instructions:
      `${subject}\n\nNow generate between 30 and 50 name candidates spread across these lanes:\n${laneBlock}\n` +
      `${constraints}\nRules: single words or tight compounds, no taglines, no explanations yet. ` +
      `Then call name_project again with the SAME arguments plus candidates:[...] to get scoring and availability.`,
    resubmit_hint: 'Call name_project again with candidates[] filled to receive the scored, availability-checked shortlist.',
  };
}

async function phase2(input: NameProjectInput): Promise<NameProjectResult> {
  const laneKeys = input.lanes ?? DEFAULT_LANES;
  const seed = (input.mode === 'from_name' || input.mode === 'from_domain') && input.name
    ? [input.name.split('.')[0]!] : [];
  // Case-insensitive dedup, keeping the first casing seen.
  const byLowercase = new Map<string, string>();
  for (const candidate of [...seed, ...(input.candidates ?? [])]) {
    const key = candidate.toLowerCase();
    if (!byLowercase.has(key)) byLowercase.set(key, candidate);
  }
  const all = [...byLowercase.values()];

  const filtered = all.filter((n) =>
    (!input.constraints?.max_length || n.length <= input.constraints.max_length) &&
    (!input.constraints?.must_include || n.toLowerCase().includes(input.constraints.must_include.toLowerCase())),
  );

  // Best-fit lane: score each candidate under every requested lane and keep
  // the highest-scoring result (its .lane reports the best-fit lane; ties go
  // to the earlier lane in the request order).
  const scored = filtered
    .map((n) => laneKeys
      .map((lane) => scoreName(n, lane))
      .reduce((best, cur) => (cur.total > best.total ? cur : best)))
    .sort((a, b) => b.total - a.total);

  const wantClearance = !!(input.targets?.tlds?.length || input.targets?.platforms?.length);
  const top = scored.slice(0, 12);
  const shortlist = wantClearance
    ? await Promise.all(top.map(async (s) => ({ ...s, clearance: await clearName(s.name, input.targets) })))
    : top;

  const notes = [
    `${all.length} candidates received, ${filtered.length} passed constraints, top ${top.length} returned.`,
    wantClearance ? 'Availability checks run on the shortlist only (protects registries).' : 'No availability-check targets - pure naming mode.',
  ];
  return { phase: 2, mode: input.mode, shortlist, notes };
}

/**
 * Execute the name_project tool.
 */
export async function executeNameProject(input: NameProjectInput): Promise<NameProjectResult> {
  try {
    const parsed = nameProjectSchema.parse(input);
    return parsed.candidates ? await phase2(parsed) : phase1(parsed);
  } catch (error) {
    throw wrapError(error);
  }
}
