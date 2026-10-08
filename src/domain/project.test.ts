import { afterEach, describe, expect, it, vi } from "vitest";
import { compileStyle, generateLines } from "./engines";
import {
  exampleProject,
  lyricsText,
  readProjects,
  STORAGE_KEY,
  validateProject,
} from "./project";

afterEach(() => vi.unstubAllGlobals());

describe("portable schema", () => {
  it("round-trips authored choices, locks, style and deterministic derivations", () => {
    const project = exampleProject();
    project.structure[0].lines[0].authored = true;
    project.structure[0].lines[1].locked = true;
    const loaded = validateProject(JSON.parse(JSON.stringify(project)));
    expect(loaded).toEqual(project);
    expect(compileStyle(loaded.style, loaded.seed)).toBe(
      compileStyle(project.style, project.seed),
    );
    expect(generateLines(loaded, loaded.structure[0], loaded.seed)).toEqual(
      generateLines(project, project.structure[0], project.seed),
    );
  });
  it.each([
    null,
    "bad",
    {},
    { app: "LyricLab", schemaVersion: 2 },
    { app: "Other", schemaVersion: 1 },
  ])("rejects invalid required identity %j", (input) =>
    expect(() => validateProject(input)).toThrow(),
  );
  it("repairs optional data while preserving valid lyrics and locks", () => {
    const project = exampleProject();
    const input = JSON.parse(JSON.stringify(project));
    input.seed = "not a seed";
    input.style.bpm = 900;
    input.style.genres.push({ id: "unknown-genre", weight: 90 });
    input.style.voice.texture = ["Warm", 3, null];
    input.language.perspective = "invalid";
    input.language.dialectStrength = 20;
    input.structure[0].intensity = -50;
    input.structure[0].lines[0].locked = true;
    input.structure[0].lines[0].authored = true;
    input.settings = null;
    const result = validateProject(input);
    expect(result.seed).toBe(2408);
    expect(result.style.bpm).toBe(240);
    expect(result.style.genres.some((g) => g.id === "unknown-genre")).toBe(
      false,
    );
    expect(result.style.voice.texture).toEqual(["Warm"]);
    expect(result.language.perspective).toBe("first");
    expect(result.language.dialectStrength).toBe(5);
    expect(result.structure[0].intensity).toBe(0);
    expect(result.structure[0].lines[0]).toEqual(input.structure[0].lines[0]);
    expect(result.settings.ignoredWarnings).toEqual([]);
  });
  it.each([
    [-2, 8],
    [14, 7],
    [8, NaN],
  ])("repairs invalid syllable ranges %j", (min, max) => {
    const project = exampleProject();
    project.structure[0].syllableRange = [min, max];
    expect(validateProject(project).structure[0].syllableRange).toEqual([
      8, 12,
    ]);
  });
  it("rejects malformed sections and repairs duplicate section IDs", () => {
    const project = exampleProject();
    expect(() => validateProject({ ...project, structure: [null] })).toThrow(
      "Section 1 is invalid",
    );
    project.structure[1].id = project.structure[0].id;
    const loaded = validateProject(project);
    expect(new Set(loaded.structure.map((s) => s.id)).size).toBe(
      loaded.structure.length,
    );
  });
  it("exports lyrics with optional purpose and cadence metadata", () => {
    const project = exampleProject();
    expect(lyricsText(project)).toContain(project.structure[0].lines[0].text);
    expect(lyricsText(project, true)).toContain(project.structure[0].purpose);
    expect(lyricsText(project, true)).toContain("Melodic · ABAB");
  });
});

describe("local storage recovery", () => {
  it("retains valid projects when another saved project is corrupt", () => {
    const project = exampleProject();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key) =>
        key === STORAGE_KEY ? JSON.stringify([null, project]) : null,
      ),
    });
    const result = readProjects();
    expect(result.projects).toEqual([project]);
    expect(result.error).toContain("Valid projects have been preserved");
  });
  it("provides an example and a useful error when storage cannot be read", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{broken" });
    const result = readProjects();
    expect(result.projects).toHaveLength(1);
    expect(result.error).toContain("Saved data could not be read");
  });
});
