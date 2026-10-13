import type {
  BorderSide,
  Color,
  DesignNode,
  ImageNode,
  SvgNode,
  TextNode,
  VersionedDesignDocument,
} from "@web2design/design-schema";
import type { RendererWarning } from "../types.js";
import type {
  ExpectedWarningRule,
  FidelityFailure,
  FixtureManifestEntry,
  NormalizedRenderedNode,
} from "./types.js";

export const DEFAULT_GEOMETRY_EPSILON = 0.1;
export const DEFAULT_COLOR_EPSILON = 0.01;
export const DEFAULT_OPACITY_EPSILON = 0.01;

function numDiff(actual: number, expected: number, tol: number): number | null {
  const diff = Math.abs(actual - expected);
  return diff > tol ? actual - expected : null;
}

function colorDiff(
  actual: { r: number; g: number; b: number; a?: number },
  expected: Color,
  tol: number,
): string | null {
  const diffR = Math.abs(actual.r - expected.r);
  const diffG = Math.abs(actual.g - expected.g);
  const diffB = Math.abs(actual.b - expected.b);
  const expA = expected.a ?? 1;
  const actA = actual.a ?? 1;
  const diffA = Math.abs(actA - expA);

  if (diffR > tol || diffG > tol || diffB > tol || diffA > tol) {
    return `rgba(${actual.r.toFixed(3)}, ${actual.g.toFixed(3)}, ${actual.b.toFixed(3)}, ${actA.toFixed(3)}) vs rgba(${expected.r.toFixed(3)}, ${expected.g.toFixed(3)}, ${expected.b.toFixed(3)}, ${expA.toFixed(3)})`;
  }
  return null;
}

export function compareGeometry(
  schemaNode: DesignNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
  tol: number = DEFAULT_GEOMETRY_EPSILON,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  const check = (property: string, actual: number, expected: number) => {
    const diff = numDiff(actual, expected, tol);
    if (diff !== null) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "GEOMETRY",
        property,
        expected,
        actual,
        difference: diff,
        tolerance: tol,
        message: `node: ${schemaNode.id} property: ${property} expected: ${expected} actual: ${actual} diff: ${diff.toFixed(3)} tol: ${tol}`,
      });
    }
  };

  check("width", rendered.width, schemaNode.width);
  check("height", rendered.height, schemaNode.height);
  check("absoluteX", rendered.absoluteX, schemaNode.x);
  check("absoluteY", rendered.absoluteY, schemaNode.y);

  return failures;
}

export function compareHierarchy(
  schemaNode: DesignNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  if (rendered.sourceId !== schemaNode.id) {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "HIERARCHY",
      property: "sourceId",
      expected: schemaNode.id,
      actual: rendered.sourceId,
      message: `Rendered node sourceId '${rendered.sourceId}' does not match schema node '${schemaNode.id}'`,
    });
  }

  if (schemaNode.type === "frame" && rendered.figmaType === "FRAME") {
    const schemaChildren = schemaNode.children;
    const renderedChildren = rendered.children ?? [];

    if (renderedChildren.length !== schemaChildren.length) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "HIERARCHY",
        property: "children.length",
        expected: schemaChildren.length,
        actual: renderedChildren.length,
        message: `Frame '${schemaNode.id}' has ${renderedChildren.length} rendered children, expected ${schemaChildren.length}`,
      });
    } else {
      for (let i = 0; i < schemaChildren.length; i++) {
        const sc = schemaChildren[i]!;
        const rc = renderedChildren[i]!;
        if (rc.sourceId !== sc.id) {
          failures.push({
            fixtureId,
            sourceId: schemaNode.id,
            nodeType: schemaNode.type,
            category: "HIERARCHY",
            property: `children[${i}].sourceId`,
            expected: sc.id,
            actual: rc.sourceId,
            message: `Child index ${i} order mismatch: expected '${sc.id}', got '${rc.sourceId}'`,
          });
        }
      }
    }
  }

  return failures;
}

