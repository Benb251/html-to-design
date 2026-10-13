import { describe, expect, it } from "vitest";
import { FontManager } from "../src/fonts.js";
import { WarningCollector } from "../src/warnings.js";
import { FakeFigmaHost } from "./helpers/fake-figma-host.js";

describe("figma-renderer - fonts", () => {
  it("resolves and loads available font matching family and weight", async () => {
    const host = new FakeFigmaHost();
    const manager = new FontManager(host);
    await manager.init();

    const warnings = new WarningCollector();
    const textStyle = {
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 700,
      fontStyle: "normal" as const,
      lineHeight: 24,
      letterSpacing: 0,
      textAlign: "left" as const,
      color: { r: 0, g: 0, b: 0, a: 1 },
    };

    const font = await manager.resolveAndLoadFont(textStyle, warnings, "text-1");

    expect(font).toEqual({ family: "Inter", style: "Bold" });
    expect(warnings.getWarnings().length).toBe(0);
  });

  it("caches loaded fonts to avoid redundant loadFontAsync calls", async () => {
    const host = new FakeFigmaHost();
    const manager = new FontManager(host);
    await manager.init();

    const warnings = new WarningCollector();
    const textStyle = {
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      fontStyle: "normal" as const,
      lineHeight: 24,
      letterSpacing: 0,
      textAlign: "left" as const,
      color: { r: 0, g: 0, b: 0, a: 1 },
    };

    await manager.resolveAndLoadFont(textStyle, warnings, "text-1");
    const countAfterFirst = host.loadedFonts.length;

    await manager.resolveAndLoadFont(textStyle, warnings, "text-2");
    expect(host.loadedFonts.length).toBe(countAfterFirst);
  });

  it("tries font fallbacks when primary family is unavailable", async () => {
    const host = new FakeFigmaHost();
    const manager = new FontManager(host);
    await manager.init();

    const warnings = new WarningCollector();
    const textStyle = {
      fontFamily: "NonExistentPrimaryFont",
      fontFallbacks: ["Roboto", "sans-serif"],
      fontSize: 14,
      fontWeight: 400,
      fontStyle: "normal" as const,
      lineHeight: 20,
      letterSpacing: 0,
      textAlign: "left" as const,
      color: { r: 0, g: 0, b: 0, a: 1 },
    };

    const font = await manager.resolveAndLoadFont(textStyle, warnings, "text-1");

    expect(font.family).toBe("Roboto");
    expect(warnings.getWarnings().length).toBe(0);
  });

  it("falls back to default font and emits FONT_FALLBACK warning when no family exists", async () => {
    const host = new FakeFigmaHost();
    const manager = new FontManager(host);
    await manager.init();

    const warnings = new WarningCollector();
    const textStyle = {
      fontFamily: "UnknownWebFont123",
      fontSize: 18,
      fontWeight: 600,
      fontStyle: "normal" as const,
      lineHeight: 26,
      letterSpacing: 0,
      textAlign: "left" as const,
      color: { r: 0, g: 0, b: 0, a: 1 },
    };

    const font = await manager.resolveAndLoadFont(textStyle, warnings, "text-1");

    expect(font).toEqual({ family: "Inter", style: "Regular" });
    const fallbackWarning = warnings.getWarnings().find((w) => w.code === "FONT_FALLBACK");
    expect(fallbackWarning).toBeDefined();
    expect(fallbackWarning?.message).toContain("UnknownWebFont123");
  });
});
