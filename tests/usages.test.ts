import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { ProjectManager } from '../src/engine/project-manager.js';
import { findUsages } from '../src/engine/usages.js';

describe('findUsages', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  let manager: ProjectManager;

  beforeEach(() => {
    manager = new ProjectManager(fixturesDir);
  });

  it('should find all definitions and references across multiple files', () => {
    const usages = findUsages('calculateDistance', 'src/utils/math.ts', manager);

    expect(usages.symbolName).toBe('calculateDistance');
    expect(usages.totalUsages).toBeGreaterThanOrEqual(2);
    expect(usages.affectedFiles).toContain('src/utils/math.ts');
    expect(usages.affectedFiles).toContain('src/services/calculator.ts');

    // Should contain a definition in math.ts
    const def = usages.definitions.find((d) => d.filePath === 'src/utils/math.ts');
    expect(def).toBeDefined();
    expect(def?.isDefinition).toBe(true);

    // Should contain a call or reference in calculator.ts
    const ref = usages.references.find((r) => r.filePath === 'src/services/calculator.ts');
    expect(ref).toBeDefined();
  });

  it('should find type references for interfaces', () => {
    const usages = findUsages('Point2D', 'src/utils/math.ts', manager);

    expect(usages.symbolName).toBe('Point2D');
    expect(usages.affectedFiles).toContain('src/utils/math.ts');
    expect(usages.affectedFiles).toContain('src/services/calculator.ts');
    expect(usages.totalUsages).toBeGreaterThanOrEqual(3);
  });
});
