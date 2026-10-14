// scripts/build-acceptance-corpus.mjs
// Packages the compact acceptance corpus (Scenarios A through H) for W2D-018 interactive/manual validation.

import fs from "node:fs/promises";
import path from "node:path";
import { safeParseDesignDocument } from "../packages/design-schema/dist/index.js";

const CORPUS_DIR = "docs/evidence/w2d-018/corpus";

const SCENARIOS = [
  {
    code: "A",
    id: "scenario-A-canonical-sample",
    name: "Canonical Sample Document",
    sourceFile: "apps/figma-plugin/dist/sample-w2d-document.json",
    description: "Bundled canonical sample document verifying root frame creation, viewport centering, image asset record, and traceability plugin data.",
    features: ["Root frame creation", "Viewport centering", "Basic image asset", "Traceability metadata"]
  },
  {
    code: "B",
    id: "scenario-B-style-text-hierarchy",
    name: "Normal Style & Typography Hierarchy",
    sourceFile: "apps/extension/.smoke/capture.json",
    description: "Full landing page capture verifying cards, nested container frames, headings, paragraphs, typography styles, and scroll-stable coordinates.",
    features: ["Nested frames", "Card hierarchy", "Typography line-height", "Solid fills", "Rounded corners"]
  },
  {
    code: "C",
    id: "scenario-C-images-svg",
    name: "Images & Inline SVG Vectors",
    sourceFile: "apps/extension/.smoke/fidelity-assets.json",
    description: "Asset document verifying standard <img> elements as ImagePaint rectangles and inline <svg> elements as native vector node subtrees.",
    features: ["ImagePaint fills", "object-fit cover/contain", "Native SVG vector containers", "Asset registry"]
  },
  {
    code: "D",
    id: "scenario-D-gradients-borders-shadows",
    name: "Gradients, Non-Uniform Borders & Shadows",
    sourceFile: "apps/extension/.smoke/fidelity-borders-shadows.json",
    description: "Visual styling document verifying linear/radial gradients, independent per-side border weights, multiple drop shadows, and inset shadows.",
    features: ["GRADIENT_LINEAR", "GRADIENT_RADIAL", "Per-side stroke weights", "DROP_SHADOW stacks", "INNER_SHADOW"]
  },
  {
    code: "E",
    id: "scenario-E-clipping-transforms",
    name: "Container Clipping & CSS 2D Transforms",
    sourceFile: "apps/extension/.smoke/fidelity-transforms.json",
    description: "Geometry stress document verifying frame container clipping (overflow: hidden), CSS 2D rotation, relativeTransform, and origin compensation.",
    features: ["clipsContent = true", "CSS 2D rotation", "relativeTransform translation", "Origin compensation"]
  },
  {
    code: "F",
    id: "scenario-F-rich-text-ranges",
    name: "Single-TextNode Rich Text Paragraph Spans",
    sourceFile: "apps/extension/.smoke/fidelity-rich-text.json",
    description: "Rich text document verifying continuous inline text flows collapsed into a single Figma TextNode with native ranged bold/italic/color/size and hyperlinks.",
    features: ["Single TextNode", "Ranged bold/italic/weight", "Ranged colors/sizes", "Hyperlink URL ranges", "Font fallback"]
  },
  {
    code: "G",
    id: "scenario-G-auto-layout",
    name: "Native Semantic Auto Layout (V0.7)",
    sourceFile: "apps/extension/.smoke/fidelity-auto-layout.json",
    description: "High-confidence Auto Layout document verifying horizontal/vertical frames, padding, gap, alignment, grow, stretch, absolute overlays, and fallback frames.",
    features: ["layoutMode HORIZONTAL/VERTICAL", "itemSpacing & padding", "primary/counter alignments", "layoutGrow & layoutAlign", "layoutPositioning ABSOLUTE"]
  },
  {
    code: "H",
    id: "scenario-H-real-chrome-capture",
    name: "Actual Real-World Chrome Capture (react.dev)",
    sourceFile: "docs/evidence/w2d-017/framework-01-react.json",
    description: "Live production capture of react.dev produced by unpacked extension, verifying real-world large DOM scale, 131 Auto Layout frames, and 0 skipped nodes.",
    features: ["1,023 nodes", "131 Auto Layout frames", "Complex real-world layouts", "Unpacked extension capture", "Zero skipped nodes"]
  }
];

async function build() {
  await fs.mkdir(CORPUS_DIR, { recursive: true });

  const manifest = [];

  for (const s of SCENARIOS) {
    const raw = await fs.readFile(path.resolve(s.sourceFile), "utf8");
    const doc = JSON.parse(raw);
    const parseRes = safeParseDesignDocument(doc);
    if (!parseRes.success) {
      throw new Error(`Scenario ${s.code} (${s.sourceFile}) failed schema validation!`);
    }

    const destFile = `${s.id}.json`;
    await fs.writeFile(path.join(CORPUS_DIR, destFile), JSON.stringify(doc, null, 2), "utf8");

    manifest.push({
      scenario: s.code,
      id: s.id,
      name: s.name,
      file: destFile,
      schemaVersion: doc.schemaVersion,
      totalNodes: countNodes(doc.root),
      description: s.description,
      features: s.features,
    });
    console.log(`[PASS] Packaged Scenario ${s.code}: ${s.name} (${destFile}) - schema ${doc.schemaVersion}`);
  }

  // Write corpus README
  let readme = `# Web2Design Compact Acceptance Corpus (W2D-018)\n\n`;
  readme += `This directory contains the 8 standalone acceptance scenarios covering all major capabilities of Web2Design V0.7 for interactive Figma Desktop validation.\n\n`;
  readme += `## Scenarios Overview\n\n`;
  readme += `| Scenario | Name | Schema | Nodes | File | Primary Test Objective |\n`;
  readme += `|---|---|---|---|---|---|\n`;
  for (const m of manifest) {
    readme += `| **${m.scenario}** | ${m.name} | \`${m.schemaVersion}\` | ${m.totalNodes} | [\`${m.file}\`](./${m.file}) | ${m.features.join(", ")} |\n`;
  }
  readme += `\n## How to Use in Figma Desktop\n\n`;
  readme += `1. In Figma Desktop, create a disposable Design file (e.g. \`Web2Design-Acceptance\`).\n`;
  readme += `2. Open Plugins -> Development -> Import plugin from manifest... -> select \`apps/figma-plugin/dist/manifest.json\`.\n`;
  readme += `3. Launch **Web2Design** from Plugins -> Development -> Web2Design.\n`;
  readme += `4. Open any scenario \`.json\` file from this corpus folder, copy its contents, paste into the plugin textarea, and click **Validate & Prepare** then **Import to Figma**.\n`;
  readme += `5. Inspect the resulting canvas against the criteria in \`docs/w2d-018-manual-checklist.md\`.\n`;

  await fs.writeFile(path.join(CORPUS_DIR, "README.md"), readme, "utf8");
  await fs.writeFile(path.join(CORPUS_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`\nCorpus packaged successfully into ${CORPUS_DIR}`);
}

function countNodes(node) {
  let count = 1;
  if (node.children) {
    for (const c of node.children) count += countNodes(c);
  }
  return count;
}

build().catch(console.error);
