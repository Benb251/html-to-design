export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculates parent-local coordinates for a child node given its absolute
 * document-origin coordinates and its parent's absolute document-origin coordinates.
 *
 * localX = child.absoluteX - parent.absoluteX
 * localY = child.absoluteY - parent.absoluteY
 */
export function calculateLocalCoordinates(child: Point, parent: Point): Point {
  return {
    x: child.x - parent.x,
    y: child.y - parent.y,
  };
}

/**
 * Calculates root frame canvas placement centered around the current Figma viewport center,
 * rounded to integers for crisp canvas pixels.
 */
export function calculateRootPlacement(
  rootDimensions: { width: number; height: number },
  viewportCenter?: Point | undefined,
): Point {
  const center = viewportCenter ?? { x: 0, y: 0 };
  return {
    x: Math.round(center.x - rootDimensions.width / 2),
    y: Math.round(center.y - rootDimensions.height / 2),
  };
}
