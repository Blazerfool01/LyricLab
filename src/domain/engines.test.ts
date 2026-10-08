import { describe, expect, it } from "vitest";
import {
  analyzeSection,
  compileStyle,
  containsPhrase,
  dialectPreview,
  generateLines,
  normalizeWeights,
  resolveStyle,
  rhymeKey,
  seededRandom,
  syllables,
} from "./engines";
import { cadenceRanges, genres, palette } from "./data";
import { exampleProject } from "./project";

function fixture() {
  const project = exampleProject();
  project.structure.forEach((section) =>
    section.lines.forEach((line, index) => {
      line.id = `${section.id}-${index}`;
    }),
  );
  return project;
}

describe("declarative packs", () => {
  it("uses unique genre IDs, populated semantic banks and ordered cadence ranges", () => {
    expect(new Set(genres.map((g) => g.id)).size).toBe(genres.length);
    genres.forEach((g) => {
      expect(g.descriptors.length).toBeGreaterThan(1);
      expect(g.bpm[0]).toBeLessThan(g.bpm[1]);
    });
    Object.values(palette).forEach((bank) => {
      expect(bank.lines.length).toBeGreaterThanOrEqual(4);
      expect(bank.objects.length).toBeGreaterThan(0);
    });
    Object.values(cadenceRanges).forEach(([min, max]) =>
      expect(min).toBeLessThanOrEqual(max),
    );
  });
});

