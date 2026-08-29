import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { ProjectManager } from './engine/project-manager.js';
import { getFileOutline } from './engine/outline.js';
import { findUsages } from './engine/usages.js';
import { renameSymbol } from './engine/rename.js';
import { checkArchitectureRules } from './engine/arch-rules.js';

export function createServer(initialRootDir: string = process.cwd()): Server {
  let defaultProjectManager = new ProjectManager(initialRootDir);

  function getManager(workspaceRoot?: string): ProjectManager {
    if (workspaceRoot) {
      if (defaultProjectManager.getRootDir() !== workspaceRoot) {
        defaultProjectManager = new ProjectManager(workspaceRoot);
      }
    }
    return defaultProjectManager;
  }

  const server = new Server(
    {
      name: 'symbiont-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register Tool List
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_file_outline',
          description:
            'Returns high-level symbol declarations (functions, classes, interfaces, types, enums, variables) with line ranges and signatures without dumping raw file bodies.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Relative or absolute path to the TypeScript/JavaScript file.',
              },
              workspaceRoot: {
                type: 'string',
                description: 'Optional workspace root directory.',
              },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'find_all_usages',
          description:
            'Performs deterministic AST traversal to return every exact reference, import, definition, and call-site across the codebase.',
          inputSchema: {
            type: 'object',
            properties: {
              symbolName: {
                type: 'string',
                description: 'Exact name of the symbol to find.',
              },
              entryFile: {
                type: 'string',
                description: 'Optional entry file where the symbol is declared.',
              },
              workspaceRoot: {
                type: 'string',
                description: 'Optional workspace root directory.',
              },
            },
            required: ['symbolName'],
          },
        },
        {
          name: 'rename_symbol',
          description:
            'Applies syntactically safe, AST-level renames across all consumers and returns unified diffs.',
          inputSchema: {
            type: 'object',
            properties: {
              oldName: {
                type: 'string',
                description: 'Current name of the symbol to rename.',
              },
              newName: {
                type: 'string',
                description: 'New name for the symbol.',
              },
              targetFile: {
                type: 'string',
                description: 'File path containing the symbol declaration or reference.',
              },
              line: {
                type: 'number',
                description: 'Optional line number to disambiguate if multiple symbols share the name.',
              },
              dryRun: {
                type: 'boolean',
                description: 'If true, returns the unified diff preview without modifying files on disk.',
                default: false,
              },
              workspaceRoot: {
                type: 'string',
                description: 'Optional workspace root directory.',
              },
            },
            required: ['oldName', 'newName', 'targetFile'],
          },
        },
        {
          name: 'check_architecture_rules',
          description:
            'Evaluates the dependency graph against declarative architectural rules (.symbiontrc.yaml) and returns actionable boundary violations.',
          inputSchema: {
            type: 'object',
            properties: {
              configPath: {
                type: 'string',
                description: 'Optional path to .symbiontrc.yaml or .symbiontrc.json configuration file.',
              },
              workspaceRoot: {
                type: 'string',
                description: 'Optional workspace root directory to scan.',
              },
            },
          },
        },
        {
          name: 'get_dependency_graph',
          description:
            'Builds a module dependency graph, tracking direct imports, dependents, and circular dependency cycles.',
          inputSchema: {
            type: 'object',
            properties: {
              workspaceRoot: {
                type: 'string',
                description: 'Optional workspace root directory.',
              },
            },
          },
        },
        {
          name: 'set_workspace_root',
          description:
            'Sets or re-indexes the active project workspace root directory.',
          inputSchema: {
            type: 'object',
            properties: {
              workspaceRoot: {
                type: 'string',
                description: 'Absolute path to workspace root.',
              },
            },
            required: ['workspaceRoot'],
          },
        },
      ],
    };
  });

  // Handle Tool Calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'get_file_outline': {
          const filePath = String(args.filePath);
          const workspaceRoot = args.workspaceRoot ? String(args.workspaceRoot) : undefined;
          const manager = getManager(workspaceRoot);

          const outline = getFileOutline(filePath, manager);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(outline, null, 2),
              },
            ],
          };
        }

        case 'find_all_usages': {
          const symbolName = String(args.symbolName);
          const entryFile = args.entryFile ? String(args.entryFile) : undefined;
          const workspaceRoot = args.workspaceRoot ? String(args.workspaceRoot) : undefined;
          const manager = getManager(workspaceRoot);

          const result = findUsages(symbolName, entryFile, manager);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'rename_symbol': {
          const oldName = String(args.oldName);
          const newName = String(args.newName);
          const targetFile = String(args.targetFile);
          const line = typeof args.line === 'number' ? args.line : undefined;
          const dryRun = Boolean(args.dryRun);
          const workspaceRoot = args.workspaceRoot ? String(args.workspaceRoot) : undefined;
          const manager = getManager(workspaceRoot);

          const result = await renameSymbol(
            oldName,
            newName,
            targetFile,
            { dryRun, line },
            manager
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'check_architecture_rules': {
          const configPath = args.configPath ? String(args.configPath) : undefined;
          const workspaceRoot = args.workspaceRoot ? String(args.workspaceRoot) : undefined;
          const manager = getManager(workspaceRoot);

          const result = checkArchitectureRules(configPath, workspaceRoot, manager);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'get_dependency_graph': {
          const workspaceRoot = args.workspaceRoot ? String(args.workspaceRoot) : undefined;
          const manager = getManager(workspaceRoot);

          const graph = manager.buildDependencyGraph();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(graph, null, 2),
              },
            ],
          };
        }

        case 'set_workspace_root': {
          const workspaceRoot = String(args.workspaceRoot);
          defaultProjectManager = new ProjectManager(workspaceRoot);
          return {
            content: [
              {
                type: 'text',
                text: `Workspace root set to: ${defaultProjectManager.getRootDir()}`,
              },
            ],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${error?.message || String(error)}`,
          },
        ],
      };
    }
  });

  return server;
}
