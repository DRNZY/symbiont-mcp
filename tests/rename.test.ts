import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { ProjectManager } from '../src/engine/project-manager.js';
import { renameSymbol } from '../src/engine/rename.js';

describe('renameSymbol', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  let manager: ProjectManager;

  beforeEach(() => {
    manager = new ProjectManager(fixturesDir);
  });

  it('should preview rename across files with dryRun=true', async () => {
    const result = await renameSymbol(
      'calculateDistance',
      'computeEuclideanDistance',
      'src/utils/math.ts',
      { dryRun: true },
      manager
    );

    expect(result.oldName).toBe('calculateDistance');
    expect(result.newName).toBe('computeEuclideanDistance');
    expect(result.applied).toBe(false);
    expect(result.affectedFiles).toContain('src/utils/math.ts');
    expect(result.affectedFiles).toContain('src/services/calculator.ts');
    expect(result.unifiedDiff).toContain('-export function calculateDistance');
    expect(result.unifiedDiff).toContain('+export function computeEuclideanDistance');
    expect(result.unifiedDiff).toContain('computeEuclideanDistance(this.origin, target)');

    // Ensure disk file wasn't altered
    const freshOutline = manager.getSourceFile('src/utils/math.ts');
    expect(freshOutline?.getFullText()).toContain('calculateDistance');
  });
});
