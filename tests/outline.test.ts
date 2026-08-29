import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { ProjectManager } from '../src/engine/project-manager.js';
import { getFileOutline } from '../src/engine/outline.js';

describe('getFileOutline', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  let manager: ProjectManager;

  beforeEach(() => {
    manager = new ProjectManager(fixturesDir);
  });

  it('should extract outline with functions, interfaces, constants and types', () => {
    const outline = getFileOutline('src/utils/math.ts', manager);

    expect(outline.filePath).toBe('src/utils/math.ts');
    expect(outline.totalLines).toBeGreaterThan(0);
    expect(outline.exports).toContain('calculateDistance');
    expect(outline.exports).toContain('Point2D');
    expect(outline.exports).toContain('ZERO_POINT');

    // Symbols check
    const pointSymbol = outline.symbols.find((s) => s.name === 'Point2D');
    expect(pointSymbol).toBeDefined();
    expect(pointSymbol?.kind).toBe('interface');
    expect(pointSymbol?.isExported).toBe(true);

    const distSymbol = outline.symbols.find((s) => s.name === 'calculateDistance');
    expect(distSymbol).toBeDefined();
    expect(distSymbol?.kind).toBe('function');
    expect(distSymbol?.signature).toContain('calculateDistance(p1: Point2D, p2: Point2D): number');
  });

  it('should extract class members, constructors, and imports', () => {
    const outline = getFileOutline('src/services/calculator.ts', manager);

    expect(outline.imports).toHaveLength(1);
    expect(outline.imports[0].namedImports).toEqual(['calculateDistance', 'Point2D', 'ZERO_POINT']);

    const geomClass = outline.symbols.find((s) => s.name === 'GeometryService');
    expect(geomClass).toBeDefined();
    expect(geomClass?.kind).toBe('class');
    expect(geomClass?.children).toBeDefined();

    const distMethod = geomClass?.children?.find((c) => c.name === 'getDistanceFromOrigin');
    expect(distMethod).toBeDefined();
    expect(distMethod?.kind).toBe('method');
  });
});
