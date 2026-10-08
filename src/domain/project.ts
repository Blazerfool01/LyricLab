import { emptyEngineState } from './foundation/adapters';
import { decodeProject, toEditorProject, toEnvelope } from './foundation/persistence';
import { fingerprint } from './foundation/randomness';
import type { Project, SongSection, SectionType } from "./types";
import { genres, sectionPurposes } from "./data";
export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function makeSection(type: SectionType, index = 1): SongSection {
  return {
    id: uid(),
    type,
    name:
      type === "verse"
        ? `Verse ${index}`
        : type === "pre-chorus"
          ? "Pre-chorus"
          : type[0].toUpperCase() + type.slice(1),
    purpose: sectionPurposes[type],
    intensity: type === "chorus" ? 75 : type === "bridge" ? 55 : 40,
    rhymeScheme: "ABAB",
    syllableRange: [8, 12],
    delivery: "Melodic",
    locked: false,
    lines: Array.from(
      { length: type === "intro" || type === "outro" ? 2 : 4 },
      () => ({ id: uid(), text: "", locked: false, authored: false }),
    ),
  };
}
export function exampleProject(): Project {
  const verse = makeSection("verse");
  verse.id = "verse-1";
  verse.lines.forEach(
    (l, i) =>
      (l.text = [
        "The morning spills across the window frame",
        "Another quiet town I used to know",
        "I trace the roads that never had a name",
        "And wonder where the restless rivers go",
      ][i]),
  );
  const chorus = makeSection("chorus");
  chorus.id = "chorus-1";
  chorus.lines.forEach(
    (l, i) =>
      (l.text = [
        "Take me where the light goes",
        "Where the wild and gentle grow",
        "I am more than what I leave behind",
        "Take me where the light goes",
      ][i]),
  );
  chorus.rhymeScheme = "AABA";
  const verse2 = makeSection("verse", 2);
  verse2.id = "verse-2";
  verse2.purpose = "Deepen the story";
  verse2.intensity = 55;
  verse2.lines.forEach(
    (l, i) =>
      (l.text = [
        "I keep a little sunlight in my coat",
        "A folded map of places yet to be",
        "The things I could not say become a note",
        "I let the open road remember me",
      ][i]),
  );
  const bridge = makeSection("bridge");
  bridge.id = "bridge-1";
  bridge.lines.forEach(
    (l, i) =>
      (l.text = [
        "Maybe home is something that we make",
        "A little room to listen and to stay",
        "I find it in the chances that I take",
        "And carry it into another day",
      ][i]),
  );
  return {
    schemaVersion: 1,
    app: "LyricLab",
    id: uid(),
    title: "Where the light goes",
    concept: "Finding your way back to yourself, one small step at a time.",
    seed: 2408,
    style: {
      genres: [
        { id: "indie-folk", weight: 70 },
        { id: "dream-pop", weight: 30 },
      ],
      moods: [
        { id: "Reflective", weight: 60 },
        { id: "Hopeful", weight: 40 },
      ],
      bpm: 92,
      rhythm: "Steady 4/4",
      voice: {
        type: "Lead",
        register: "Mid-range",
        texture: ["Airy", "Warm"],
        delivery: ["Melodic"],
      },
      bass: ["Warm bass"],
      drums: ["Soft live drums"],
      instrumentation: ["Acoustic guitar", "Ambient pads"],
      production: ["Organic", "Spacious"],
      mix: ["Vocal-forward"],
    },
    language: {
      theme: "Finding your way",
      secondaryTheme: "Home & belonging",
      perspective: "first",
      register: "Poetic",
      motif: "morning light",
      preferred: "sunlight, rivers, open roads",
      avoided: "broken wings, chasing dreams",
      dialect: "Standard",
      dialectStrength: 1,
    },
    structure: [verse, chorus, verse2, bridge],
    settings: { ignoredWarnings: [] },
    updatedAt: new Date().toISOString(),
  };
}
export function validateProject(input: unknown): Project {
  if (!input || typeof input !== "object")
    throw new Error("This file does not contain a project.");
  const x = input as Record<string, unknown>;
  if (x.schemaVersion !== 1 || x.app !== "LyricLab")
    throw new Error("Please choose a LyricLab project with schema version 1.");
  if (
    typeof x.title !== "string" ||
    !Array.isArray(x.structure) ||
    !x.style ||
    typeof x.style !== "object"
  )
    throw new Error("The project is missing its title, style, or sections.");
  const fallback = exampleProject();
  const raw = x as unknown as Project;
  const str = (v: unknown, d: string) =>
    typeof v === "string" ? v.slice(0, 10000) : d;
  const strings = (v: unknown, d: string[]) =>
    Array.isArray(v)
      ? v.filter((n): n is string => typeof n === "string").slice(0, 40)
      : d;
  const weighted = (v: unknown, d: Project["style"]["genres"]) =>
    Array.isArray(v)
      ? v
          .filter(
            (g) =>
              g &&
              typeof g.id === "string" &&
              Number.isFinite(g.weight) &&
              g.weight > 0,
          )
          .slice(0, 20)
      : d;
  const style = raw.style;
  const safeGenres = weighted(style.genres, fallback.style.genres).filter((g) =>
    genres.some((x) => x.id === g.id),
  );
  const structure = raw.structure.slice(0, 50).map((s, i) => {
    if (!s || typeof s !== "object")
      throw new Error(`Section ${i + 1} is invalid.`);
    const types: SectionType[] = [
      "intro",
      "verse",
      "pre-chorus",
      "chorus",
      "bridge",
      "outro",
      "custom",
    ];
    const base = makeSection(types.includes(s.type) ? s.type : "custom");
    return {
      ...base,
      id: str(s.id, base.id),
      name: str(s.name, base.name),
      purpose: str(s.purpose, base.purpose),
      intensity: Number.isFinite(s.intensity)
        ? Math.min(100, Math.max(0, s.intensity))
        : 40,
      rhymeScheme: str(s.rhymeScheme, "ABAB"),
      delivery: str(s.delivery, "Melodic"),
      locked: s.locked === true,
      syllableRange:
        Array.isArray(s.syllableRange) &&
        s.syllableRange.length === 2 &&
        s.syllableRange.every((n) => Number.isFinite(n) && n > 0) &&
        s.syllableRange[0] <= s.syllableRange[1]
          ? s.syllableRange
          : base.syllableRange,
      lines: Array.isArray(s.lines)
        ? s.lines
            .slice(0, 100)
            .filter((l) => l && typeof l === "object")
            .map((l) => ({
              id: str(l.id, uid()),
              text: str(l.text, ""),
              locked: l.locked === true,
              authored: l.authored === true,
            }))
        : base.lines,
    };
  });
  if (new Set(structure.map((s) => s.id)).size !== structure.length)
    structure.forEach((s) => (s.id = uid()));
  const language = raw.language || fallback.language;
  return {
    ...fallback,
    id: str(raw.id, uid()),
    title: raw.title.slice(0, 200),
    concept: str(raw.concept, ""),
    seed: Number.isSafeInteger(raw.seed) ? raw.seed : 2408,
    style: {
      genres: safeGenres,
      moods: weighted(style.moods, fallback.style.moods),
      bpm: Number.isFinite(style.bpm)
        ? Math.min(240, Math.max(40, style.bpm))
        : 92,
      rhythm: str(style.rhythm, "Steady 4/4"),
      voice: {
        type: str(style.voice?.type, "Lead"),
        register: str(style.voice?.register, "Mid-range"),
        texture: strings(style.voice?.texture, []),
        delivery: strings(style.voice?.delivery, ["Melodic"]),
      },
      bass: strings(style.bass, []),
      drums: strings(style.drums, []),
      instrumentation: strings(style.instrumentation, []),
      production: strings(style.production, []),
      mix: strings(style.mix, []),
    },
    language: {
      theme: str(language.theme, fallback.language.theme),
      secondaryTheme: str(language.secondaryTheme, ""),
      perspective: ["first", "second", "third"].includes(language.perspective)
        ? language.perspective
        : "first",
      register: str(language.register, "Poetic"),
      motif: str(language.motif, ""),
      preferred: str(language.preferred, ""),
      avoided: str(language.avoided, ""),
      dialect: str(language.dialect, "Standard"),
      dialectStrength: Number.isFinite(language.dialectStrength)
        ? Math.min(5, Math.max(1, language.dialectStrength))
        : 1,
    },
    structure,
    settings: { ignoredWarnings: strings(raw.settings?.ignoredWarnings, []) },
    updatedAt: str(raw.updatedAt, fallback.updatedAt),
  };
}
export const STORAGE_KEY = "lyriclab.projects.v1";
export function readProjects(): { projects: Project[]; error: string } {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return { projects: [exampleProject()], error: "" };
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) throw new Error();
    const valid: Project[] = [];
    let skipped = 0;
    for (const item of parsed) {
      try {
        valid.push(validateProject(item));
      } catch {
        skipped++;
      }
    }
    return {
      projects: valid.length ? valid : [exampleProject()],
      error: skipped
        ? "Some saved projects could not be read. Valid projects have been preserved."
        : "",
    };
  } catch {
    return {
      projects: [exampleProject()],
      error:
        "Saved data could not be read. Export your work before replacing the stored data.",
    };
  }
}
export function lyricsText(project: Project, annotated = false) {
  return `${project.title}\n\n${project.structure.map((s) => `[${s.name}]${annotated ? ` — ${s.purpose}\n[${s.delivery} · ${s.rhymeScheme} · intensity ${s.intensity}%]` : ""}\n${s.lines.map((l) => l.text).join("\n")}`).join("\n\n")}`;
}
export function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Active studio persistence; legacy validators/readers above retain their recorded schema-1 contract. */
export function freshStudioProject(project: Project): Project {
  const state = emptyEngineState();
  return toEditorProject(toEnvelope({ ...project, engineState: { ...state, lines: Object.fromEntries(project.structure.flatMap(section => section.lines.map(line => [line.id, { origin: line.authored ? 'authored' as const : 'generated' as const, textFingerprint: fingerprint(line.text), lockedRanges: [], annotations: [] }]))) } }));
}
export function serializeStudioLibrary(projects: readonly Project[]): string {
  return JSON.stringify(projects.map(project => toEnvelope(project)));
}
export function readStudioProjects(): { projects: Project[]; error: string } {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return { projects: [freshStudioProject(exampleProject())], error: '' };
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) throw new Error('Invalid library');
    const projects: Project[] = [], messages: string[] = [], ids = new Set<string>();
    for (const item of parsed) {
      const decoded = decodeProject(item);
      if (decoded.status !== 'resolved') { messages.push(...decoded.diagnostics.map(issue => issue.message)); continue; }
      if (ids.has(decoded.value.id)) { messages.push('Duplicate library project identity was preserved in the original backup.'); continue; }
      ids.add(decoded.value.id); projects.push(toEditorProject(decoded.value));
      messages.push(...decoded.diagnostics.filter(issue => issue.severity === 'warning').map(issue => issue.message));
    }
    return { projects: projects.length ? projects : [freshStudioProject(exampleProject())], error: messages.length ? `Saved data needs recovery. Valid projects are available; the original library will not be overwritten until you export it. ${messages[0]}` : '' };
  } catch {
    return { projects: [freshStudioProject(exampleProject())], error: 'Saved data could not be read. Export the original library before enabling saving.' };
  }
}
