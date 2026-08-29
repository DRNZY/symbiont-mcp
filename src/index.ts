#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { ProjectManager } from './engine/project-manager.js';
import { getFileOutline } from './engine/outline.js';
import { findUsages } from './engine/usages.js';
import { checkArchitectureRules } from './engine/arch-rules.js';

async function main() {
  const cliArgs = process.argv.slice(2);

  if (cliArgs.length > 0 && cliArgs[0] !== '--stdio') {
    const cmd = cliArgs[0];
    const manager = new ProjectManager(process.cwd());

    if (cmd === 'outline' && cliArgs[1]) {
      const outline = getFileOutline(cliArgs[1], manager);
      console.log(JSON.stringify(outline, null, 2));
      process.exit(0);
    } else if (cmd === 'check') {
      const configPath = cliArgs[1];
      const result = checkArchitectureRules(configPath, undefined, manager);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
    } else if (cmd === 'usages' && cliArgs[1]) {
      const usages = findUsages(cliArgs[1], cliArgs[2], manager);
      console.log(JSON.stringify(usages, null, 2));
      process.exit(0);
    } else if (cmd === 'graph') {
      const graph = manager.buildDependencyGraph();
      console.log(JSON.stringify(graph, null, 2));
      process.exit(0);
    } else {
      console.log(`Symbiont MCP CLI commands:
  symbiont-mcp outline <file>
  symbiont-mcp usages <symbol> [entryFile]
  symbiont-mcp check [configPath]
  symbiont-mcp graph
  (Run with no args for MCP stdio mode)`);
      process.exit(0);
    }
  }

  const server = createServer(process.cwd());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error starting symbiont-mcp:', err);
  process.exit(1);
});
