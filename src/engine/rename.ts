import { Node, SourceFile } from 'ts-morph';
import type { ProjectManager } from './project-manager.js';
import type { RenameSymbolResult, FileDiff } from '../types.js';
import { generateUnifiedDiff, formatCombinedDiff } from '../utils/diff.js';

export async function renameSymbol(
  oldName: string,
  newName: string,
  targetFile: string,
  options: { dryRun?: boolean; line?: number } = {},
  projectManager: ProjectManager
): Promise<RenameSymbolResult> {
  const dryRun = options.dryRun ?? false;
  const line = options.line;

  // Ensure all source files in project are loaded so references across files get updated
  projectManager.ensureAllSourceFiles();

  const sourceFile = projectManager.getSourceFile(targetFile);
  if (!sourceFile) {
    throw new Error(`Target file not found: ${targetFile}`);
  }

  // Find candidate node
  let targetNode: Node | undefined;

  sourceFile.forEachDescendant((node) => {
    if (targetNode) return;

    if (Node.isIdentifier(node) && node.getText() === oldName) {
      if (line !== undefined) {
        if (node.getStartLineNumber() === line) {
          targetNode = node;
        }
      } else {
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
            Node.isPropertyDeclaration(parent))
        ) {
          targetNode = node;
        }
      }
    }
  });

  // Fallback: first identifier matching oldName
  if (!targetNode) {
    sourceFile.forEachDescendant((node) => {
      if (!targetNode && Node.isIdentifier(node) && node.getText() === oldName) {
        targetNode = node;
      }
    });
  }

  if (!targetNode) {
    throw new Error(`Symbol '${oldName}' not found in ${targetFile}${line ? ` at line ${line}` : ''}`);
  }

  // Record initial file contents before rename
  const allFiles = projectManager.getAllSourceFiles();
  const initialContents = new Map<SourceFile, string>();
  for (const sf of allFiles) {
    initialContents.set(sf, sf.getFullText());
  }

  // Perform AST rename
  try {
    (targetNode as any).rename(newName);
  } catch (err: any) {
    throw new Error(`Failed to rename symbol '${oldName}' to '${newName}': ${err.message || String(err)}`);
  }

  // Compute diffs
  const fileDiffs: FileDiff[] = [];
  const affectedFiles: string[] = [];
  let totalReplacements = 0;

  for (const sf of allFiles) {
    const originalText = initialContents.get(sf) || '';
    const newText = sf.getFullText();

    if (originalText !== newText) {
      const relPath = projectManager.getRelativePath(sf.getFilePath());
      affectedFiles.push(relPath);

      const diff = generateUnifiedDiff(
        `a/${relPath}`,
        `b/${relPath}`,
        originalText,
        newText
      );

      // Rough count of replacements
      const count = (newText.match(new RegExp(`\\b${newName}\\b`, 'g')) || []).length;
      totalReplacements += count;

      fileDiffs.push({
        filePath: relPath,
        diff,
        replacementCount: count,
      });
    }
  }

  const unifiedDiff = formatCombinedDiff(fileDiffs);

  if (dryRun) {
    // Revert in-memory changes by refreshing from disk
    for (const sf of allFiles) {
      sf.refreshFromFileSystemSync();
    }
  } else {
    // Persist changes to disk
    await projectManager.getTsMorphProject().save();
  }

  return {
    oldName,
    newName,
    targetFile: projectManager.getRelativePath(sourceFile.getFilePath()),
    affectedFiles,
    totalReplacements,
    unifiedDiff,
    applied: !dryRun,
    fileDiffs,
  };
}
