/// <reference types="@figma/plugin-typings" />
import type { TextStyle, TextRun } from "@web2design/design-schema";
import type { FigmaRendererHost } from "./types.js";
import type { WarningCollector } from "./warnings.js";

const DEFAULT_FONT: FontName = { family: "Inter", style: "Regular" };

function cleanFamilyName(name: string): string {
  return name.replace(/^["']|["']$/g, "").trim();
}

function weightToStyleNames(weight: number, isItalic: boolean): string[] {
  let baseWeights: string[];
  if (weight <= 150) {
    baseWeights = ["Thin", "Hairline", "Light", "Regular"];
  } else if (weight <= 250) {
    baseWeights = ["Extra Light", "ExtraLight", "Ultra Light", "Light", "Regular"];
  } else if (weight <= 350) {
    baseWeights = ["Light", "Regular"];
  } else if (weight <= 450) {
    baseWeights = ["Regular", "Normal", "Book", "Medium"];
  } else if (weight <= 550) {
    baseWeights = ["Medium", "Regular", "Semi Bold", "SemiBold"];
  } else if (weight <= 650) {
    baseWeights = ["Semi Bold", "SemiBold", "Demi Bold", "Bold", "Medium"];
  } else if (weight <= 750) {
    baseWeights = ["Bold", "Semi Bold", "SemiBold", "Black", "Regular"];
  } else if (weight <= 850) {
    baseWeights = ["Extra Bold", "ExtraBold", "Ultra Bold", "Bold", "Black"];
  } else {
    baseWeights = ["Black", "Heavy", "Extra Bold", "Bold"];
  }

  if (isItalic) {
    const italicVariants: string[] = [];
    for (const b of baseWeights) {
      italicVariants.push(`${b} Italic`);
      italicVariants.push(`${b}Italic`);
    }
    italicVariants.push("Italic");
    return [...italicVariants, ...baseWeights];
  }

  return baseWeights;
}

export interface ResolvedTextFonts {
  baseFont: FontName;
  runFonts: FontName[];
}

export class FontManager {
  private readonly loadedFonts = new Set<string>();
  private availableFonts: Font[] | null = null;
  private readonly host: FigmaRendererHost;
  private readonly defaultFont: FontName;

  constructor(host: FigmaRendererHost, defaultFont: FontName = DEFAULT_FONT) {
    this.host = host;
    this.defaultFont = defaultFont;
  }

  async init(): Promise<void> {
    try {
      this.availableFonts = await this.host.listAvailableFontsAsync();
    } catch {
      this.availableFonts = [];
    }
    await this.loadFontSafely(this.defaultFont);
  }

  private fontKey(font: FontName): string {
    return `${font.family}::${font.style}`;
  }

  private async loadFontSafely(font: FontName): Promise<boolean> {
    const key = this.fontKey(font);
    if (this.loadedFonts.has(key)) {
      return true;
    }
    try {
      await this.host.loadFontAsync(font);
      this.loadedFonts.add(key);
      return true;
    } catch {
      return false;
    }
  }

  resolveFont(
    fontFamily: string,
    fontFallbacks: string[] | undefined,
    fontWeight: number,
    fontStyle: string,
  ): FontName | null {
    const candidates: string[] = [
      cleanFamilyName(fontFamily),
      ...(fontFallbacks?.map(cleanFamilyName) ?? []),
    ];

    const isItalic = fontStyle === "italic" || fontStyle === "oblique";
    const preferredStyles = weightToStyleNames(fontWeight, isItalic);
    const available = this.availableFonts ?? [];

    for (const familyCandidate of candidates) {
      if (!familyCandidate) continue;

      const familyFonts = available.filter(
        (f) => f.fontName.family.toLowerCase() === familyCandidate.toLowerCase(),
      );

      if (familyFonts.length === 0) {
        continue;
      }

      let matchedFontName: FontName | null = null;
      for (const styleCandidate of preferredStyles) {
        const found = familyFonts.find(
          (f) => f.fontName.style.toLowerCase() === styleCandidate.toLowerCase(),
        );
        if (found) {
          matchedFontName = found.fontName;
          break;
        }
      }

      if (!matchedFontName && familyFonts.length > 0) {
        matchedFontName = familyFonts[0]!.fontName;
      }

      if (matchedFontName) {
        return matchedFontName;
      }
    }

    return null;
  }

  async resolveAndLoadFont(
    textStyle: TextStyle,
    warnings: WarningCollector,
    nodeId: string,
  ): Promise<FontName> {
    const matched = this.resolveFont(
      textStyle.fontFamily,
      textStyle.fontFallbacks,
      textStyle.fontWeight,
      textStyle.fontStyle,
    );

    if (matched) {
      const loaded = await this.loadFontSafely(matched);
      if (loaded) {
        return matched;
      }
    }

    warnings.warn(
      "FONT_FALLBACK",
      `Font family '${textStyle.fontFamily}' unavailable; fell back to '${this.defaultFont.family} ${this.defaultFont.style}'`,
      nodeId,
    );
    await this.loadFontSafely(this.defaultFont);
    return this.defaultFont;
  }

  async resolveAndLoadTextAndRunFonts(
    nodeStyle: TextStyle,
    runs: TextRun[] | undefined,
    warnings: WarningCollector,
    nodeId: string,
  ): Promise<ResolvedTextFonts> {
    let baseFont = this.resolveFont(
      nodeStyle.fontFamily,
      nodeStyle.fontFallbacks,
      nodeStyle.fontWeight,
      nodeStyle.fontStyle,
    );

    if (!baseFont) {
      warnings.warn(
        "FONT_FALLBACK",
        `Font family '${nodeStyle.fontFamily}' unavailable; fell back to '${this.defaultFont.family} ${this.defaultFont.style}'`,
        nodeId,
      );
      baseFont = this.defaultFont;
    }

    const runFonts: FontName[] = [];
    const warnedRunFamilies = new Set<string>();

    if (runs && runs.length > 0) {
      for (const run of runs) {
        const reqFamily = run.style.fontFamily ?? nodeStyle.fontFamily;
        const reqFallbacks = run.style.fontFallbacks ?? nodeStyle.fontFallbacks;
        const reqWeight = run.style.fontWeight ?? nodeStyle.fontWeight;
        const reqStyle = run.style.fontStyle ?? nodeStyle.fontStyle;

        let matched = this.resolveFont(reqFamily, reqFallbacks, reqWeight, reqStyle);
        if (!matched) {
          const warnKey = reqFamily.toLowerCase();
          if (!warnedRunFamilies.has(warnKey)) {
            warnedRunFamilies.add(warnKey);
            warnings.warn(
              "FONT_FALLBACK",
              `Font family '${reqFamily}' for range [${run.start}, ${run.end}) on node '${nodeId}' unavailable; fell back to '${this.defaultFont.family} ${this.defaultFont.style}'`,
              nodeId,
              `${run.start}-${run.end}`,
            );
          }
          matched = this.defaultFont;
        }
        runFonts.push(matched);
      }
    }

    const uniqueFonts = new Map<string, FontName>();
    uniqueFonts.set(this.fontKey(baseFont), baseFont);
    uniqueFonts.set(this.fontKey(this.defaultFont), this.defaultFont);
    for (const rf of runFonts) {
      uniqueFonts.set(this.fontKey(rf), rf);
    }

    for (const [key, font] of uniqueFonts) {
      const loaded = await this.loadFontSafely(font);
      if (!loaded && key !== this.fontKey(this.defaultFont)) {
        if (this.fontKey(baseFont) === key) {
          baseFont = this.defaultFont;
        }
        for (let i = 0; i < runFonts.length; i++) {
          if (this.fontKey(runFonts[i]!) === key) {
            runFonts[i] = this.defaultFont;
          }
        }
      }
    }

    return { baseFont, runFonts };
  }
}