export function compareFill(
  schemaNode: DesignNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
  colorTol: number = DEFAULT_COLOR_EPSILON,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  if (schemaNode.type === "text" || schemaNode.type === "svg") {
    return failures;
  }

  const schemaFills = schemaNode.style?.fills ?? [];
  const solidSchemaFills = schemaFills.filter((f) => f.type === "solid");

  if (solidSchemaFills.length > 0) {
    const expected = solidSchemaFills[0]!;
    const renderedSolidFills = (rendered.fills ?? []).filter((f) => f.type === "SOLID");

    if (renderedSolidFills.length === 0) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "FILL",
        property: "fills",
        expected: "SOLID fill",
        actual: "None",
        message: `Node '${schemaNode.id}' missing solid fill in rendered output`,
      });
    } else {
      const actualColor = renderedSolidFills[0]!.color;
      if (actualColor) {
        const diff = colorDiff(actualColor, expected.color, colorTol);
        if (diff) {
          failures.push({
            fixtureId,
            sourceId: schemaNode.id,
            nodeType: schemaNode.type,
            category: "FILL",
            property: "fill.color",
            expected: expected.color,
            actual: actualColor,
            difference: diff,
            tolerance: colorTol,
            message: `Node '${schemaNode.id}' fill color mismatch: ${diff}`,
          });
        }
      }
    }
  } else if (schemaNode.type !== "image") {
    // If schema has no fills and is not an image, rendered node should not have accidental fills
    const renderedFills = (rendered.fills ?? []).filter(
      (f) => f.type === "SOLID" || f.type === "GRADIENT_LINEAR" || f.type === "GRADIENT_RADIAL",
    );
    if (renderedFills.length > 0 && schemaFills.length === 0) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "FILL",
        property: "fills",
        expected: "empty",
        actual: renderedFills.length,
        message: `Node '${schemaNode.id}' has accidental fill when schema had none`,
      });
    }
  }

  const linearSchemaFills = schemaFills.filter((f) => f.type === "linear-gradient");
  if (linearSchemaFills.length > 0) {
    const expected = linearSchemaFills[0]!;
    const renderedGradients = (rendered.fills ?? []).filter((f) => f.type === "GRADIENT_LINEAR");

    if (renderedGradients.length === 0) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "FILL",
        property: "fills",
        expected: "GRADIENT_LINEAR fill",
        actual: "None",
        message: `Node '${schemaNode.id}' missing linear gradient fill in rendered output`,
      });
    } else {
      const actual = renderedGradients[0]!;
      if (!actual.gradientTransform) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "FILL",
          property: "gradientTransform",
          expected: "Transform matrix",
          actual: "None",
          message: `Node '${schemaNode.id}' missing gradientTransform matrix`,
        });
      }
      if ((actual.gradientStops?.length ?? 0) !== expected.stops.length) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "FILL",
          property: "gradientStops.length",
          expected: expected.stops.length,
          actual: actual.gradientStops?.length ?? 0,
          message: `Node '${schemaNode.id}' gradient stop count mismatch`,
        });
      } else if (actual.gradientStops) {
        for (let i = 0; i < expected.stops.length; i++) {
          const expStop = expected.stops[i]!;
          const actStop = actual.gradientStops[i]!;
          if (Math.abs(expStop.position - actStop.position) > 0.05) {
            failures.push({
              fixtureId,
              sourceId: schemaNode.id,
              nodeType: schemaNode.type,
              category: "FILL",
              property: `gradientStops[${i}].position`,
              expected: expStop.position,
              actual: actStop.position,
              difference: Math.abs(expStop.position - actStop.position),
              tolerance: 0.05,
              message: `Node '${schemaNode.id}' gradient stop ${i} position mismatch`,
            });
          }
          const diff = colorDiff(actStop.color, expStop.color, colorTol);
          if (diff) {
            failures.push({
              fixtureId,
              sourceId: schemaNode.id,
              nodeType: schemaNode.type,
              category: "FILL",
              property: `gradientStops[${i}].color`,
              expected: expStop.color,
              actual: actStop.color,
              difference: diff,
              tolerance: colorTol,
              message: `Node '${schemaNode.id}' gradient stop ${i} color mismatch: ${diff}`,
            });
          }
        }
      }
    }
  }

  const radialSchemaFills = schemaFills.filter((f) => f.type === "radial-gradient");
  if (radialSchemaFills.length > 0) {
    const expected = radialSchemaFills[0]!;
    const renderedGradients = (rendered.fills ?? []).filter((f) => f.type === "GRADIENT_RADIAL");

    if (renderedGradients.length === 0) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "FILL",
        property: "fills",
        expected: "GRADIENT_RADIAL fill",
        actual: "None",
        message: `Node '${schemaNode.id}' missing radial gradient fill in rendered output`,
      });
    } else {
      const actual = renderedGradients[0]!;
      if (!actual.gradientTransform) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "FILL",
          property: "gradientTransform",
          expected: "Transform matrix",
          actual: "None",
          message: `Node '${schemaNode.id}' missing radial gradientTransform matrix`,
        });
      }
      if ((actual.gradientStops?.length ?? 0) !== expected.stops.length) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "FILL",
          property: "gradientStops.length",
          expected: expected.stops.length,
          actual: actual.gradientStops?.length ?? 0,
          message: `Node '${schemaNode.id}' radial gradient stop count mismatch`,
        });
      }
    }
  }

  return failures;
}

