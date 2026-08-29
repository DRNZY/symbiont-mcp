import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { ProjectManager } from '../src/engine/project-manager.js';
import { checkArchitectureRules } from '../src/engine/arch-rules.js';

describe('checkArchitectureRules', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  let manager: ProjectManager;

  beforeEach(() => {
    manager = new ProjectManager(fixturesDir);
  });

  it('should detect import boundary violations from .symbiontrc.yaml', () => {
    const result = checkArchitectureRules(undefined, fixturesDir, manager);

    expect(result.rulesEvaluated).toBeGreaterThanOrEqual(3);
    expect(result.violations.length).toBeGreaterThan(0);

    // Rule: no-db-in-ui should trigger on Button.tsx importing schema.ts
    const dbViolation = result.violations.find((v) => v.ruleId === 'no-db-in-ui');
    expect(dbViolation).toBeDefined();
    expect(dbViolation?.filePath).toBe('src/components/Button.tsx');
    expect(dbViolation?.severity).toBe('error');
    expect(dbViolation?.message).toContain('UI components must not import directly from the database layer');

    // Rule: enforce-zod-actions should trigger on user-actions.ts returning Promise<UserResponse>
    const zodViolation = result.violations.find((v) => v.ruleId === 'enforce-zod-actions');
    expect(zodViolation).toBeDefined();
    expect(zodViolation?.filePath).toBe('src/actions/user-actions.ts');
    expect(zodViolation?.severity).toBe('warning');

    // Rule: disallow-cycles should detect cycle between a.ts and b.ts
    const cycleViolation = result.violations.find((v) => v.ruleId === 'disallow-cycles');
    expect(cycleViolation).toBeDefined();
    expect(cycleViolation?.message).toContain('Circular dependencies are forbidden in the cycle domain');
  });
});
