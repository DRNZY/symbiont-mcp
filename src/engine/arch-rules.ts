import path from 'node:path';
import { Node, SourceFile } from 'ts-morph';
import type { ProjectManager } from './project-manager.js';
import { loadSymbiontConfig, type SymbiontRule } from '../config/schema.js';
import { matchesPattern, resolveModuleSpecifier } from '../utils/path.js';
import type { ArchCheckResult, ArchRuleViolation } from '../types.js';

export function checkArchitectureRules(
  configPath: string | undefined,
  rootDir: string | undefined,
  projectManager: ProjectManager
): ArchCheckResult {
  const effectiveRoot = rootDir ? path.resolve(rootDir) : projectManager.getRootDir();
  const { config } = loadSymbiontConfig(effectiveRoot, configPath);

  // Ensure files are indexed
  projectManager.ensureAllSourceFiles();
  const sourceFiles = projectManager.getAllSourceFiles();

  const violations: ArchRuleViolation[] = [];
  const rules = config.rules;

  let rulesEvaluated = 0;

  for (const rule of rules) {
    rulesEvaluated++;
    evaluateRule(rule, sourceFiles, effectiveRoot, projectManager, violations);
  }

  const errorsCount = violations.filter((v) => v.severity === 'error').length;
  const warningsCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    totalViolations: violations.length,
    errorsCount,
    warningsCount,
    passed: errorsCount === 0,
    rulesEvaluated,
    filesScanned: sourceFiles.length,
    violations,
  };
}

function evaluateRule(
  rule: SymbiontRule,
  sourceFiles: SourceFile[],
  rootDir: string,
  projectManager: ProjectManager,
  violations: ArchRuleViolation[]
): void {
  // 1. Import Boundary Rule: disallow_imports
  if ('disallow_imports' in rule && rule.disallow_imports && rule.from) {
    evaluateImportBoundaryRule(rule as any, sourceFiles, rootDir, projectManager, violations);
    return;
  }

  // 2. Export Type Rule: require_named_export_type / require_return_type_pattern
  if (
    ('require_named_export_type' in rule && rule.require_named_export_type) ||
    ('require_return_type_pattern' in rule && rule.require_return_type_pattern)
  ) {
    evaluateExportTypeRule(rule as any, sourceFiles, projectManager, violations);
    return;
  }

  // 3. Circular Dependencies: disallow_circular_dependencies
  if ('disallow_circular_dependencies' in rule && rule.disallow_circular_dependencies) {
    evaluateCircularDependencyRule(rule as any, projectManager, violations);
    return;
  }

  // 4. Max File Lines: max_lines
  if ('max_lines' in rule && rule.max_lines && rule.files) {
    evaluateMaxLinesRule(rule as any, sourceFiles, projectManager, violations);
    return;
  }
}

function evaluateImportBoundaryRule(
  rule: {
    id: string;
    from: string | string[];
    disallow_imports: string[];
    message?: string;
    severity?: 'error' | 'warning';
  },
  sourceFiles: SourceFile[],
  rootDir: string,
  projectManager: ProjectManager,
  violations: ArchRuleViolation[]
): void {
  const targetFiles = sourceFiles.filter((sf) => {
    const rel = projectManager.getRelativePath(sf.getFilePath());
    return matchesPattern(rel, rule.from);
  });

  for (const sf of targetFiles) {
    const relPath = projectManager.getRelativePath(sf.getFilePath());
    const importDecls = sf.getImportDeclarations();
    const exportDecls = sf.getExportDeclarations();

    const checkSpecifier = (
      specifier: string,
      line: number,
      col: number,
      rawStatement: string
    ) => {
      const resolved = resolveModuleSpecifier(specifier, sf.getFilePath(), rootDir);

      for (const disallowedPattern of rule.disallow_imports) {
        const isMatch =
          matchesPattern(specifier, disallowedPattern) ||
          matchesPattern(resolved, disallowedPattern) ||
          matchesPattern(resolved.replace(/\.[^/.]+$/, ''), disallowedPattern);

        if (isMatch) {
          violations.push({
            ruleId: rule.id,
            filePath: relPath,
            line,
            column: col,
            severity: rule.severity || 'error',
            message:
              rule.message ||
              `File '${relPath}' is disallowed from importing '${specifier}' matching pattern '${disallowedPattern}'.`,
            offendingCode: rawStatement.trim(),
            suggestion: `Remove or isolate import '${specifier}' into a separate layer.`,
          });
        }
      }
    };

    for (const imp of importDecls) {
      const spec = imp.getModuleSpecifierValue();
      const pos = sf.getLineAndColumnAtPos(imp.getStart());
      checkSpecifier(spec, pos.line, pos.column, imp.getText());
    }

    for (const exp of exportDecls) {
      const spec = exp.getModuleSpecifierValue();
      if (spec) {
        const pos = sf.getLineAndColumnAtPos(exp.getStart());
        checkSpecifier(spec, pos.line, pos.column, exp.getText());
      }
    }
  }
}