export function compareStroke(
  schemaNode: DesignNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
  tol: number = DEFAULT_GEOMETRY_EPSILON,
  colorTol: number = DEFAULT_COLOR_EPSILON,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  const rawBorder = schemaNode.style?.border as unknown as Record<string, unknown> | undefined;
  if (!rawBorder) return failures;

  const b = "top" in rawBorder
    ? (schemaNode.style?.border as unknown as { top: BorderSide; right: BorderSide; bottom: BorderSide; left: BorderSide })
    : {
        top: rawBorder as unknown as BorderSide,
        right: rawBorder as unknown as BorderSide,
        bottom: rawBorder as unknown as BorderSide,
        left: rawBorder as unknown as BorderSide,
      };

  const sides = [b.top, b.right, b.bottom, b.left];
  const visibleSides = sides.filter(
    (s) => s && typeof s.width === "number" && s.width > 0 && s.style !== "none" && s.style !== "hidden",
  );

  if (visibleSides.length > 0) {
    const renderedStrokes = rendered.strokes ?? [];
    if (renderedStrokes.length === 0) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "BORDER",
        property: "strokes",
        expected: "stroke present",
        actual: "none",
        message: `Node '${schemaNode.id}' expected stroke width ${visibleSides[0]!.width}, got none`,
      });
    } else {
      const stroke = renderedStrokes[0]!;
      const primary = visibleSides[0]!;
      const isUniform =
        b.top.width === b.right.width &&
        b.right.width === b.bottom.width &&
        b.bottom.width === b.left.width;

      if (isUniform) {
        const diffW = numDiff(stroke.width, b.top.width, tol);
        if (diffW !== null) {
          failures.push({
            fixtureId,
            sourceId: schemaNode.id,
            nodeType: schemaNode.type,
            category: "BORDER",
            property: "strokeWeight",
            expected: b.top.width,
            actual: stroke.width,
            difference: diffW,
            tolerance: tol,
            message: `Node '${schemaNode.id}' stroke weight expected ${b.top.width}, got ${stroke.width}`,
          });
        }
      } else {
        const checkSide = (sideName: "top" | "right" | "bottom" | "left", prop: "topWidth" | "rightWidth" | "bottomWidth" | "leftWidth") => {
          const exp = b[sideName].width;
          const act = stroke[prop] ?? stroke.width;
          const diffW = numDiff(act, exp, tol);
          if (diffW !== null) {
            failures.push({
              fixtureId,
              sourceId: schemaNode.id,
              nodeType: schemaNode.type,
              category: "BORDER",
              property: `stroke.${sideName}`,
              expected: exp,
              actual: act,
              difference: diffW,
              tolerance: tol,
              message: `Node '${schemaNode.id}' ${sideName} stroke weight expected ${exp}, got ${act}`,
            });
          }
        };
        checkSide("top", "topWidth");
        checkSide("right", "rightWidth");
        checkSide("bottom", "bottomWidth");
        checkSide("left", "leftWidth");
      }

      const diffC = colorDiff(stroke.color, primary.color, colorTol);
      if (diffC) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "BORDER",
          property: "strokeColor",
          expected: primary.color,
          actual: stroke.color,
          difference: diffC,
          tolerance: colorTol,
          message: `Node '${schemaNode.id}' stroke color mismatch: ${diffC}`,
        });
      }
    }
  }

  return failures;
}

