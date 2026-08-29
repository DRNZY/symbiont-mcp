/**
 * Vector point interface
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Calculates Euclidean distance between two 2D points.
 */
export function calculateDistance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export const ZERO_POINT: Point2D = { x: 0, y: 0 };