function evaluateExportTypeRule(
  rule: {
    id: string;
    files: string | string[];
    require_named_export_type?: string;
    require_return_type_pattern?: string;
    message?: string;
    severity?: 'error' | 'warning';
  },
  sourceFiles: SourceFile[],
  projectManager: ProjectManager,
  violations: ArchRuleViolation[]
): void {
  const targetFiles = sourceFiles.filter((sf) => {
    const rel = projectManager.getRelativePath(sf.getFilePath());
    return matchesPattern(rel, rule.files);
  });

  const expectedTypePattern = rule.require_named_export_type || rule.require_return_type_pattern || '';
  const regexPattern = new RegExp(
    expectedTypePattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  );

  for (const sf of targetFiles) {
    const relPath = projectManager.getRelativePath(sf.getFilePath());
    const exportedDeclarations = sf.getExportedDeclarations();

    for (const [exportName, decls] of exportedDeclarations) {
      for (const decl of decls) {
        let typeSignature = '';
        const pos = sf.getLineAndColumnAtPos(decl.getStart());

        if (Node.isFunctionDeclaration(decl)) {
          typeSignature = decl.getReturnTypeNode()?.getText() || decl.getReturnType().getText(decl);
        } else if (Node.isVariableDeclaration(decl)) {
          const init = decl.getInitializer();
          if (init && Node.isArrowFunction(init)) {
            typeSignature = init.getReturnTypeNode()?.getText() || init.getReturnType().getText(init);
          } else {
            typeSignature = decl.getTypeNode()?.getText() || decl.getType().getText(decl);
          }
        } else if (Node.isTypeAliasDeclaration(decl) || Node.isInterfaceDeclaration(decl)) {
          typeSignature = decl.getText();
        }

        const matches = regexPattern.test(typeSignature);
        if (!matches) {
          violations.push({
            ruleId: rule.id,
            filePath: relPath,
            line: pos.line,
            column: pos.column,
            severity: rule.severity || 'error',
            message:
              rule.message ||
              `Export '${exportName}' with type signature '${typeSignature}' does not match required type pattern '${expectedTypePattern}'.`,
            offendingCode: decl.getText().split('\n')[0],
            suggestion: `Ensure '${exportName}' explicitly types its return/export with ${expectedTypePattern}`,
          });
        }
      }
    }
  }
}

function evaluateCircularDependencyRule(
  rule: {
    id: string;
    files?: string | string[];
    message?: string;
    severity?: 'error' | 'warning';
  },
  projectManager: ProjectManager,
  violations: ArchRuleViolation[]
): void {
  const graph = projectManager.buildDependencyGraph();

  for (const cycle of graph.cycles) {
    const cycleChain = cycle.join(' -> ');
    const firstFile = cycle[0];
    const isRelevant = !rule.files || cycle.some((f) => matchesPattern(f, rule.files!));

    if (isRelevant) {
      violations.push({
        ruleId: rule.id || 'no-circular-deps',
        filePath: firstFile,
        line: 1,
        column: 1,
        severity: rule.severity || 'error',
        message: rule.message || `Circular dependency cycle detected: ${cycleChain}`,
        suggestion: `Break cycle by extracting shared types/interfaces or using dependency injection.`,
      });
    }
  }
}

function evaluateMaxLinesRule(
  rule: {
    id: string;
    files: string | string[];
    max_lines: number;
    message?: string;
    severity?: 'error' | 'warning';
  },
  sourceFiles: SourceFile[],
  projectManager: ProjectManager,
  violations: ArchRuleViolation[]
): void {
  const targetFiles = sourceFiles.filter((sf) => {
    const rel = projectManager.getRelativePath(sf.getFilePath());
    return matchesPattern(rel, rule.files);
  });

  for (const sf of targetFiles) {
    const lineCount = sf.getEndLineNumber();
    if (lineCount > rule.max_lines) {
      const relPath = projectManager.getRelativePath(sf.getFilePath());
      violations.push({
        ruleId: rule.id,
        filePath: relPath,
        line: lineCount,
        column: 1,
        severity: rule.severity || 'warning',
        message:
          rule.message ||
          `File '${relPath}' has ${lineCount} lines, exceeding the maximum allowed limit of ${rule.max_lines} lines.`,
        suggestion: `Refactor '${relPath}' into smaller cohesive modules.`,
      });
    }
  }
}
