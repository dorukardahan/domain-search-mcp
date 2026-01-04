/**
 * REST API Routes for Tool Execution
 *
 * Provides HTTP endpoints for each MCP tool.
 * Used by ChatGPT Actions and other REST API clients.
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  executeSearchDomain,
  executeBulkSearch,
  executeCompareRegistrars,
  executeSuggestDomains,
  executeSuggestDomainsSmart,
  executeTldInfo,
  executeCheckSocials,
  executeAnalyzeProject,
  executeHuntDomains,
  executeExpiringDomains,
} from '../tools/index.js';
import { wrapError } from '../utils/errors.js';
import { formatToolResult } from '../utils/format.js';
import { config } from '../config.js';

// Type for tool executors
type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

// Map tool names to their executors
const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  search_domain: executeSearchDomain as ToolExecutor,
  bulk_search: executeBulkSearch as ToolExecutor,
  compare_registrars: executeCompareRegistrars as ToolExecutor,
  suggest_domains: executeSuggestDomains as ToolExecutor,
  suggest_domains_smart: executeSuggestDomainsSmart as ToolExecutor,
  tld_info: executeTldInfo as ToolExecutor,
  check_socials: executeCheckSocials as ToolExecutor,
  analyze_project: executeAnalyzeProject as ToolExecutor,
  hunt_domains: executeHuntDomains as ToolExecutor,
  expiring_domains: executeExpiringDomains as ToolExecutor,
};

/**
 * Create REST API router for tools.
 */
export function createApiRouter(): Router {
  const router = Router();

  // Generic tool execution handler
  const handleToolExecution = (toolName: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const executor = TOOL_EXECUTORS[toolName];

      if (!executor) {
        res.status(404).json({
          success: false,
          error: {
            code: 'UNKNOWN_TOOL',
            message: `Tool "${toolName}" not found`,
          },
        });
        return;
      }

      try {
        const args = req.body || {};
        const result = await executor(args);

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        const wrapped = wrapError(error);

        // Determine HTTP status from error code
        let status = 500;
        if (wrapped.code === 'VALIDATION_ERROR' || wrapped.code === 'INVALID_INPUT') {
          status = 400;
        } else if (wrapped.code === 'RATE_LIMIT_EXCEEDED') {
          status = 429;
        } else if (wrapped.code === 'NOT_FOUND') {
          status = 404;
        }

        res.status(status).json({
          success: false,
          error: {
            code: wrapped.code,
            message: wrapped.userMessage,
            retryable: wrapped.retryable,
          },
        });
      }
    };
  };

  // Register routes for all tools
  router.post('/tools/search_domain', handleToolExecution('search_domain'));
  router.post('/tools/bulk_search', handleToolExecution('bulk_search'));
  router.post('/tools/compare_registrars', handleToolExecution('compare_registrars'));
  router.post('/tools/suggest_domains', handleToolExecution('suggest_domains'));
  router.post('/tools/suggest_domains_smart', handleToolExecution('suggest_domains_smart'));
  router.post('/tools/tld_info', handleToolExecution('tld_info'));
  router.post('/tools/check_socials', handleToolExecution('check_socials'));
  router.post('/tools/analyze_project', handleToolExecution('analyze_project'));
  router.post('/tools/hunt_domains', handleToolExecution('hunt_domains'));
  router.post('/tools/expiring_domains', handleToolExecution('expiring_domains'));

  return router;
}
