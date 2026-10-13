#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { representativeFixtures } from "../packages/test-fixtures/dist/index.js";
import {
  renderDesignDocument,
  normalizeRenderedTree,
  runDocumentFidelity,
  FIXTURE_MANIFEST,
  FakeFigmaHost,
} from "../packages/figma-renderer/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const goldenDir = path.resolve(rootDir, "packages/figma-renderer/golden");
const reportPath = path.resolve(rootDir, "packages/figma-renderer/dist/fidelity-report.json");

const isUpdate = process.argv.includes("--update");

if (!fs.existsSync(goldenDir)) {
  fs.mkdirSync(goldenDir, { recursive: true });
}

// Map canonical fixtures to manifest IDs
const canonicalFixtureMap = {
  "canonical-simple-text": representativeFixtures.simpleText,
  "canonical-styled-rectangle": representativeFixtures.styledRectangle,
  "canonical-text-card": representativeFixtures.textCard,
  "canonical-image": representativeFixtures.image,
  "canonical-inline-svg": representativeFixtures.inlineSvg,
  "canonical-shadow": representativeFixtures.shadow,
  "canonical-nested-frames": representativeFixtures.nestedFrames,
};

async function runFidelity() {
  console.log(`\n======================================================`);
  console.log(` Web2Design Fidelity & Regression Suite (W2D-008)`);
  console.log(` Mode: ${isUpdate ? "UPDATE GOLDEN BASELINES" : "VERIFY AGAINST BASELINES"}`);
  console.log(`======================================================\n`);

  let totalNodesCompared = 0;
  let totalGeometryChecks = 0;
  let totalStyleChecks = 0;
  let totalTextChecks = 0;
  let totalAssetChecks = 0;
  let totalWarningsExpected = 0;
  let totalWarningsUnexpected = 0;
  const allFailures = [];

  let fixturesProcessed = 0;

  for (const entry of FIXTURE_MANIFEST) {
    let doc;
    if (entry.kind === "schema-fixture") {
      doc = canonicalFixtureMap[entry.id];
      if (!doc) {
        throw new Error(`Canonical fixture mapping missing for '${entry.id}'`);
      }
    } else {
      const fullPath = path.resolve(rootDir, entry.sourcePath);
      if (!fs.existsSync(fullPath)) {
        console.warn(`[WARN] Chrome smoke capture not found: ${entry.sourcePath}`);
        continue;
      }
      doc = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    }

    const host = new FakeFigmaHost();
    const renderResult = await renderDesignDocument(doc, host);
    const rootFrame = host.roots[0];
    if (!rootFrame) {
      allFailures.push({
        fixtureId: entry.id,
        sourceId: doc.root.id,
        nodeType: "frame",
        category: "HIERARCHY",
        property: "rootNode",
        expected: "Root FrameNode created",
        actual: "None",
        message: `Fixture '${entry.id}' failed to create root frame in FakeFigmaHost`,
      });
      continue;
    }

    const normalizedTree = normalizeRenderedTree(rootFrame, doc.root.x, doc.root.y);
    const goldenFilePath = path.join(goldenDir, `${entry.id}.golden.json`);

    if (isUpdate) {
      fs.writeFileSync(goldenFilePath, JSON.stringify(normalizedTree, null, 2) + "\n", "utf-8");
      console.log(`  [UPDATED] ${entry.id} (${entry.name})`);
    } else {
      if (!fs.existsSync(goldenFilePath)) {
        allFailures.push({
          fixtureId: entry.id,
          sourceId: doc.root.id,
          nodeType: "golden",
          category: "WARNING",
          property: "goldenBaseline",
          expected: `Golden file exists: ${entry.id}.golden.json`,
          actual: "Missing",
          message: `Golden snapshot missing for '${entry.id}'. Run 'npm run fidelity:update' to establish baseline.`,
        });
      } else {
        const golden = JSON.parse(fs.readFileSync(goldenFilePath, "utf-8"));
        const goldenStr = JSON.stringify(golden);
        const actualStr = JSON.stringify(normalizedTree);
        if (goldenStr !== actualStr) {
          allFailures.push({
            fixtureId: entry.id,
            sourceId: doc.root.id,
            nodeType: "golden",
            category: "GEOMETRY",
            property: "normalizedSnapshot",
            expected: "Matches golden snapshot",
            actual: "Differs from golden snapshot",
            message: `Normalized rendered scene differs from golden snapshot in '${entry.id}.golden.json'`,
          });
        }
      }
    }

    // Run structural & semantic fidelity comparators
    const { failures, stats } = runDocumentFidelity(
      doc,
      normalizedTree,
      entry,
      renderResult.warnings,
    );

    fixturesProcessed++;
    totalNodesCompared += stats.nodesCompared;
    totalGeometryChecks += stats.geometryChecks;
    totalStyleChecks += stats.styleChecks;
    totalTextChecks += stats.textChecks;
    totalAssetChecks += stats.assetChecks;
    totalWarningsExpected += stats.warningsExpected;
    totalWarningsUnexpected += stats.warningsUnexpected;

    if (failures.length > 0) {
      allFailures.push(...failures);
      console.log(`  [FAIL] ${entry.id} — ${failures.length} fidelity failure(s)`);
    } else {
      console.log(
        `  [PASS] ${entry.id.padEnd(28)} | ${String(stats.nodesCompared).padStart(3)} nodes | ` +
          `${String(stats.geometryChecks).padStart(3)} geom | ${String(stats.styleChecks).padStart(3)} style | ` +
          `${String(stats.textChecks).padStart(2)} text | ${String(stats.assetChecks).padStart(2)} asset | ` +
          `${String(stats.warningsExpected).padStart(2)} warn`,
      );
    }
  }

  const report = {
    fixtures: fixturesProcessed,
    nodesCompared: totalNodesCompared,
    geometryChecks: totalGeometryChecks,
    styleChecks: totalStyleChecks,
    textChecks: totalTextChecks,
    assetChecks: totalAssetChecks,
    warningsExpected: totalWarningsExpected,
    warningsUnexpected: totalWarningsUnexpected,
    failures: allFailures.length,
    failureDetails: allFailures.length > 0 ? allFailures : undefined,
  };

  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");

  console.log(`\n------------------------------------------------------`);
  console.log(` Fidelity Summary:`);
  console.log(`   Fixtures evaluated:     ${fixturesProcessed}`);
  console.log(`   Nodes compared:         ${totalNodesCompared}`);
  console.log(`   Geometry assertions:    ${totalGeometryChecks}`);
  console.log(`   Style assertions:       ${totalStyleChecks}`);
  console.log(`   Text assertions:        ${totalTextChecks}`);
  console.log(`   Asset assertions:       ${totalAssetChecks}`);
  console.log(`   Expected warnings:      ${totalWarningsExpected}`);
  console.log(`   Unexpected warnings:    ${totalWarningsUnexpected}`);
  console.log(`   Fidelity failures:      ${allFailures.length}`);
  console.log(`   Report written:         ${path.relative(rootDir, reportPath)}`);
  console.log(`------------------------------------------------------\n`);

  if (allFailures.length > 0) {
    console.error(`\n❌ FIDELITY REGRESSION DETECTED (${allFailures.length} failure(s)):\n`);
    for (const f of allFailures.slice(0, 20)) {
      console.error(`[${f.category}] Fixture: ${f.fixtureId}`);
      console.error(`  node:      ${f.sourceId} (${f.nodeType})`);
      console.error(`  property:  ${f.property}`);
      console.error(`  expected:  ${JSON.stringify(f.expected)}`);
      console.error(`  actual:    ${JSON.stringify(f.actual)}`);
      if (f.difference !== undefined) console.error(`  diff:      ${f.difference}`);
      if (f.tolerance !== undefined) console.error(`  tolerance: ${f.tolerance}`);
      console.error(`  message:   ${f.message}\n`);
    }
    if (allFailures.length > 20) {
      console.error(`... and ${allFailures.length - 20} more failures.\n`);
    }
    process.exit(1);
  }

  console.log(`✅ All ${fixturesProcessed} fidelity fixtures PASSED with 0 unexpected warnings.\n`);
}

runFidelity().catch((err) => {
  console.error("Fatal error in fidelity runner:", err);
  process.exit(1);
});
