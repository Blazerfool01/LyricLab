export type WeightedSelection = { id: string; weight: number };
export type StyleSpec = {
  genres: WeightedSelection[];
  moods: WeightedSelection[];
  bpm: number;
  rhythm: string;
  voice: {
    type: string;
    register: string;
    texture: string[];
    delivery: string[];
  };
  bass: string[];
  drums: string[];
  instrumentation: string[];
  production: string[];
  mix: string[];
};
export type LyricLine = {
  id: string;
  text: string;
  locked: boolean;
  authored: boolean;
};
export type SectionType =
  "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "custom";
export type SongSection = {
  id: string;
  type: SectionType;
  name: string;
  purpose: string;
  intensity: number;
  rhymeScheme: string;
  syllableRange: [number, number];
  delivery: string;
  locked: boolean;
  lines: LyricLine[];
};
export type LanguageProfile = {
  theme: string;
  secondaryTheme: string;
  perspective: "first" | "second" | "third";
  register: string;
  motif: string;
  preferred: string;
  avoided: string;
  dialect: string;
  dialectStrength: number;
};
export type Project = {
  schemaVersion: 1;
  app: "LyricLab";
  id: string;
  title: string;
  concept: string;
  seed: number;
  style: StyleSpec;
  language: LanguageProfile;
  structure: SongSection[];
  settings: { ignoredWarnings: string[] };
  updatedAt: string;
  /** Ephemeral foundation/editor bridge. Never serialize the editor view. */
  engineState?: import('./foundation/adapters').EditorEngineState;
};
export type PromptFormat = "Compact" | "Detailed" | "Annotated";
