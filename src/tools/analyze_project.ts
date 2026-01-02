/**
 * analyze_project Tool - Extract context from projects for domain suggestions.
 *
 * Analyzes local projects or GitHub repositories to extract:
 * - Project name and description
 * - Keywords from manifest files
 * - Detected industry
 * - Automatic domain suggestions based on context
 */

import { z } from 'zod';
import { analyzeProject, type ProjectAnalysisResult } from '../services/project-analyzer.js';
import { executeSuggestDomainsSmart } from './suggest_domains_smart.js';
import { wrapError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { QwenContext } from '../services/qwen-inference.js';

/**
 * Input schema for analyze_project.
 */
export const analyzeProjectSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Path to analyze. Can be a local directory path (e.g., '/path/to/project') " +
      "or a GitHub URL (e.g., 'https://github.com/user/repo')."
    ),
  include_source_files: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Scan source files for additional keywords (slower). Defaults to false."
    ),
  suggest_domains: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Automatically generate domain suggestions based on extracted context. Defaults to true."
    ),
  tld: z
    .string()
    .optional()
    .default('com')
    .describe("Primary TLD for suggestions. Defaults to 'com'."),
  max_suggestions: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .default(10)
    .describe("Maximum domain suggestions to return (1-30). Defaults to 10."),
  style: z
    .enum(['brandable', 'descriptive', 'short', 'creative'])
    .optional()
    .default('brandable')
    .describe(
      "Suggestion style: 'brandable' (invented words), 'descriptive' (keyword-based), " +
      "'short' (minimal), 'creative' (playful). Defaults to 'brandable'."
    ),
});

export type AnalyzeProjectInput = z.infer<typeof analyzeProjectSchema>;

/**
 * Tool definition for MCP.
 */
export const analyzeProjectTool = {
  name: 'analyze_project',
  description: `Analyze a local project or GitHub repository to extract context for domain suggestions.

This tool scans project manifest files (package.json, pyproject.toml, Cargo.toml, go.mod)
and README files to understand your project, then generates relevant domain name suggestions.

**Use Cases:**
1. Find a domain for your existing codebase
2. Get domain ideas that match your project's identity
3. Analyze any GitHub repo for branding inspiration

**Supported Projects:**
- Node.js (package.json)
- Python (pyproject.toml, setup.py)
- Rust (Cargo.toml)
- Go (go.mod)
- Any project with README.md

**Examples:**
- analyze_project("/path/to/my-app") → Analyzes local project
- analyze_project("https://github.com/vercel/next.js") → Analyzes GitHub repo
- analyze_project("/my-project", suggest_domains=true, style="short") → Short brandable names`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: "Local path or GitHub URL to analyze.",
      },
      include_source_files: {
        type: 'boolean',
        description: "Scan source files for keywords. Defaults to false.",
      },
      suggest_domains: {
        type: 'boolean',
        description: "Auto-generate domain suggestions. Defaults to true.",
      },
      tld: {
        type: 'string',
        description: "Primary TLD for suggestions. Defaults to 'com'.",
      },
      max_suggestions: {
        type: 'number',
        description: "Maximum suggestions (1-30). Defaults to 10.",
      },
      style: {
        type: 'string',
        enum: ['brandable', 'descriptive', 'short', 'creative'],
        description: "Suggestion style preference.",
      },
    },
    required: ['path'],
  },
};

/**
 * Response format for analyze_project.
 */
interface AnalyzeProjectResponse {
  /** Extracted project context */
  project: {
    name: string;
    description?: string;
    keywords: string[];
    detected_industry?: string;
    source: 'local' | 'github';
    repository_url?: string;
  };
  /** Files that were analyzed */
  extracted_from: string[];
  /** Insights about the project */
  insights: string[];
  /** Any warnings */
  warnings: string[];
  /** Domain suggestions if enabled */
  suggestions?: {
    available: Array<{
      domain: string;
      available: boolean;
      score: number;
      source: string;
    }>;
    premium: Array<{
      domain: string;
      available: boolean;
      score: number;
      source: string;
    }>;
    unavailable_count: number;
  };
}

/**
 * Execute the analyze_project tool.
 */
export async function executeAnalyzeProject(
  input: AnalyzeProjectInput,
): Promise<AnalyzeProjectResponse> {
  try {
    const validated = analyzeProjectSchema.parse(input);
    const { path, include_source_files, suggest_domains, tld, max_suggestions, style } = validated;

    logger.info('Analyzing project', { path, include_source_files, suggest_domains });

    // Analyze the project
    let analysis: ProjectAnalysisResult;
    try {
      analysis = await analyzeProject(path, { includeSourceFiles: include_source_files });
    } catch (error) {
      throw new Error(
        `Failed to analyze project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Build response
    const response: AnalyzeProjectResponse = {
      project: {
        name: analysis.project.name,
        description: analysis.project.description,
        keywords: analysis.project.keywords,
        detected_industry: analysis.project.industry,
        source: analysis.project.source,
        repository_url: analysis.project.repositoryUrl,
      },
      extracted_from: analysis.extractedFrom,
      insights: analysis.insights,
      warnings: analysis.warnings,
    };

    // Generate domain suggestions if enabled
    if (suggest_domains) {
      // Build query from project context
      const queryParts: string[] = [];

      // Add project name (segmented if compound)
      if (analysis.project.name) {
        queryParts.push(analysis.project.name);
      }

      // Add top keywords
      if (analysis.project.keywords.length > 0) {
        queryParts.push(...analysis.project.keywords.slice(0, 3));
      }

      const query = queryParts.join(' ');

      // Build context for Qwen
      const context: QwenContext = {
        projectName: analysis.project.name,
        description: analysis.project.description,
        industry: analysis.project.industry,
        keywords: analysis.project.keywords,
        brandWords: analysis.project.brandWords,
        repositoryUrl: analysis.project.repositoryUrl,
      };

      logger.debug('Generating domain suggestions with context', {
        query,
        industry: context.industry,
        keywords: context.keywords?.length || 0,
      });

      try {
        // Use suggest_domains_smart with project context
        const suggestResult = await executeSuggestDomainsSmart({
          query,
          tld,
          industry: context.industry as 'tech' | 'startup' | 'finance' | 'health' | 'food' | 'creative' | 'ecommerce' | 'education' | 'gaming' | 'social' | undefined,
          style,
          max_suggestions,
          include_premium: false,
        });

        response.suggestions = {
          available: suggestResult.results.available.map(s => ({
            domain: s.domain,
            available: s.available,
            score: s.score,
            source: s.source,
          })),
          premium: suggestResult.results.premium.map(s => ({
            domain: s.domain,
            available: s.available,
            score: s.score,
            source: s.source,
          })),
          unavailable_count: suggestResult.results.unavailable_count,
        };

        // Add suggestion insights
        response.insights.push(
          `Generated ${suggestResult.results.available.length} domain suggestions`
        );

        if (suggestResult.results.available.length > 0) {
          response.insights.push(`Top domain: ${suggestResult.results.available[0]!.domain}`);
        }
      } catch (error) {
        response.warnings.push(
          `Failed to generate suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return response;
  } catch (error) {
    throw wrapError(error);
  }
}
