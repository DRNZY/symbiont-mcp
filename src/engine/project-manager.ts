import fs from 'node:fs';
import path from 'node:path';
import { Project, ScriptTarget, ModuleResolutionKind, ModuleKind, ts, SourceFile } from 'ts-morph';
import { normalizePath, toAbsolutePath, toRelativePath, matchesPattern } from '../utils/path.js';
import type { DependencyGraphResult, DependencyGraphNode } from '../types.js';

export class ProjectManager {
  private project: Project;
  private rootDir: string;
  private tsConfigPath: string | null = null;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
    this.project = this.createProject(this.rootDir);
  }

  public getRootDir(): string {
    return this.rootDir;
  }

  public setRootDir(newRootDir: string): void {
    this.rootDir = path.resolve(newRootDir);
    this.project = this.createProject(this.rootDir);
  }

  private createProject(rootDir: string): Project {
    const candidateTsConfigs = [
      path.join(rootDir, 'tsconfig.json'),
      path.join(rootDir, 'jsconfig.json'),
    ];

    let foundTsConfig: string | null = null;
    for (const c of candidateTsConfigs) {
      if (fs.existsSync(c)) {
        foundTsConfig = c;
        break;
      }
    }

    this.tsConfigPath = foundTsConfig;

    if (foundTsConfig) {
      try {
        return new Project({
          tsConfigFilePath: foundTsConfig,
          skipAddingFilesFromTsConfig: false,
          compilerOptions: {
            allowJs: true,
            jsx: ts.JsxEmit.ReactJSX,
          },
        });
      } catch (err) {
        console.error(`Warning: Failed to load ${foundTsConfig}, using standalone project:`, err);
      }
    }

    return new Project({
      compilerOptions: {
        target: ScriptTarget.ES2022,
        module: ModuleKind.NodeNext,
        moduleResolution: ModuleResolutionKind.NodeNext,
        allowJs: true,
        jsx: ts.JsxEmit.ReactJSX,
        declaration: false,
        noEmit: true,
        skipLibCheck: true,
      },
    });
  }

  public getTsMorphProject(): Project {
    return this.project;
  }

  public getRelativePath(absOrRelPath: string): string {
    return toRelativePath(absOrRelPath, this.rootDir);
  }

  public getAbsolutePath(absOrRelPath: string): string {
    return toAbsolutePath(absOrRelPath, this.rootDir);
  }

  public getSourceFile(filePath: string): SourceFile | undefined {
    const absPath = this.getAbsolutePath(filePath);
    let sf = this.project.getSourceFile(absPath);

    if (!sf && fs.existsSync(absPath)) {
      try {
        sf = this.project.addSourceFileAtPath(absPath);
      } catch {
        sf = this.project.getSourceFile((f) => normalizePath(f.getFilePath()) === normalizePath(absPath));
      }
    }

    return sf;
  }

  public ensureAllSourceFiles(globPatterns: string[] = ['**/*.{ts,tsx,js,jsx}']): SourceFile[] {
    const defaultIgnore = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/.next/**'];

    this.project.addSourceFilesAtPaths([
      ...globPatterns.map((g) => path.join(this.rootDir, g)),
      ...defaultIgnore.map((i) => `!${path.join(this.rootDir, i)}`),
    ]);

    return this.project.getSourceFiles().filter((sf) => {
      const rel = this.getRelativePath(sf.getFilePath());
      return !matchesPattern(rel, defaultIgnore);
    });
  }

  public refreshFile(filePath: string): SourceFile | undefined {
    const absPath = this.getAbsolutePath(filePath);
    const existing = this.project.getSourceFile(absPath);
    if (existing) {
      existing.refreshFromFileSystemSync();
      return existing;
    }
    return this.getSourceFile(filePath);
  }

  public getAllSourceFiles(): SourceFile[] {
    return this.ensureAllSourceFiles();
  }

  public buildDependencyGraph(): DependencyGraphResult {
    const sourceFiles = this.getAllSourceFiles();
    const nodes: Record<string, DependencyGraphNode> = {};

    for (const sf of sourceFiles) {
      const relPath = this.getRelativePath(sf.getFilePath());
      nodes[relPath] = {
        filePath: relPath,
        dependencies: [],
        dependents: [],
      };
    }

    for (const sf of sourceFiles) {
      const fromRel = this.getRelativePath(sf.getFilePath());
      const importDeclarations = sf.getImportDeclarations();
      const exportDeclarations = sf.getExportDeclarations();

      const specifiers = [
        ...importDeclarations.map((i) => i.getModuleSpecifierValue()),
        ...exportDeclarations.map((e) => e.getModuleSpecifierValue()).filter((s): s is string => !!s),
      ];

      for (const spec of specifiers) {
        if (spec.startsWith('.')) {
          const sfDir = path.dirname(sf.getFilePath());
          const candidateBase = path.resolve(sfDir, spec);
          const candidateWithoutExt = candidateBase.replace(/\.(js|jsx|mjs|cjs|ts|tsx)$/, '');

          let targetRel: string | null = null;
          const candidatesToTest = [
            candidateBase,
            `${candidateWithoutExt}.ts`,
            `${candidateWithoutExt}.tsx`,
            `${candidateWithoutExt}.js`,
            `${candidateWithoutExt}.jsx`,
            path.join(candidateBase, 'index.ts'),
            path.join(candidateBase, 'index.tsx'),
            path.join(candidateBase, 'index.js'),
            path.join(candidateWithoutExt, 'index.ts'),
            path.join(candidateWithoutExt, 'index.tsx'),
            path.join(candidateWithoutExt, 'index.js'),
          ];

          for (const testPath of candidatesToTest) {
            const rel = this.getRelativePath(testPath);
            if (nodes[rel]) {
              targetRel = rel;
              break;
            }
          }

          if (targetRel && targetRel !== fromRel) {
            if (!nodes[fromRel].dependencies.includes(targetRel)) {
              nodes[fromRel].dependencies.push(targetRel);
            }
            if (!nodes[targetRel].dependents.includes(fromRel)) {
              nodes[targetRel].dependents.push(fromRel);
            }
          }
        }
      }
    }

    const cycles = this.findDependencyCycles(nodes);

    return {
      totalFiles: Object.keys(nodes).length,
      nodes,
      cycles,
    };
  }

  private findDependencyCycles(nodes: Record<string, DependencyGraphNode>): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (current: string, currentPath: string[]) => {
      visited.add(current);
      recursionStack.add(current);
      currentPath.push(current);

      const deps = nodes[current]?.dependencies || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...currentPath]);
        } else if (recursionStack.has(dep)) {
          const cycleStartIndex = currentPath.indexOf(dep);
          if (cycleStartIndex !== -1) {
            cycles.push([...currentPath.slice(cycleStartIndex), dep]);
          }
        }
      }

      recursionStack.delete(current);
    };

    for (const nodeKey of Object.keys(nodes)) {
      if (!visited.has(nodeKey)) {
        dfs(nodeKey, []);
      }
    }

    return cycles;
  }
}
