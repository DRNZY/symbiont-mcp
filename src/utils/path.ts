import path from 'node:path';
import micromatch from 'micromatch';

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function toRelativePath(filePath: string, rootDir: string): string {
  const rel = path.relative(rootDir, filePath);
  return normalizePath(rel);
}

export function toAbsolutePath(filePath: string, rootDir: string): string {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }
  return path.normalize(path.resolve(rootDir, filePath));
}

export function matchesPattern(filePath: string, patterns: string | string[]): boolean {
  const normPath = normalizePath(filePath);
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  
  return micromatch.isMatch(normPath, patternList, {
    dot: true,
    matchBase: false,
  });
}

/**
 * Resolves a module specifier to potential relative workspace paths or library names.
 */
export function resolveModuleSpecifier(
  moduleSpecifier: string,
  importerFilePath: string,
  rootDir: string
): string {
  if (moduleSpecifier.startsWith('.')) {
    const dir = path.dirname(importerFilePath);
    const resolvedAbs = path.resolve(dir, moduleSpecifier);
    return toRelativePath(resolvedAbs, rootDir);
  }
  
  if (moduleSpecifier.startsWith('@/')) {
    const stripped = moduleSpecifier.slice(2);
    // Usually @/ maps to src/ or root
    return stripped;
  }

  return moduleSpecifier;
}