export function compareRadius(
  schemaNode: DesignNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
  tol: number = DEFAULT_GEOMETRY_EPSILON,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];
  const radius = schemaNode.style?.cornerRadius;

  if (radius !== undefined) {
    if (typeof radius === "number") {
      const actualUniform = rendered.radius?.uniform ?? 0;
      const diff = numDiff(actualUniform, radius, tol);
      if (diff !== null) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "RADIUS",
          property: "cornerRadius",
          expected: radius,
          actual: actualUniform,
          difference: diff,
          tolerance: tol,
          message: `Node '${schemaNode.id}' cornerRadius expected ${radius}, got ${actualUniform}`,
        });
      }
    } else {
      const checkCorner = (corner: "topLeft" | "topRight" | "bottomRight" | "bottomLeft") => {
        const expected = radius[corner];
        const actual = rendered.radius?.[corner] ?? rendered.radius?.uniform ?? 0;
        const diff = numDiff(actual, expected, tol);
        if (diff !== null) {
          failures.push({
            fixtureId,
            sourceId: schemaNode.id,
            nodeType: schemaNode.type,
            category: "RADIUS",
            property: `radius.${corner}`,
            expected,
            actual,
            difference: diff,
            tolerance: tol,
            message: `Node '${schemaNode.id}' ${corner} expected ${expected}, got ${actual}`,
          });
        }
      };
      checkCorner("topLeft");
      checkCorner("topRight");
      checkCorner("bottomRight");
      checkCorner("bottomLeft");
    }
  }

  return failures;
}

export function compareShadow(
  schemaNode: DesignNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
  tol: number = DEFAULT_GEOMETRY_EPSILON,
  colorTol: number = DEFAULT_COLOR_EPSILON,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];
  const shadows = schemaNode.style?.boxShadows ?? [];
  const renderedEffects = rendered.effects ?? [];

  if (shadows.length > 0) {
    if (renderedEffects.length === 0) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "SHADOW",
        property: "effects",
        expected: `${shadows.length} shadow effect(s) present`,
        actual: "none",
        message: `Node '${schemaNode.id}' expected ${shadows.length} shadow effect(s), got none`,
      });
      return failures;
    }

    if (renderedEffects.length !== shadows.length) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "SHADOW",
        property: "effects.length",
        expected: shadows.length,
        actual: renderedEffects.length,
        message: `Node '${schemaNode.id}' shadow count mismatch: expected ${shadows.length}, got ${renderedEffects.length}`,
      });
    }

    for (let i = 0; i < shadows.length; i++) {
      const expected = shadows[i]!;
      const actual = renderedEffects[i];
      if (!actual) continue;

      const expType = expected.inset ? "INNER_SHADOW" : "DROP_SHADOW";
      if (actual.type !== expType) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "SHADOW",
          property: `effects[${i}].type`,
          expected: expType,
          actual: actual.type,
          message: `Node '${schemaNode.id}' shadow[${i}] type mismatch: expected ${expType}, got ${actual.type}`,
        });
      }

      const checkNum = (prop: "offsetX" | "offsetY" | "blurRadius" | "spreadRadius", actVal: number, expVal: number) => {
        const diff = numDiff(actVal, expVal, tol);
        if (diff !== null) {
          failures.push({
            fixtureId,
            sourceId: schemaNode.id,
            nodeType: schemaNode.type,
            category: "SHADOW",
            property: `effects[${i}].${prop}`,
            expected: expVal,
            actual: actVal,
            difference: diff,
            tolerance: tol,
            message: `Node '${schemaNode.id}' shadow[${i}] ${prop} expected ${expVal}, got ${actVal}`,
          });
        }
      };

      checkNum("offsetX", actual.offsetX, expected.offsetX);
      checkNum("offsetY", actual.offsetY, expected.offsetY);
      checkNum("blurRadius", actual.blurRadius, expected.blurRadius);
      checkNum("spreadRadius", actual.spreadRadius, expected.spreadRadius);

      const diffC = colorDiff(actual.color, expected.color, colorTol);
      if (diffC) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "SHADOW",
          property: `effects[${i}].color`,
          expected: expected.color,
          actual: actual.color,
          difference: diffC,
          tolerance: colorTol,
          message: `Node '${schemaNode.id}' shadow[${i}] color mismatch: ${diffC}`,
        });
      }
    }
  }

  return failures;
}

