/**
 * Project Analyzer Service
 *
 * Extracts context from local projects or GitHub repositories
 * to generate more relevant domain name suggestions.
 *
 * Supports:
 * - Node.js (package.json)
 * - Python (pyproject.toml, setup.py)
 * - Rust (Cargo.toml)
 * - Go (go.mod)
 * - README files for descriptions
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { detectIndustry, segmentWords } from '../utils/semantic-engine.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extracted project context for domain suggestion.
 */
export interface ProjectContext {
  /** Project name from manifest */
  name: string;
  /** Project description */
  description?: string;
  /** Detected industry (tech, finance, health, etc.) */
  industry?: string;
  /** Keywords extracted from project */
  keywords: string[];
  /** Brand-worthy words for inspiration */
  brandWords: string[];
  /** Source of the project (local or github) */
  source: 'local' | 'github';
  /** Repository URL if applicable */
  repositoryUrl?: string;
}

/**
 * Analysis result with metadata.
 */
export interface ProjectAnalysisResult {
  /** Extracted project context */
  project: ProjectContext;
  /** Files that were analyzed */
  extractedFrom: string[];
  /** Insights about the project */
  insights: string[];
  /** Any warnings during analysis */
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MANIFEST PARSERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse package.json for Node.js projects.
 */
function parsePackageJson(content: string): Partial<ProjectContext> {
  try {
    const pkg = JSON.parse(content) as {
      name?: string;
      description?: string;
      keywords?: string[];
      repository?: string | { url?: string };
    };

    const result: Partial<ProjectContext> = {};

    if (pkg.name) {
      result.name = pkg.name.replace(/^@[^/]+\//, ''); // Remove scope
    }

    if (pkg.description) {
      result.description = pkg.description;
    }

    if (pkg.keywords && Array.isArray(pkg.keywords)) {
      result.keywords = pkg.keywords;
    }

    // Extract repository URL
    if (pkg.repository) {
      if (typeof pkg.repository === 'string') {
        result.repositoryUrl = pkg.repository;
      } else if (pkg.repository.url) {
        result.repositoryUrl = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
      }
    }

    return result;
  } catch (error) {
    logger.warn('Failed to parse package.json', { error });
    return {};
  }
}

/**
 * Parse pyproject.toml for Python projects.
 */
function parsePyprojectToml(content: string): Partial<ProjectContext> {
  const result: Partial<ProjectContext> = {};

  // Simple TOML parsing for common fields
  const nameMatch = content.match(/^name\s*=\s*["']([^"']+)["']/m);
  if (nameMatch) {
    result.name = nameMatch[1];
  }

  const descMatch = content.match(/^description\s*=\s*["']([^"']+)["']/m);
  if (descMatch) {
    result.description = descMatch[1];
  }

  // Keywords array
  const keywordsMatch = content.match(/^keywords\s*=\s*\[([\s\S]*?)\]/m);
  if (keywordsMatch && keywordsMatch[1]) {
    const keywordsStr = keywordsMatch[1];
    result.keywords = keywordsStr
      .split(',')
      .map(k => k.trim().replace(/["']/g, ''))
      .filter(k => k.length > 0);
  }

  return result;
}

/**
 * Parse Cargo.toml for Rust projects.
 */
function parseCargoToml(content: string): Partial<ProjectContext> {
  const result: Partial<ProjectContext> = {};

  const nameMatch = content.match(/^name\s*=\s*["']([^"']+)["']/m);
  if (nameMatch && nameMatch[1]) {
    result.name = nameMatch[1];
  }

  const descMatch = content.match(/^description\s*=\s*["']([^"']+)["']/m);
  if (descMatch && descMatch[1]) {
    result.description = descMatch[1];
  }

  // Keywords array
  const cargoKeywordsMatch = content.match(/^keywords\s*=\s*\[([\s\S]*?)\]/m);
  if (cargoKeywordsMatch && cargoKeywordsMatch[1]) {
    const keywordsStr = cargoKeywordsMatch[1];
    result.keywords = keywordsStr
      .split(',')
      .map(k => k.trim().replace(/["']/g, ''))
      .filter(k => k.length > 0);
  }

  // Repository URL
  const repoMatch = content.match(/^repository\s*=\s*["']([^"']+)["']/m);
  if (repoMatch) {
    result.repositoryUrl = repoMatch[1];
  }

  return result;
}

/**
 * Parse go.mod for Go projects.
 */
function parseGoMod(content: string): Partial<ProjectContext> {
  const result: Partial<ProjectContext> = {};

  // Module path: module github.com/user/project
  const moduleMatch = content.match(/^module\s+(\S+)/m);
  if (moduleMatch && moduleMatch[1]) {
    const modulePath = moduleMatch[1];
    // Extract project name from module path
    const parts = modulePath.split('/');
    result.name = parts[parts.length - 1];

    // If it's a github URL, set repository
    if (modulePath.includes('github.com')) {
      result.repositoryUrl = `https://${modulePath}`;
    }
  }

  return result;
}

/**
 * Parse README for description and keywords.
 */
function parseReadme(content: string): { description?: string; keywords: string[] } {
  const result: { description?: string; keywords: string[] } = { keywords: [] };

  // Get first paragraph after # header as description
  const lines = content.split('\n');
  let foundHeader = false;
  const descLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (foundHeader) break; // Stop at next header
      foundHeader = true;
      continue;
    }
    if (foundHeader && line.trim()) {
      descLines.push(line.trim());
      if (descLines.length >= 3) break; // Max 3 lines
    }
  }

  if (descLines.length > 0) {
    result.description = descLines.join(' ').slice(0, 300);
  }

  // Extract potential keywords from headers and bold text
  const headers = content.match(/^#+\s+(.+)$/gm) || [];
  const boldText = content.match(/\*\*([^*]+)\*\*/g) || [];

  const potentialKeywords = [
    ...headers.map(h => h.replace(/^#+\s+/, '').toLowerCase()),
    ...boldText.map(b => b.replace(/\*\*/g, '').toLowerCase()),
  ];

  // Filter to meaningful keywords
  result.keywords = potentialKeywords
    .flatMap(k => k.split(/\s+/))
    .filter(k => k.length >= 3 && k.length <= 15)
    .filter(k => /^[a-z]+$/.test(k))
    .slice(0, 10);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYZER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze a local project directory.
 */
export async function analyzeLocalProject(
  projectPath: string,
  options: { includeSourceFiles?: boolean } = {},
): Promise<ProjectAnalysisResult> {
  const extractedFrom: string[] = [];
  const insights: string[] = [];
  const warnings: string[] = [];
  let context: Partial<ProjectContext> = {
    source: 'local',
    keywords: [],
    brandWords: [],
  };

  // Resolve absolute path
  const absPath = path.resolve(projectPath);

  // Check if directory exists
  if (!fs.existsSync(absPath)) {
    throw new Error(`Project path does not exist: ${absPath}`);
  }

  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${absPath}`);
  }

  // Manifest file priority
  const manifestFiles = [
    { file: 'package.json', parser: parsePackageJson, type: 'Node.js' },
    { file: 'pyproject.toml', parser: parsePyprojectToml, type: 'Python' },
    { file: 'Cargo.toml', parser: parseCargoToml, type: 'Rust' },
    { file: 'go.mod', parser: parseGoMod, type: 'Go' },
  ];

  // Try each manifest file
  for (const { file, parser, type } of manifestFiles) {
    const filePath = path.join(absPath, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parser(content);
        context = { ...context, ...parsed };
        extractedFrom.push(file);
        insights.push(`Detected ${type} project from ${file}`);
        break; // Use first found manifest
      } catch (error) {
        warnings.push(`Failed to parse ${file}: ${error}`);
      }
    }
  }

  // Try README files
  const readmeFiles = ['README.md', 'readme.md', 'README.MD', 'README'];
  for (const file of readmeFiles) {
    const filePath = path.join(absPath, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseReadme(content);
        if (!context.description && parsed.description) {
          context.description = parsed.description;
        }
        if (parsed.keywords.length > 0) {
          context.keywords = [...(context.keywords || []), ...parsed.keywords];
        }
        extractedFrom.push(file);
        break;
      } catch (error) {
        warnings.push(`Failed to parse ${file}: ${error}`);
      }
    }
  }

  // Generate brand words from name and keywords
  if (context.name) {
    const nameWords = segmentWords(context.name);
    context.brandWords = nameWords.filter(w => w.length >= 3);
  }

  // Detect industry from keywords and description
  const allWords = [
    ...(context.keywords || []),
    ...(context.description?.toLowerCase().split(/\s+/) || []),
  ];
  context.industry = detectIndustry(allWords) || undefined;

  if (context.industry) {
    insights.push(`Detected industry: ${context.industry}`);
  }

  // Deduplicate keywords
  context.keywords = [...new Set(context.keywords)];

  // Warn if no name found
  if (!context.name) {
    context.name = path.basename(absPath);
    warnings.push(`No project name found, using directory name: ${context.name}`);
  }

  return {
    project: context as ProjectContext,
    extractedFrom,
    insights,
    warnings,
  };
}

/**
 * Analyze a GitHub repository via its API.
 */
export async function analyzeGitHubProject(
  repoUrl: string,
  options: { includeSourceFiles?: boolean } = {},
): Promise<ProjectAnalysisResult> {
  const extractedFrom: string[] = [];
  const insights: string[] = [];
  const warnings: string[] = [];

  // Parse GitHub URL
  const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!urlMatch) {
    throw new Error(`Invalid GitHub URL: ${repoUrl}`);
  }

  const [, owner, repo] = urlMatch;
  if (!owner || !repo) {
    throw new Error(`Could not parse owner/repo from GitHub URL: ${repoUrl}`);
  }
  const cleanRepo = repo.replace(/\.git$/, '');
  const apiBase = `https://api.github.com/repos/${owner}/${cleanRepo}`;

  let context: Partial<ProjectContext> = {
    source: 'github',
    repositoryUrl: `https://github.com/${owner}/${cleanRepo}`,
    keywords: [],
    brandWords: [],
  };

  try {
    // Fetch repo metadata
    const repoResponse = await fetch(apiBase, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'domain-search-mcp',
      },
    });

    if (!repoResponse.ok) {
      throw new Error(`GitHub API error: ${repoResponse.status}`);
    }

    const repoData = (await repoResponse.json()) as {
      name?: string;
      description?: string;
      topics?: string[];
      language?: string;
    };

    if (repoData.name) {
      context.name = repoData.name;
    }

    if (repoData.description) {
      context.description = repoData.description;
    }

    if (repoData.topics && Array.isArray(repoData.topics)) {
      context.keywords = repoData.topics;
      insights.push(`Found ${repoData.topics.length} GitHub topics`);
    }

    if (repoData.language) {
      insights.push(`Primary language: ${repoData.language}`);
    }

    extractedFrom.push('GitHub API (repository metadata)');
  } catch (error) {
    warnings.push(`Failed to fetch GitHub metadata: ${error}`);
  }

  // Try to fetch package.json for additional context
  try {
    const pkgResponse = await fetch(`${apiBase}/contents/package.json`, {
      headers: {
        'Accept': 'application/vnd.github.v3.raw',
        'User-Agent': 'domain-search-mcp',
      },
    });

    if (pkgResponse.ok) {
      const pkgContent = await pkgResponse.text();
      const parsed = parsePackageJson(pkgContent);
      if (parsed.keywords) {
        context.keywords = [...(context.keywords || []), ...parsed.keywords];
      }
      if (!context.description && parsed.description) {
        context.description = parsed.description;
      }
      extractedFrom.push('package.json');
    }
  } catch {
    // Ignore - not a Node.js project
  }

  // Generate brand words from name
  if (context.name) {
    const nameWords = segmentWords(context.name);
    context.brandWords = nameWords.filter(w => w.length >= 3);
  }

  // Detect industry
  const allWords = [
    ...(context.keywords || []),
    ...(context.description?.toLowerCase().split(/\s+/) || []),
  ];
  context.industry = detectIndustry(allWords) || undefined;

  if (context.industry) {
    insights.push(`Detected industry: ${context.industry}`);
  }

  // Deduplicate keywords
  context.keywords = [...new Set(context.keywords)];

  if (!context.name) {
    context.name = cleanRepo;
  }

  return {
    project: context as ProjectContext,
    extractedFrom,
    insights,
    warnings,
  };
}

/**
 * Analyze a project from path or URL.
 *
 * Automatically detects if input is a local path or GitHub URL.
 */
export async function analyzeProject(
  pathOrUrl: string,
  options: { includeSourceFiles?: boolean } = {},
): Promise<ProjectAnalysisResult> {
  // Check if it's a GitHub URL
  if (pathOrUrl.includes('github.com')) {
    return analyzeGitHubProject(pathOrUrl, options);
  }

  // Otherwise treat as local path
  return analyzeLocalProject(pathOrUrl, options);
}
