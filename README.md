# symbiont-mcp

AST-aware code navigation, refactoring engine, and architectural rule checker for the Model Context Protocol (MCP).

## Features

- AST file outlines (`get_file_outline`): inspect functions, classes, methods, interfaces, types, and variables with line ranges and type signatures.
- Symbol tracing (`find_all_usages`): resolve definitions, call sites, imports, and type references across codebases using TypeScript compiler bindings.
- AST renaming (`rename_symbol`): rename symbols across referencing files with unified diff generation and dry-run support.
- Architectural invariant checking (`check_architecture_rules`): validate import boundaries and return-type contracts against `.symbiontrc.yaml`.
- Dependency graph generation (`get_dependency_graph`): map module import trees and detect circular dependency cycles.

## Installation

```bash
git clone https://github.com/DRNZY/symbiont-mcp.git
cd symbiont-mcp
npm install
npm run build
```

## MCP configuration

Add to your MCP configuration file (`mcp_config.json` or client settings):

```json
{
  "mcpServers": {
    "symbiont": {
      "command": "node",
      "args": ["/path/to/symbiont-mcp/dist/index.js"]
    }
  }
}
```

## Tools reference

- `get_file_outline`: `filePath: string`, `workspaceRoot?: string`
- `find_all_usages`: `symbolName: string`, `entryFile?: string`, `workspaceRoot?: string`
- `rename_symbol`: `oldName: string`, `newName: string`, `targetFile: string`, `line?: number`, `dryRun?: boolean`, `workspaceRoot?: string`
- `check_architecture_rules`: `configPath?: string`, `workspaceRoot?: string`
- `get_dependency_graph`: `workspaceRoot?: string`
- `set_workspace_root`: `workspaceRoot: string`

## Configuration (.symbiontrc.yaml)

```yaml
rules:
  - id: no-db-in-ui
    from: "src/components/**"
    disallow_imports:
      - "src/server/db/**"
      - "drizzle-orm"
      - "@prisma/client"
    message: "UI components must not import directly from the database layer."
    severity: error

  - id: enforce-zod-actions
    files: "src/actions/**"
    require_named_export_type: "z.infer<*>"
    message: "Server actions must return a z.infer typed result."
    severity: warning

  - id: disallow-cycles
    files: "src/**"
    disallow_circular_dependencies: true
    message: "Circular dependency detected."
    severity: error
```

## CLI usage

```bash
# Check architecture rules
symbiont-mcp check [.symbiontrc.yaml]

# Inspect symbol outline
symbiont-mcp outline src/components/Button.tsx

# Trace usages
symbiont-mcp usages calculateTotal

# View dependency graph
symbiont-mcp graph
```

## Testing

```bash
npm test
```

## License

MIT
