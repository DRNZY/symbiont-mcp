import { createTwoFilesPatch } from 'diff';
import type { FileDiff } from '../types.js';

export function generateUnifiedDiff(
  oldPath: string,
  newPath: string,
  oldContent: string,
  newContent: string
): string {
  if (oldContent === newContent) {
    return '';
  }
  return createTwoFilesPatch(
    oldPath,
    newPath,
    oldContent,
    newContent,
    undefined,
    undefined,
    { context: 3 }
  );
}

export function formatCombinedDiff(fileDiffs: FileDiff[]): string {
  return fileDiffs
    .map((f) => f.diff.trim())
    .filter((d) => d.length > 0)
    .join('\n\n');
}
