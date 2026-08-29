import { calculateDistance, Point2D, ZERO_POINT } from '../utils/math.js';

export class GeometryService {
  private origin: Point2D = ZERO_POINT;

  public getDistanceFromOrigin(target: Point2D): number {
    return calculateDistance(this.origin, target);
  }
}
