import {
  Node,
  SourceFile,
  ReferencedSymbol,
} from 'ts-morph';
import type { ProjectManager } from './project-manager.js';
import type { FindUsagesResult, SymbolUsage, UsageKind } from '../types.js';

export function findUsages(
  symbolName: string,
  entryFile: string | undefined,
  projectManager: ProjectManager
): FindUsagesResult {
  // Ensure source files are loaded
  projectManager.ensureAllSourceFiles();

  const definitions: SymbolUsage[] = [];
  const references: SymbolUsage[] = [];
  const affectedFilesSet = new Set<string>();

  const targetSourceFiles: SourceFile[] = entryFile
    ? [projectManager.getSourceFile(entryFile)].filter((f): f is SourceFile => !!f)
    : projectManager.getAllSourceFiles();

  if (entryFile && targetSourceFiles.length === 0) {
    throw new Error(`Entry file not found: ${entryFile}`);
  }

  // Find candidate node
  const candidateNodes: Node[] = [];

  for (const sf of targetSourceFiles) {
    sf.forEachDescendant((node) => {
      if (Node.isIdentifier(node) && node.getText() === symbolName) {
        const parent = node.getParent();
        if (
          parent &&
          (Node.isFunctionDeclaration(parent) ||
            Node.isClassDeclaration(parent) ||
            Node.isInterfaceDeclaration(parent) ||
            Node.isTypeAliasDeclaration(parent) ||
            Node.isEnumDeclaration(parent) ||
            Node.isVariableDeclaration(parent) ||
            Node.isMethodDeclaration(parent) ||
            Node.isPropertyDeclaration(parent) ||
            Node.isImportSpecifier(parent) ||
            Node.isExportSpecifier(parent))
        ) {
          candidateNodes.push(node);
        } else if (candidateNodes.length === 0) {
          candidateNodes.push(node);
        }
      }
    });

    if (entryFile && candidateNodes.length > 0) {
      break;
    }
  }

  if (candidateNodes.length === 0) {
    for (const sf of projectManager.getAllSourceFiles()) {
      sf.forEachDescendant((node) => {
        if (Node.isIdentifier(node) && node.getText() === symbolName) {
          candidateNodes.push(node);
        }
      });
      if (candidateNodes.length > 0) break;
    }
  }

  const processedLocations = new Set<string>();

  for (const targetNode of candidateNodes) {
    let referencedSymbols: ReferencedSymbol[] = [];
    try {
      if (typeof (targetNode as any).findReferences === 'function') {
        referencedSymbols = (targetNode as any).findReferences();
      } else {
        const parent = targetNode.getParent();
        if (parent && typeof (parent as any).findReferences === 'function') {
          referencedSymbols = (parent as any).findReferences();
        }
      }
    } catch {
      continue;
    }

    for (const refSymbol of referencedSymbols) {
      const defNode = refSymbol.getDefinition().getNode();
      const defSf = defNode.getSourceFile();
      const defRel = projectManager.getRelativePath(defSf.getFilePath());
      const defPos = defSf.getLineAndColumnAtPos(defNode.getStart());
      const defLine = defPos.line;
      const defCol = defPos.column;
      const defLocKey = `${defRel}:${defLine}:${defCol}`;

      if (!processedLocations.has(defLocKey)) {
        processedLocations.add(defLocKey);
        affectedFilesSet.add(defRel);

        definitions.push({
          filePath: defRel,
          line: defLine,
          column: defCol,
          kind: 'definition',
          isDefinition: true,
          isWriteAccess: false,
          lineSnippet: getLineSnippet(defSf, defLine),
          enclosingSymbol: getEnclosingSymbolName(defNode),
        });
      }

      for (const entry of refSymbol.getReferences()) {
        const entryNode = entry.getNode();
        const entrySf = entry.getSourceFile();
        const entryRel = projectManager.getRelativePath(entrySf.getFilePath());
        const entryPos = entrySf.getLineAndColumnAtPos(entryNode.getStart());
        const entryLine = entryPos.line;
        const entryCol = entryPos.column;
        const entryLocKey = `${entryRel}:${entryLine}:${entryCol}`;

        if (processedLocations.has(entryLocKey)) {
          continue;
        }
        processedLocations.add(entryLocKey);
        affectedFilesSet.add(entryRel);

        const isDef = Boolean(entry.isDefinition());
        const kind = determineUsageKind(entryNode, isDef);
        const isWrite = Boolean(entry.isWriteAccess());

        const usage: SymbolUsage = {
          filePath: entryRel,
          line: entryLine,
          column: entryCol,
          kind,
          isDefinition: isDef,
          isWriteAccess: isWrite,
          lineSnippet: getLineSnippet(entrySf, entryLine),
          enclosingSymbol: getEnclosingSymbolName(entryNode),
        };

        if (isDef) {
          definitions.push(usage);
        } else {
          references.push(usage);
        }
      }
    }

    if (referencedSymbols.length > 0) {
      break;
    }
  }

  return {
    symbolName,
    totalUsages: definitions.length + references.length,
    definitions,
    references,
    affectedFiles: Array.from(affectedFilesSet),
  };
}

function determineUsageKind(node: Node, isDefinition: boolean): UsageKind {
  if (isDefinition) return 'definition';

  const parent = node.getParent();
  if (!parent) return 'reference';

  if (Node.isImportSpecifier(parent) || Node.isImportClause(parent)) {
    return 'import';
  }

  if (Node.isCallExpression(parent) && parent.getExpression() === node) {
    return 'call';
  }

  if (
    Node.isTypeReference(parent) ||
    Node.isTypeAliasDeclaration(parent) ||
    Node.isInterfaceDeclaration(parent)
  ) {
    return 'type_reference';
  }

  if (Node.isBinaryExpression(parent) && parent.getLeft() === node) {
    return 'write';
  }

  if (
    (Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) &&
    parent.getOperand() === node
  ) {
    return 'write';
  }

  return 'reference';
}

function getLineSnippet(sf: SourceFile, lineNumber: number): string {
  const fullText = sf.getFullText();
  const lines = fullText.split(/\r?\n/);
  if (lineNumber >= 1 && lineNumber <= lines.length) {
    return lines[lineNumber - 1].trim();
  }
  return '';
}

function getEnclosingSymbolName(node: Node): string | undefined {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isFunctionDeclaration(current)) return current.getName() || '<anonymous function>';
    if (Node.isClassDeclaration(current)) return current.getName() || '<anonymous class>';
    if (Node.isInterfaceDeclaration(current)) return current.getName();
    if (Node.isMethodDeclaration(current)) return current.getName();
    if (Node.isVariableDeclaration(current)) return current.getName();
    current = current.getParent();
  }
  return undefined;
}