export function compareText(
  schemaNode: TextNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
  tol: number = DEFAULT_GEOMETRY_EPSILON,
  colorTol: number = DEFAULT_COLOR_EPSILON,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  if (rendered.figmaType !== "TEXT") {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "TEXT",
      property: "figmaType",
      expected: "TEXT",
      actual: rendered.figmaType,
      message: `Node '${schemaNode.id}' rendered as '${rendered.figmaType}' instead of 'TEXT'`,
    });
    return failures;
  }

  const text = rendered.text;
  if (!text) {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "TEXT",
      property: "text",
      expected: "Text properties present",
      actual: "undefined",
      message: `Node '${schemaNode.id}' missing text data in normalized tree`,
    });
    return failures;
  }

  if (text.characters !== schemaNode.characters) {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "TEXT",
      property: "characters",
      expected: schemaNode.characters,
      actual: text.characters,
      message: `Node '${schemaNode.id}' text characters mismatch: '${text.characters}' vs '${schemaNode.characters}'`,
    });
  }

  const diffSize = numDiff(text.fontSize, schemaNode.textStyle.fontSize, tol);
  if (diffSize !== null) {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "TEXT",
      property: "fontSize",
      expected: schemaNode.textStyle.fontSize,
      actual: text.fontSize,
      difference: diffSize,
      tolerance: tol,
      message: `Node '${schemaNode.id}' fontSize expected ${schemaNode.textStyle.fontSize}, got ${text.fontSize}`,
    });
  }

  // Text color fill
  const fills = (rendered.fills ?? []).filter((f) => f.type === "SOLID");
  if (fills.length > 0 && fills[0]!.color) {
    const diffC = colorDiff(fills[0]!.color, schemaNode.textStyle.color, colorTol);
    if (diffC) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "TEXT",
        property: "color",
        expected: schemaNode.textStyle.color,
        actual: fills[0]!.color,
        difference: diffC,
        tolerance: colorTol,
        message: `Node '${schemaNode.id}' text fill color mismatch: ${diffC}`,
      });
    }
  }

  // Opacity
  const diffOp = numDiff(rendered.opacity, schemaNode.opacity, DEFAULT_OPACITY_EPSILON);
  if (diffOp !== null) {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "TEXT",
      property: "opacity",
      expected: schemaNode.opacity,
      actual: rendered.opacity,
      difference: diffOp,
      tolerance: DEFAULT_OPACITY_EPSILON,
      message: `Node '${schemaNode.id}' text opacity expected ${schemaNode.opacity}, got ${rendered.opacity}`,
    });
  }

  return failures;
}

