import { describe, expect, it } from "vitest";
import type { TextStyle } from "@web2design/design-schema";
import { FontManager, WarningCollector } from "../../src/index.js";
import { FakeFigmaHost } from "../../src/fake-host.js";

describe("W2D-008 - Font Regression Fixtures (Section 21)", () => {
  function createControlledHost(): FakeFigmaHost {
    const host = new FakeFigmaHost();
    host.availableFonts = [
      { fontName: { family: "Inter", style: "Regular" } },
      { fontName: { family: "Inter", style: "Bold" } },
      { fontName: { family: "Inter", style: "Italic" } },
      { fontName: { family: "Inter", style: "Bold Italic" } },
      { fontName: { family: "Roboto", style: "Regular" } },
      { fontName: { family: "Roboto", style: "Bold" } },
      { fontName: { family: "Arial", style: "Regular" } },
    ];
    return host;
  }

  const baseStyle: TextStyle = {
    fontFamily: "Inter",
    fontFallbacks: [],
    fontSize: 16,
    fontWeight: 400,
    fontStyle: "normal",
    lineHeight: 24,
    letterSpacing: 0,
    textAlign: "left",
    color: { r: 0, g: 0, b: 0, a: 1 },
  };

  it("1. resolves exact available font without warnings", async () => {
    const host = createControlledHost();
    const fm = new FontManager(host);
    await fm.init();
    const warnings = new WarningCollector();

    const font = await fm.resolveAndLoadFont(baseStyle, warnings, "node-1");

    expect(font).toEqual({ family: "Inter", style: "Regular" });
    expect(warnings.getWarnings()).toHaveLength(0);
    expect(host.loadedFonts).toContainEqual({ family: "Inter", style: "Regular" });
  });

  it("2. resolves exact family + weight (bold)", async () => {
    const host = createControlledHost();
    const fm = new FontManager(host);
    await fm.init();
    const warnings = new WarningCollector();

    const font = await fm.resolveAndLoadFont(
      { ...baseStyle, fontWeight: 700 },
      warnings,
      "node-2",
    );

    expect(font).toEqual({ family: "Inter", style: "Bold" });
    expect(warnings.getWarnings()).toHaveLength(0);
  });

  it("3. resolves italic font style", async () => {
    const host = createControlledHost();
    const fm = new FontManager(host);
    await fm.init();
    const warnings = new WarningCollector();

    const font = await fm.resolveAndLoadFont(
      { ...baseStyle, fontStyle: "italic" },
      warnings,
      "node-3",
    );

    expect(font).toEqual({ family: "Inter", style: "Italic" });
    expect(warnings.getWarnings()).toHaveLength(0);
  });

  it("4. resolves fallback family when primary family is unavailable", async () => {
    const host = createControlledHost();
    const fm = new FontManager(host);
    await fm.init();
    const warnings = new WarningCollector();

    const font = await fm.resolveAndLoadFont(
      {
        ...baseStyle,
        fontFamily: "NonExistentPrimaryFont",
        fontFallbacks: ["Roboto", "Arial"],
      },
      warnings,
      "node-4",
    );

    expect(font).toEqual({ family: "Roboto", style: "Regular" });
    expect(warnings.getWarnings()).toHaveLength(0);
  });

  it("5. resolves default font when all candidates are unavailable and emits FONT_FALLBACK", async () => {
    const host = createControlledHost();
    const fm = new FontManager(host, { family: "Arial", style: "Regular" });
    await fm.init();
    const warnings = new WarningCollector();

    const font = await fm.resolveAndLoadFont(
      {
        ...baseStyle,
        fontFamily: "UnknownFontA",
        fontFallbacks: ["UnknownFontB", "UnknownFontC"],
      },
      warnings,
      "node-5",
    );

    expect(font).toEqual({ family: "Arial", style: "Regular" });
    const warnList = warnings.getWarnings();
    expect(warnList).toHaveLength(1);
    expect(warnList[0]!).toMatchObject({
      code: "FONT_FALLBACK",
      nodeId: "node-5",
    });
  });

  it("6. caches resolved font so repeated requests do not re-load the font", async () => {
    const host = createControlledHost();
    const fm = new FontManager(host);
    await fm.init();
    const warnings = new WarningCollector();

    const font1 = await fm.resolveAndLoadFont(baseStyle, warnings, "node-6a");
    const font2 = await fm.resolveAndLoadFont(baseStyle, warnings, "node-6b");
    const font3 = await fm.resolveAndLoadFont(baseStyle, warnings, "node-6c");

    expect(font1).toEqual({ family: "Inter", style: "Regular" });
    expect(font2).toEqual({ family: "Inter", style: "Regular" });
    expect(font3).toEqual({ family: "Inter", style: "Regular" });

    // Host should have loaded this font only once
    const loadedInterRegular = host.loadedFonts.filter(
      (f) => f.family === "Inter" && f.style === "Regular",
    );
    expect(loadedInterRegular).toHaveLength(1);
  });
});
