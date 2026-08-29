# symbiont-mcp

High-performance AST-aware code navigation, refactoring engine, and declarative architectural rule checker for the Model Context Protocol (MCP).

## Features

- **AST File Outlines (`get_file_outline`)**: Inspects functions, classes, methods, interfaces, types, enums, and variables with line ranges and type signatures without reading full file contents into context.
- **Deterministic Symbol Tracing (`find_all_usages`)**: Resolves definitions, call sites, imports, and type references across the codebase using TypeScript compiler bindings.
- **AST Renaming (`rename_symbol`)**: Safely renames symbols across all referencing files and generates unified diff patches with dry-run support.
- **Architecture Invariant Checking (`check_architecture_rules`)**: Validates import boundaries and return-type contracts against `.symbiontrc.yaml`.
- **Dependency Graph & Cycle Detection (`get_dependency_graph`)**: Maps module import relationships and detects circular dependency chains.

## Installation

```bash
git clone https://github.com/darnell/symbiont-mcp.git # or your target repo
cd symbiont-mcp
npm install
npm run build
```

## MCP Configuration

Add to your MCP configuration (`mcp_config.json` or client settings):

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

## Tools Reference

- `get_file_outline`: `filePath: string`, `workspaceRoot?: string`
- `find_all_usages`: `symbolName: string`, `entryFile?: string`, `workspaceRoot?: string`
- `rename_symbol`: `oldName: string`, `newName: string`, `targetFile: string`, `line?: number`, `dryRun?: boolean`, `workspaceRoot?: string`
- `check_architecture_rules`: `configPath?: string`, `workspaceRoot?: string`
- `get_dependency_graph`: `workspaceRoot?: string`
- `set_workspace_root`: `workspaceRoot: string`

## Configuration (`.symbiontrc.yaml`)

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

## CLI Usage

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
