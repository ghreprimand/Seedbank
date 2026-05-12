export type OpenAPIObject = Record<string, unknown>;

export const openApiSpec: OpenAPIObject = {
  openapi: '3.1.0',
  info: {
    title: 'Seedbank API',
    version: '2.1.0',
    description: 'Local-first API for Seedbank ideas, AI settings, integrations, backups, tokens, and MCP reads.',
  },
  servers: [
    { url: 'http://localhost:4800' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
    schemas: {
      Idea: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          pitch: { type: 'string' },
          category: { type: 'string' },
          stage: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          moodLabels: { type: 'array', items: { type: 'string' } },
          fullNotes: { type: 'string' },
          hook: { type: 'string' },
          whyItMightWork: { type: 'string' },
          risks: { type: 'string' },
          techStack: { type: 'string' },
          jamScore: { type: 'number' },
          excitementScore: { type: 'number' },
          relatedIdeaIds: { type: 'array', items: { type: 'string' } },
          links: { type: 'array', items: { type: 'object' } },
          images: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: ['string', 'null'], format: 'date-time' },
          graduatedTo: { type: ['string', 'null'] },
        },
      },
      Attachment: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
      },
      WebhooksConfig: {
        type: 'object',
        properties: {
          url: { type: ['string', 'null'] },
          events: { type: 'array', items: { type: 'string' } },
        },
      },
      PublicToken: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
          lastUsedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      IntegrationSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          icon: { type: 'string' },
          configured: { type: 'boolean' },
        },
      },
      ServerInfo: {
        type: 'object',
        properties: {
          port: { type: 'number' },
          version: { type: 'string' },
          uptimeMs: { type: 'number' },
          dbPath: { type: 'string' },
        },
      },
      AggregateSettings: {
        type: 'object',
        properties: {
          ui: { type: 'object' },
          ai: { type: 'object' },
          api: {
            type: 'object',
            properties: {
              tokens: { type: 'array', items: { $ref: '#/components/schemas/PublicToken' } },
              webhooks: { $ref: '#/components/schemas/WebhooksConfig' },
            },
          },
          agents: { type: 'object' },
          backups: { type: 'object' },
          integrations: { type: 'array', items: { $ref: '#/components/schemas/IntegrationSummary' } },
          server: { $ref: '#/components/schemas/ServerInfo' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: { summary: 'Health check' },
    },
    '/api/openapi.json': {
      get: { summary: 'OpenAPI document' },
    },
    '/api/ideas': {
      get: { summary: 'List ideas', security: [{ bearerAuth: [] }] },
      post: { summary: 'Create idea', security: [{ bearerAuth: [] }] },
    },
    '/api/ideas/{id}': {
      get: { summary: 'Get idea', security: [{ bearerAuth: [] }] },
      patch: { summary: 'Update idea', security: [{ bearerAuth: [] }] },
      delete: { summary: 'Delete idea', security: [{ bearerAuth: [] }] },
    },
    '/api/ideas/{id}/versions': {
      get: { summary: 'List idea versions', security: [{ bearerAuth: [] }] },
      post: { summary: 'Create idea version', security: [{ bearerAuth: [] }] },
    },
    '/api/ideas/{id}/versions/restore/{versionId}': {
      post: { summary: 'Restore idea version', security: [{ bearerAuth: [] }] },
    },
    '/api/ideas/{id}/attachments': {
      get: { summary: 'List idea attachments', 'x-stub': true },
      post: { summary: 'Upload idea attachment', 'x-stub': true },
      delete: { summary: 'Delete idea attachment', 'x-stub': true },
    },
    '/api/search': {
      get: { summary: 'Search ideas', 'x-stub': true },
    },
    '/api/stats': {
      get: { summary: 'Idea statistics', security: [{ bearerAuth: [] }] },
    },
    '/api/ai/config': {
      get: { summary: 'Get AI config', security: [{ bearerAuth: [] }] },
      post: { summary: 'Update AI config (legacy)', security: [{ bearerAuth: [] }], deprecated: true },
    },
    '/api/ai/suggest': {
      post: { summary: 'AI suggestions', security: [{ bearerAuth: [] }] },
    },
    '/api/ai/chat': {
      post: { summary: 'Streaming AI chat', security: [{ bearerAuth: [] }] },
    },
    '/api/settings': {
      get: {
        summary: 'Aggregate settings',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Current settings',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AggregateSettings' },
              },
            },
          },
        },
      },
    },
    '/api/settings/{section}': {
      patch: { summary: 'Update settings section', security: [{ bearerAuth: [] }] },
    },
    '/api/server/info': {
      get: {
        summary: 'Server runtime info',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Server info',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServerInfo' },
              },
            },
          },
        },
      },
    },
    '/api/backups': {
      get: { summary: 'Backup status', security: [{ bearerAuth: [] }] },
    },
    '/api/backups/config': {
      patch: { summary: 'Update backup config', security: [{ bearerAuth: [] }] },
    },
    '/api/backups/run': {
      post: { summary: 'Run backup now', security: [{ bearerAuth: [] }] },
    },
    '/api/integrations': {
      get: { summary: 'List integrations', security: [{ bearerAuth: [] }] },
    },
    '/api/integrations/{id}/configure': {
      post: { summary: 'Configure integration', security: [{ bearerAuth: [] }] },
    },
    '/api/integrations/{id}/graduate/{ideaId}': {
      post: { summary: 'Graduate idea', security: [{ bearerAuth: [] }] },
    },
    '/api/tokens': {
      get: {
        summary: 'List personal access tokens',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Public tokens',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/PublicToken' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: { summary: 'Create personal access token', security: [{ bearerAuth: [] }] },
    },
    '/api/tokens/{id}': {
      delete: { summary: 'Revoke personal access token', security: [{ bearerAuth: [] }] },
    },
    '/api/mcp/ideas': {
      get: { summary: 'MCP list ideas', security: [{ bearerAuth: [] }] },
    },
    '/api/mcp/ideas/{id}': {
      get: { summary: 'MCP get idea', security: [{ bearerAuth: [] }] },
    },
    '/api/mcp/search': {
      get: { summary: 'MCP search ideas', security: [{ bearerAuth: [] }] },
    },
    '/api/agents/link': {
      post: { summary: 'Link agent CLI', 'x-stub': true, security: [{ bearerAuth: [] }] },
    },
    '/api/agents/link/{provider}': {
      delete: { summary: 'Unlink agent CLI', 'x-stub': true, security: [{ bearerAuth: [] }] },
    },
    '/api/agents/runs': {
      post: { summary: 'Start agent run', 'x-stub': true, security: [{ bearerAuth: [] }] },
    },
    '/api/agents/runs/{id}': {
      get: { summary: 'Get agent run', 'x-stub': true, security: [{ bearerAuth: [] }] },
    },
    '/api/agents/runs/{id}/stream': {
      get: { summary: 'Stream agent run events', 'x-stub': true, security: [{ bearerAuth: [] }] },
    },
    '/api/agents/runs/{id}/stop': {
      post: { summary: 'Stop agent run', 'x-stub': true, security: [{ bearerAuth: [] }] },
    },
    '/api/agents/runs/{id}/apply': {
      post: { summary: 'Apply agent output files', 'x-stub': true, security: [{ bearerAuth: [] }] },
    },
  },
};

