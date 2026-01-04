/**
 * OpenAPI Specification Generator
 *
 * Generates OpenAPI 3.1 spec from MCP tool definitions.
 * Enables ChatGPT Actions and other REST API consumers.
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI methods
extendZodWithOpenApi(z);

// Import all tool schemas
import {
  searchDomainSchema,
  searchDomainTool,
  bulkSearchSchema,
  bulkSearchTool,
  compareRegistrarsSchema,
  compareRegistrarsTool,
  suggestDomainsSchema,
  suggestDomainsTool,
  suggestDomainsSmartSchema,
  suggestDomainsSmartTool,
  tldInfoSchema,
  tldInfoTool,
  checkSocialsSchema,
  checkSocialsTool,
  analyzeProjectSchema,
  analyzeProjectTool,
  huntDomainsSchema,
  huntDomainsTool,
  expiringDomainsSchema,
  expiringDomainsTool,
} from '../tools/index.js';

// Tool configuration for OpenAPI generation
interface ToolConfig {
  name: string;
  description: string;
  schema: z.ZodType;
  operationId: string;
}

// Map tools to their schemas
const TOOL_CONFIGS: ToolConfig[] = [
  {
    name: searchDomainTool.name,
    description: searchDomainTool.description,
    schema: searchDomainSchema,
    operationId: 'searchDomain',
  },
  {
    name: bulkSearchTool.name,
    description: bulkSearchTool.description,
    schema: bulkSearchSchema,
    operationId: 'bulkSearch',
  },
  {
    name: compareRegistrarsTool.name,
    description: compareRegistrarsTool.description,
    schema: compareRegistrarsSchema,
    operationId: 'compareRegistrars',
  },
  {
    name: suggestDomainsTool.name,
    description: suggestDomainsTool.description,
    schema: suggestDomainsSchema,
    operationId: 'suggestDomains',
  },
  {
    name: suggestDomainsSmartTool.name,
    description: suggestDomainsSmartTool.description,
    schema: suggestDomainsSmartSchema,
    operationId: 'suggestDomainsSmart',
  },
  {
    name: tldInfoTool.name,
    description: tldInfoTool.description,
    schema: tldInfoSchema,
    operationId: 'getTldInfo',
  },
  {
    name: checkSocialsTool.name,
    description: checkSocialsTool.description,
    schema: checkSocialsSchema,
    operationId: 'checkSocials',
  },
  {
    name: analyzeProjectTool.name,
    description: analyzeProjectTool.description,
    schema: analyzeProjectSchema,
    operationId: 'analyzeProject',
  },
  {
    name: huntDomainsTool.name,
    description: huntDomainsTool.description,
    schema: huntDomainsSchema,
    operationId: 'huntDomains',
  },
  {
    name: expiringDomainsTool.name,
    description: expiringDomainsTool.description,
    schema: expiringDomainsSchema,
    operationId: 'getExpiringDomains',
  },
];

// Generic success response schema
const SuccessResponseSchema = z.object({
  success: z.boolean().describe('Whether the operation succeeded'),
  data: z.unknown().describe('Tool-specific response data'),
});

// Error response schema
const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().describe('Error code'),
    message: z.string().describe('Human-readable error message'),
    retryable: z.boolean().optional().describe('Whether the request can be retried'),
  }),
});

/**
 * Generate OpenAPI specification from MCP tool definitions.
 *
 * @param baseUrl - Base URL for the API (e.g., https://api.example.com)
 * @param version - API version (defaults to package version)
 */
export function generateOpenAPISpec(
  baseUrl: string = 'https://api.domain-search-mcp.com',
  version?: string
): object {
  const registry = new OpenAPIRegistry();

  // Register response schemas
  registry.register('SuccessResponse', SuccessResponseSchema);
  registry.register('ErrorResponse', ErrorResponseSchema);

  // Register each tool as an API endpoint
  for (const tool of TOOL_CONFIGS) {
    // ChatGPT has a 300 char limit for operation descriptions
    const truncatedDescription =
      tool.description.length > 295
        ? tool.description.slice(0, 292) + '...'
        : tool.description;

    registry.registerPath({
      method: 'post',
      path: `/api/tools/${tool.name}`,
      operationId: tool.operationId,
      summary: tool.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: truncatedDescription,
      request: {
        body: {
          content: {
            'application/json': {
              schema: tool.schema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: SuccessResponseSchema,
            },
          },
        },
        400: {
          description: 'Bad request - invalid parameters',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
        429: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
        500: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
      },
    });
  }

  // Generate the OpenAPI document
  const generator = new OpenApiGeneratorV31(registry.definitions);

  const apiVersion = version || require('../../package.json').version;

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Domain Search MCP API',
      version: apiVersion,
      description: `REST API for domain search operations. Provides domain availability checking, AI-powered suggestions, pricing comparison, and social handle validation.

This API is auto-generated from MCP tool definitions and can be used with:
- ChatGPT Actions / Custom GPTs
- OpenAI Assistants
- Any REST API client

**Note:** For MCP protocol clients (Claude Desktop, Cursor, VS Code), use the MCP endpoint at \`/mcp\` instead.`,
      contact: {
        name: 'Domain Search MCP',
        url: 'https://github.com/dorukardahan/domain-search-mcp',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'domains',
        description: 'Domain availability and search operations',
      },
      {
        name: 'suggestions',
        description: 'AI-powered domain name suggestions',
      },
      {
        name: 'social',
        description: 'Social media handle availability',
      },
    ],
  });
}

/**
 * Get the OpenAPI spec as a JSON string.
 */
export function getOpenAPISpecJson(baseUrl?: string, version?: string): string {
  return JSON.stringify(generateOpenAPISpec(baseUrl, version), null, 2);
}