export function compareImage(
  schemaNode: ImageNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
  doc: VersionedDesignDocument,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  if (rendered.figmaType !== "RECTANGLE") {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "IMAGE",
      property: "figmaType",
      expected: "RECTANGLE",
      actual: rendered.figmaType,
      message: `Image node '${schemaNode.id}' rendered as '${rendered.figmaType}' instead of 'RECTANGLE'`,
    });
  }

  const asset = doc.assets.find((a) => a.id === schemaNode.assetId);
  if (asset) {
    const expectedScaleMode = schemaNode.fit === "contain" ? "FIT" : "FILL";
    if (rendered.image?.scaleMode && rendered.image.scaleMode !== expectedScaleMode) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "IMAGE",
        property: "scaleMode",
        expected: expectedScaleMode,
        actual: rendered.image.scaleMode,
        message: `Image node '${schemaNode.id}' scaleMode expected '${expectedScaleMode}', got '${rendered.image.scaleMode}'`,
      });
    }
  }

  return failures;
}

export function compareSvg(
  schemaNode: SvgNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  if (!rendered.svg?.isVectorContainer && rendered.name !== "SVG Group" && rendered.sourceType !== "svg") {
    failures.push({
      fixtureId,
      sourceId: schemaNode.id,
      nodeType: schemaNode.type,
      category: "SVG",
      property: "isVectorContainer",
      expected: true,
      actual: false,
      message: `SVG node '${schemaNode.id}' was not rendered as a vector container`,
    });
  }

  return failures;
}

export function compareWarnings(
  actualWarnings: RendererWarning[],
  expectedRules: ExpectedWarningRule[],
  fixtureId: string,
): { failures: FidelityFailure[]; expectedCount: number; unexpectedCount: number } {
  const failures: FidelityFailure[] = [];
  let expectedCount = 0;
  let unexpectedCount = 0;

  for (const actual of actualWarnings) {
    const isExpected = expectedRules.some(
      (rule) => rule.code === actual.code && (!rule.nodeId || rule.nodeId === actual.nodeId),
    );

    if (isExpected) {
      expectedCount++;
    } else {
      unexpectedCount++;
      failures.push({
        fixtureId,
        sourceId: actual.nodeId ?? "document",
        nodeType: "renderer",
        category: "WARNING",
        property: "warning.code",
        expected: "none or baselined",
        actual: actual.code,
        message: `Unexpected renderer warning '${actual.code}' on node '${actual.nodeId}': ${actual.message}`,
      });
    }
  }

  return { failures, expectedCount, unexpectedCount };
}

export function compareClipping(
  schemaNode: DesignNode,
  rendered: NormalizedRenderedNode,
  fixtureId: string,
): FidelityFailure[] {
  const failures: FidelityFailure[] = [];

  if (schemaNode.type === "frame") {
    const expectedClip = Boolean(schemaNode.clip?.x || schemaNode.clip?.y);
    const actualClip = Boolean(rendered.clipsContent);

    if (expectedClip !== actualClip) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "CLIPPING",
        property: "clipsContent",
        expected: expectedClip,
        actual: actualClip,
        message: `node: ${schemaNode.id} expected clipsContent=${expectedClip} actual=${actualClip}`,
      });
    }
  }

  return failures;
}

export interface SourceIndex {
  bySourceId: Map<string, NormalizedRenderedNode>;
  duplicates: string[];
  totalNodes: number;
}