describe("style engine", () => {
  it("repeats the same seeded sequence and keeps values in [0, 1)", () => {
    const a = seededRandom(12345),
      b = seededRandom(12345);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
  it("normalizes weights and orders ties by stable ID", () => {
    expect(
      normalizeWeights([
        { id: "b", weight: 2 },
        { id: "a", weight: 2 },
        { id: "bad", weight: NaN },
        { id: "zero", weight: 0 },
      ]),
    ).toEqual([
      { id: "a", weight: 50 },
      { id: "b", weight: 50 },
    ]);
    expect(normalizeWeights([])).toEqual([]);
  });
  it("compiles every format deterministically without mutating choices", () => {
    const project = fixture(),
      before = JSON.stringify(project.style);
    for (const format of ["Compact", "Detailed", "Annotated"] as const)
      expect(compileStyle(project.style, 2408, format)).toBe(
        compileStyle(project.style, 2408, format),
      );
    expect(JSON.stringify(project.style)).toBe(before);
    expect(compileStyle(project.style, 2408, "Annotated")).toContain(
      "Seed: 2408",
    );
  });
  it("derives secondary musical traits and changes foundation when weights change", () => {
    const style = fixture().style;
    const resolved = resolveStyle(style, 2408);
    expect(resolved.descriptors[0]).toBe("intimate acoustic storytelling");
    expect(
      resolved.descriptors.some((d) =>
        genres.find((g) => g.id === "dream-pop")!.descriptors.includes(d),
      ),
    ).toBe(true);
    style.genres = [
      { id: "dream-pop", weight: 70 },
      { id: "indie-folk", weight: 30 },
    ];
    expect(resolveStyle(style, 2408).descriptors[0]).toBe(
      "hazy dream-pop atmosphere",
    );
  });
  it("surfaces conflicting production and moods, and flags unusual tempo", () => {
    const style = fixture().style;
    style.production = ["Raw", "Polished", "Minimal", "Layered"];
    style.moods = [
      { id: "Hopeful", weight: 1 },
      { id: "Dark", weight: 1 },
    ];
    style.bpm = 180;
    const warnings = resolveStyle(style, 1).warnings.join(" ");
    expect(warnings).toContain("Raw and polished");
    expect(warnings).toContain("Minimal and layered");
    expect(warnings).toContain("Hopeful and dark");
    expect(warnings).toContain("outside the usual");
  });
  it("deduplicates descriptors regardless of casing", () => {
    const style = fixture().style;
    style.production = ["Warm analog", "warm analog"];
    expect(compileStyle(style, 1).match(/warm analog/g)).toHaveLength(1);
  });
  it("normalizes supported genres after ignoring unknown IDs", () => {
    const style = fixture().style;
    style.genres = [
      { id: "missing", weight: 900 },
      { id: "indie-folk", weight: 70 },
      { id: "dream-pop", weight: 30 },
    ];
    expect(resolveStyle(style, 1).blend.map((g) => g.weight)).toEqual([70, 30]);
    expect(resolveStyle(style, 1).descriptors).toHaveLength(3);
  });
  it("handles empty genres and invalid tempo without crashing", () => {
    const style = fixture().style;
    style.genres = [];
    style.bpm = NaN;
    expect(resolveStyle(style, 0).warnings).toHaveLength(2);
    expect(compileStyle(style, 0)).toContain("Genre-neutral");
  });
});

describe("editor analysis", () => {
  it.each([
    ["", 0],
    ["Quiet people", 4],
    ["Every little poem", 6],
    ["Fire and light", 3],
    ["Poetry, rhythm, memories", 8],
    ["I walk the road", 4],
  ])("counts pronunciation fixture %s", (text, expected) =>
    expect(syllables(text)).toBe(expected),
  );
  it("recognizes known end rhymes despite capitalization and punctuation", () => {
    expect(rhymeKey("Carry the LIGHT!")).toBe(rhymeKey("Into the night."));
    expect(rhymeKey("We go")).toBe(rhymeKey("I grow"));
    expect(rhymeKey("")).toBe("");
  });
  it("reports actual ABAB rhymes and avoided phrases on manually authored lyrics", () => {
    const project = fixture(),
      section = project.structure[0];
    [
      "I carry all the morning light",
      "We find another way to go",
      "I hold the map against the night",
      "And let the broken wings grow",
    ].forEach((text, i) => {
      section.lines[i].text = text;
      section.lines[i].authored = true;
    });
    const result = analyzeSection(section, project.language);
    expect(result.scheme).toBe("ABAB");
    expect(result.warnings.some((w) => w.id.endsWith(":rhyme"))).toBe(false);
    expect(result.warnings.some((w) => w.text.includes("broken wings"))).toBe(
      true,
    );
  });
  it("matches avoided words and literal special characters without matching substrings", () => {
    expect(containsPhrase("A HEART OF GOLD shines", "heart of gold")).toBe(
      true,
    );
    expect(containsPhrase("Bright morning", "right")).toBe(false);
    expect(containsPhrase("A a+b road", "a+b")).toBe(true);
  });
  it("provides non-blocking meter and repetition diagnostics", () => {
    const project = fixture(),
      section = project.structure[0];
    section.delivery = "Short / clipped";
    section.lines.forEach(
      (l) =>
        (l.text = "Morning morning morning shines through the open window"),
    );
    const before = JSON.stringify(section);
    const result = analyzeSection(section, project.language);
    expect(result.warnings.some((w) => w.id.endsWith(":meter"))).toBe(true);
    expect(result.warnings.some((w) => w.id.endsWith(":repeat"))).toBe(true);
    expect(JSON.stringify(section)).toBe(before);
  });
});

describe("procedural lyrics", () => {
  it("is deterministic and preserves locked and authored lines by default", () => {
    const project = fixture(),
      section = project.structure[0];
    section.lines[0].locked = true;
    section.lines[1].authored = true;
    const before = JSON.stringify(section);
    const first = generateLines(project, section, 100);
    expect(first).toEqual(generateLines(project, section, 100));
    expect(first[0]).toBe(section.lines[0]);
    expect(first[1]).toBe(section.lines[1]);
    expect(first[2].text).not.toBe(section.lines[2].text);
    expect(JSON.stringify(section)).toBe(before);
    expect(generateLines(project, section, 100, true)[0]).toBe(
      section.lines[0],
    );
    expect(generateLines(project, section, 100, true)[1].text).not.toBe(
      section.lines[1].text,
    );
  });
  it("preserves an entire locked section and never replaces content when every candidate is avoided", () => {
    const project = fixture(),
      section = project.structure[0];
    section.locked = true;
    expect(generateLines(project, section, 1, true)).toEqual(section.lines);
    section.locked = false;
    project.language.avoided = "I, The, And, Now, But";
    expect(generateLines(project, section, 1)).toBe(section.lines);
  });
  it("filters banned phrases across seeds, including cadence suffixes", () => {
    const project = fixture(),
      section = project.structure[0];
    project.language.avoided = "quiet streets, open window, morning light";
    section.delivery = "Dense rhythmic";
    for (let seed = 0; seed < 20; seed++)
      generateLines(project, section, seed).forEach((line) => {
        project.language.avoided
          .split(", ")
          .forEach((phrase) =>
            expect(containsPhrase(line.text, phrase)).toBe(false),
          );
      });
  });
  it("changes semantic vocabulary with the chosen theme and respects perspective", () => {
    const project = fixture(),
      section = project.structure[0];
    const original = generateLines(project, section, 10);
    project.language.theme = "Letting go";
    project.language.perspective = "third";
    const changed = generateLines(project, section, 10);
    expect(changed).not.toEqual(original);
    expect(changed.some((line) => /They|their/.test(line.text))).toBe(true);
    changed.forEach((line) =>
      expect(/\bI\b|\bmy\b/.test(line.text)).toBe(false),
    );
  });
  it("adapts line length to clipped and dense deliveries", () => {
    const project = fixture(),
      section = project.structure[0];
    section.delivery = "Short / clipped";
    const clipped = generateLines(project, section, 1);
    section.delivery = "Dense rhythmic";
    const dense = generateLines(project, section, 1);
    clipped.forEach((line, i) =>
      expect(syllables(line.text)).toBeLessThan(syllables(dense[i].text)),
    );
  });
});

describe("dialect preview", () => {
  it("is optional and replaces whole words without modifying input", () => {
    const original = "The apartment elevator faces the sidewalk";
    expect(dialectPreview(original, "British English", 1)).toBe(original);
    expect(dialectPreview(original, "British English", 2)).toBe(
      "The flat lift faces the pavement",
    );
    expect(dialectPreview("A flatland sidewalk", "American English", 2)).toBe(
      "A flatland sidewalk",
    );
  });
});

describe("hook archetypes", () => {
  it("produces three distinct, reproducible hook shapes from one blueprint", () => {
    const project = exampleProject();
    const section = project.structure[1];
    const archetypes = ["title-drop", "refrain", "statement"] as const;
    const candidates = archetypes.map((type) =>
      generateLines(project, section, project.seed, false, type)
        .map((l) => l.text)
        .join("\n"),
    );
    expect(new Set(candidates).size).toBe(3);
    archetypes.forEach((type, i) =>
      expect(
        generateLines(project, section, project.seed, false, type)
          .map((l) => l.text)
          .join("\n"),
      ).toBe(candidates[i]),
    );
  });
});
