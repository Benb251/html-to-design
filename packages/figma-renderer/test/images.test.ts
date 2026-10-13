import { describe, expect, it } from "vitest";
import { createFigmaImageFill, resolveImageScaleMode } from "../src/images.js";
import { WarningCollector } from "../src/warnings.js";
import { FakeFigmaHost } from "./helpers/fake-figma-host.js";

describe("figma-renderer - images", () => {
  it("resolves object-fit values to Figma scaleMode", () => {
    const warnings = new WarningCollector();

    expect(resolveImageScaleMode("cover", warnings, "img-1")).toBe("FILL");
    expect(resolveImageScaleMode("contain", warnings, "img-2")).toBe("FIT");

    expect(resolveImageScaleMode("fill", warnings, "img-3")).toBe("FILL");
    expect(warnings.getWarnings().some((w) => w.code === "OBJECT_FIT_APPROXIMATED")).toBe(true);

    expect(resolveImageScaleMode("none", warnings, "img-4")).toBe("FIT");
  });

  it("creates image fill from remote URL asset", async () => {
    const host = new FakeFigmaHost();
    const warnings = new WarningCollector();
    const asset = {
      id: "asset-1",
      kind: "image" as const,
      source: { type: "url" as const, url: "https://example.com/photo.png" },
    };

    const fill = await createFigmaImageFill(asset, "FILL", host, warnings, "node-1");

    expect(fill).not.toBeNull();
    expect(fill?.type).toBe("IMAGE");
    expect(fill?.scaleMode).toBe("FILL");
    expect(fill?.imageHash).toContain("photo.png");
    expect(warnings.getWarnings().length).toBe(0);
  });

  it("creates image fill from data URL asset", async () => {
    const host = new FakeFigmaHost();
    const warnings = new WarningCollector();
    const asset = {
      id: "asset-2",
      kind: "image" as const,
      source: {
        type: "data-url" as const,
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    };

    const fill = await createFigmaImageFill(asset, "FIT", host, warnings, "node-2");

    expect(fill).not.toBeNull();
    expect(fill?.type).toBe("IMAGE");
    expect(fill?.scaleMode).toBe("FIT");
    expect(warnings.getWarnings().length).toBe(0);
  });

  it("creates image fill from embedded base64 asset", async () => {
    const host = new FakeFigmaHost();
    const warnings = new WarningCollector();
    const asset = {
      id: "asset-3",
      kind: "image" as const,
      source: {
        type: "embedded" as const,
        encoding: "base64" as const,
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    };

    const fill = await createFigmaImageFill(asset, "FILL", host, warnings, "node-3");

    expect(fill).not.toBeNull();
    expect(fill?.type).toBe("IMAGE");
  });

  it("handles remote image failure by emitting IMAGE_LOAD_FAILED warning and returning null", async () => {
    const host = new FakeFigmaHost();
    const warnings = new WarningCollector();
    const asset = {
      id: "asset-broken",
      kind: "image" as const,
      source: { type: "url" as const, url: "https://example.com/fail-404-image.png" },
    };

    const fill = await createFigmaImageFill(asset, "FILL", host, warnings, "node-broken");

    expect(fill).toBeNull();
    const warning = warnings.getWarnings().find((w) => w.code === "IMAGE_LOAD_FAILED");
    expect(warning).toBeDefined();
    expect(warning?.assetId).toBe("asset-broken");
  });
});
