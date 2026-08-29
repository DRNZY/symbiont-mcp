/**
 * Shared types for Symbiont MCP
 */

export type SymbolKind =
  | 'function'
  | 'arrow_function'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'enum'
  | 'variable'
  | 'method'
  | 'property'
  | 'getter'
  | 'setter'
  | 'constructor'
  | 'export_assignment';

export interface SymbolOutline {
  name: string;
  kind: SymbolKind;
  isExported: boolean;
  isDefaultExport: boolean;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  signature: string;
  docComment?: string;
  children?: SymbolOutline[];
}

export interface ImportOutline {
  moduleSpecifier: string;
  defaultImport?: string;
  namedImports?: string[];
  namespaceImport?: string;
  isTypeOnly: boolean;
  line: number;
}

export interface FileOutlineResult {
  filePath: string;
  totalLines: number;
  imports: ImportOutline[];
  exports: string[];
  symbols: SymbolOutline[];
}

export type UsageKind =
  | 'definition'
  | 'reference'
  | 'import'
  | 'call'
  | 'type_reference'
  | 'write';

export interface SymbolUsage {
  filePath: string;
  line: number;
  column: number;
  kind: UsageKind;
  isDefinition: boolean;
  isWriteAccess: boolean;
  lineSnippet: string;
  enclosingSymbol?: string;
}

export interface FindUsagesResult {
  symbolName: string;
  totalUsages: number;
  definitions: SymbolUsage[];
  references: SymbolUsage[];
  affectedFiles: string[];
}

export interface FileDiff {
  filePath: string;
  diff: string;
  replacementCount: number;
}

export interface RenameSymbolResult {
  oldName: string;
  newName: string;
  targetFile: string;
  affectedFiles: string[];
  totalReplacements: number;
  unifiedDiff: string;
  applied: boolean;
  fileDiffs: FileDiff[];
  error?: string;
}

export interface ArchRuleViolation {
  ruleId: string;
  filePath: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  offendingCode?: string;
  suggestion?: string;
}

export interface ArchCheckResult {
  totalViolations: number;
  errorsCount: number;
  warningsCount: number;
  passed: boolean;
  rulesEvaluated: number;
  filesScanned: number;
  violations: ArchRuleViolation[];
}

export interface DependencyGraphNode {
  filePath: string;
  dependencies: string[];
  dependents: string[];
}

export interface DependencyGraphResult {
  totalFiles: number;
  nodes: Record<string, DependencyGraphNode>;
  cycles: string[][];
}
