import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

describe('Symbiont MCP Server Protocol Integration', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  beforeAll(async () => {
    const server = createServer(fixturesDir);
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should list all available tools', async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames).toContain('get_file_outline');
    expect(toolNames).toContain('find_all_usages');
    expect(toolNames).toContain('rename_symbol');
    expect(toolNames).toContain('check_architecture_rules');
    expect(toolNames).toContain('get_dependency_graph');
    expect(toolNames).toContain('set_workspace_root');
  });

  it('should call get_file_outline tool via protocol', async () => {
    const result: any = await client.callTool({
      name: 'get_file_outline',
      arguments: {
        filePath: 'src/utils/math.ts',
      },
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filePath).toBe('src/utils/math.ts');
    expect(parsed.exports).toContain('calculateDistance');
  });

  it('should call check_architecture_rules tool via protocol', async () => {
    const result: any = await client.callTool({
      name: 'check_architecture_rules',
      arguments: {},
    });

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.violations.length).toBeGreaterThan(0);
    expect(parsed.violations.some((v: any) => v.ruleId === 'no-db-in-ui')).toBe(true);
  });
});
