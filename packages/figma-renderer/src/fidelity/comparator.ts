import type {
  Color,
  DesignDocument,
  DesignNode,
  ImageNode,
  SvgNode,
  TextNode,
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
    const renderedSolidFills = (rendered.fills ?? []).filter((f) => f.type === "SOLID");
    if (renderedSolidFills.length > 0) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "FILL",
        property: "fills",
        expected: "empty",
        actual: renderedSolidFills.length,
        message: `Node '${schemaNode.id}' has accidental fill when schema had none`,
      });
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

  const border = schemaNode.style?.border;
  if (border && border.width > 0 && border.style !== "none") {
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
        message: `Node '${schemaNode.id}' expected stroke width ${border.width}, got none`,
      });
    } else {
      const stroke = renderedStrokes[0]!;
      const diffW = numDiff(stroke.width, border.width, tol);
      if (diffW !== null) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "BORDER",
          property: "strokeWeight",
          expected: border.width,
          actual: stroke.width,
          difference: diffW,
          tolerance: tol,
          message: `Node '${schemaNode.id}' stroke weight expected ${border.width}, got ${stroke.width}`,
        });
      }
      const diffC = colorDiff(stroke.color, border.color, colorTol);
      if (diffC) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "BORDER",
          property: "strokeColor",
          expected: border.color,
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

  if (shadows.length > 0 && !shadows[0]!.inset) {
    const expected = shadows[0]!;
    const renderedEffects = rendered.effects ?? [];
    const dropShadow = renderedEffects.find((e) => e.type === "DROP_SHADOW");

    if (!dropShadow) {
      failures.push({
        fixtureId,
        sourceId: schemaNode.id,
        nodeType: schemaNode.type,
        category: "SHADOW",
        property: "effects",
        expected: "DROP_SHADOW present",
        actual: "none",
        message: `Node '${schemaNode.id}' expected DROP_SHADOW effect, got none`,
      });
    } else {
      const checkNum = (prop: "offsetX" | "offsetY" | "blurRadius" | "spreadRadius", actual: number, exp: number) => {
        const diff = numDiff(actual, exp, tol);
        if (diff !== null) {
          failures.push({
            fixtureId,
            sourceId: schemaNode.id,
            nodeType: schemaNode.type,
            category: "SHADOW",
            property: prop,
            expected: exp,
            actual,
            difference: diff,
            tolerance: tol,
            message: `Node '${schemaNode.id}' shadow ${prop} expected ${exp}, got ${actual}`,
          });
        }
      };

      checkNum("offsetX", dropShadow.offsetX, expected.offsetX);
      checkNum("offsetY", dropShadow.offsetY, expected.offsetY);
      checkNum("blurRadius", dropShadow.blurRadius, expected.blurRadius);
      checkNum("spreadRadius", dropShadow.spreadRadius, expected.spreadRadius);

      const diffC = colorDiff(dropShadow.color, expected.color, colorTol);
      if (diffC) {
        failures.push({
          fixtureId,
          sourceId: schemaNode.id,
          nodeType: schemaNode.type,
          category: "SHADOW",
          property: "color",
          expected: expected.color,
          actual: dropShadow.color,
          difference: diffC,
          tolerance: colorTol,
          message: `Node '${schemaNode.id}' shadow color mismatch: ${diffC}`,
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
  doc: DesignDocument,
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
  doc: DesignDocument,
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