export function buildSourceIndex(renderedTree: NormalizedRenderedNode): SourceIndex {
  const bySourceId = new Map<string, NormalizedRenderedNode>();
  const duplicates: string[] = [];
  let totalNodes = 0;

  function traverse(node: NormalizedRenderedNode) {
    totalNodes++;
    if (node.sourceId) {
      if (bySourceId.has(node.sourceId)) {
        duplicates.push(node.sourceId);
      } else {
        bySourceId.set(node.sourceId, node);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(renderedTree);
  return { bySourceId, duplicates, totalNodes };
}

export function runDocumentFidelity(
  doc: VersionedDesignDocument,
  renderedTree: NormalizedRenderedNode,
  manifestEntry: FixtureManifestEntry,
  actualWarnings: RendererWarning[],
): {
  failures: FidelityFailure[];
  stats: {
    nodesCompared: number;
    geometryChecks: number;
    styleChecks: number;
    textChecks: number;
    assetChecks: number;
    warningsExpected: number;
    warningsUnexpected: number;
  };
} {
  const failures: FidelityFailure[] = [];
  const { bySourceId, duplicates } = buildSourceIndex(renderedTree);

  // Assert no duplicate source IDs
  for (const dup of duplicates) {
    failures.push({
      fixtureId: manifestEntry.id,
      sourceId: dup,
      nodeType: "rendered",
      category: "HIERARCHY",
      property: "sourceId",
      expected: "unique sourceId",
      actual: "duplicate",
      message: `Duplicate rendered node sourceId '${dup}' detected`,
    });
  }

  let nodesCompared = 0;
  let geometryChecks = 0;
  let styleChecks = 0;
  let textChecks = 0;
  let assetChecks = 0;

  const cats = new Set(manifestEntry.expectedCategories);

  function checkNode(schemaNode: DesignNode) {
    const rendered = bySourceId.get(schemaNode.id);
    if (!rendered) {
      failures.push({
        fixtureId: manifestEntry.id,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "HIERARCHY",
        property: "mapping",
        expected: `Rendered node for schema node ${schemaNode.id}`,
        actual: "missing",
        message: `Schema node '${schemaNode.id}' (${schemaNode.type}) was not found in rendered tree`,
      });
      return;
    }

    nodesCompared++;

    // 1. Geometry
    if (cats.has("GEOMETRY")) {
      geometryChecks += 4;
      failures.push(...compareGeometry(schemaNode, rendered, manifestEntry.id));
    }

    // 2. Hierarchy
    if (cats.has("HIERARCHY")) {
      failures.push(...compareHierarchy(schemaNode, rendered, manifestEntry.id));
    }

    // 3. Fills
    if (cats.has("FILL")) {
      styleChecks++;
      failures.push(...compareFill(schemaNode, rendered, manifestEntry.id));
    }

    // 4. Borders
    if (cats.has("BORDER")) {
      styleChecks++;
      failures.push(...compareStroke(schemaNode, rendered, manifestEntry.id));
    }

    // 5. Radius
    if (cats.has("RADIUS")) {
      styleChecks++;
      failures.push(...compareRadius(schemaNode, rendered, manifestEntry.id));
    }

    // 6. Shadows
    if (cats.has("SHADOW")) {
      styleChecks++;
      failures.push(...compareShadow(schemaNode, rendered, manifestEntry.id));
    }

    // 7. Text
    if (schemaNode.type === "text" && cats.has("TEXT")) {
      textChecks++;
      failures.push(...compareText(schemaNode, rendered, manifestEntry.id));
    }

    // 8. Image
    if (schemaNode.type === "image" && (cats.has("IMAGE") || cats.has("ASSET"))) {
      assetChecks++;
      failures.push(...compareImage(schemaNode, rendered, manifestEntry.id, doc));
    }

    // 9. SVG
    if (schemaNode.type === "svg" && cats.has("SVG")) {
      assetChecks++;
      failures.push(...compareSvg(schemaNode, rendered, manifestEntry.id));
    }

    // 10. Clipping
    if (cats.has("CLIPPING") && schemaNode.type === "frame") {
      styleChecks++;
      failures.push(...compareClipping(schemaNode, rendered, manifestEntry.id));
    }

    // Recurse children for frames
    if (schemaNode.type === "frame" && schemaNode.children) {
      for (const child of schemaNode.children) {
        checkNode(child);
      }
    }
  }

  // Check from root
  checkNode(doc.root);

  // Warnings check
  const warningResult = compareWarnings(
    actualWarnings,
    manifestEntry.expectedWarnings ?? [],
    manifestEntry.id,
  );
  failures.push(...warningResult.failures);

  return {
    failures,
    stats: {
      nodesCompared,
      geometryChecks,
      styleChecks,
      textChecks,
      assetChecks,
      warningsExpected: warningResult.expectedCount,
      warningsUnexpected: warningResult.unexpectedCount,
    },
  };
}
