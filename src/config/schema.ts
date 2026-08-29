import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

export const SymbiontRuleSchema = z.object({
  id: z.string(),
  from: z.string().or(z.array(z.string())).optional(),
  files: z.string().or(z.array(z.string())).optional(),
  disallow_imports: z.array(z.string()).optional(),
  require_named_export_type: z.string().optional(),
  require_return_type_pattern: z.string().optional(),
  disallow_circular_dependencies: z.boolean().optional(),
  max_lines: z.number().optional(),
  message: z.string().optional(),
  severity: z.enum(['error', 'warning']).default('error'),
}).passthrough();

export const SymbiontConfigSchema = z.object({
  rules: z.array(SymbiontRuleSchema).default([]),
  ignore: z.array(z.string()).default(['**/node_modules/**', '**/dist/**', '**/.git/**']),
});

export type SymbiontConfig = z.infer<typeof SymbiontConfigSchema>;
export type SymbiontRule = z.infer<typeof SymbiontRuleSchema>;

export function findConfigFile(rootDir: string, explicitPath?: string): string | null {
  if (explicitPath) {
    const absPath = path.isAbsolute(explicitPath) ? explicitPath : path.resolve(rootDir, explicitPath);
    if (fs.existsSync(absPath)) return absPath;
    throw new Error(`Explicit config file not found at: ${absPath}`);
  }

  const candidates = [
    '.symbiontrc.yaml',
    '.symbiontrc.yml',
    '.symbiontrc.json',
    '.symbiontrc',
    'symbiont.config.yaml',
    'symbiont.config.json',
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(rootDir, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

export function loadSymbiontConfig(rootDir: string, explicitPath?: string): { config: SymbiontConfig; configPath: string | null } {
  const resolvedPath = findConfigFile(rootDir, explicitPath);
  if (!resolvedPath) {
    return {
      config: { rules: [], ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'] },
      configPath: null,
    };
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  let rawParsed: unknown;

  if (resolvedPath.endsWith('.json')) {
    rawParsed = JSON.parse(content);
  } else {
    rawParsed = YAML.parse(content);
  }

  const parsed = SymbiontConfigSchema.parse(rawParsed);
  return { config: parsed, configPath: resolvedPath };
}
