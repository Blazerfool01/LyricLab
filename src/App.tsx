import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  FileJson,
  FileText,
  FolderOpen,
  Globe2,
  GripVertical,
  Hash,
  Leaf,
  Lightbulb,
  LockKeyhole,
  Menu,
  Mic2,
  MoreHorizontal,
  Music2,
  Plus,
  Redo2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  UnlockKeyhole,
  WandSparkles,
  X,
} from "lucide-react";
import {
  cadenceRanges,
  deliveries,
  genres,
  instruments,
  moods,
  palette,
  productions,
  textures,
  themes,
} from "./domain/data";
import {
  download,
  exampleProject,
  lyricsText,
  makeSection,
  readStudioProjects,
  serializeStudioLibrary,
  freshStudioProject,
  STORAGE_KEY,
  uid,
} from "./domain/project";
import {
  regenerateProject,
  analyzeStudioSection,
  compileStudioStyle,
  previewHooks,
  acceptHook,
  previewStudioDialect,
  applyStudioDialect,
  duplicateStudioSection,
  resolveStudioStyle,
  setStudioRole,
} from "./domain/foundation/studio";
import {
  toEnvelope,
  serializeProject,
  decodeProject,
  toEditorProject,
  projectSongSpec,
  replayRecipe,
} from "./domain/foundation/persistence";
import { emptyEngineState } from "./domain/foundation/adapters";
import { legacyProject } from "./domain/foundation/legacy-export";
import type { SectionRole } from "./domain/foundation/contracts";
import type {
  Project,
  PromptFormat,
  SectionType,
  SongSection,
  StyleSpec,
} from "./domain/types";

type Tab = "Song canvas" | "Style prompt" | "Hook lab";
type Panel = "Style" | "Voice" | "Theme" | "Structure" | "Language";
type Modal =
  | "export"
  | "projects"
  | "guide"
  | "seed"
  | "dialect"
  | "replay"
  | null;
const panelIcons = {
  Style: Music2,
  Voice: Mic2,
  Theme: Leaf,
  Structure: AudioLines,
  Language: Globe2,
};
const initial = readStudioProjects();
const initialActive = (() => {
  try {
    return localStorage.getItem("lyriclab.active") || initial.projects[0].id;
  } catch {
    return initial.projects[0].id;
  }
})();
function App() {
  const [projects, setProjects] = useState<Project[]>(initial.projects);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const [project, setProject] = useState<Project>(
    initial.projects.find((p) => p.id === initialActive) || initial.projects[0],
  );
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("Song canvas");
  const [panel, setPanel] = useState<Panel>("Style");
  const [selected, setSelected] = useState(project.structure[0]?.id || "");
  const [lineFocus, setLineFocus] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved locally");
  const [storageError, setStorageError] = useState(initial.error);
  const [format, setFormat] = useState<PromptFormat>("Compact");
  const [genrePicker, setGenrePicker] = useState(false);
  const [instrumentPicker, setInstrumentPicker] = useState(false);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [sectionMenu, setSectionMenu] = useState("");
  const [addMenu, setAddMenu] = useState(false);
  const [mobileBlueprint, setMobileBlueprint] = useState(false);
  const [exportType, setExportType] = useState("project");
  const [hookSeed, setHookSeed] = useState(
    project.engineState?.variations["hook-lab"] || 0,
  );
  const [replaceAuthored, setReplaceAuthored] = useState(false);
  const [replayText, setReplayText] = useState("");
  const [dialectApply, setDialectApply] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const current =
    project.structure.find((s) => s.id === selected) || project.structure[0];
  const analysis = useMemo(
    () => (current ? analyzeStudioSection(project, current.id) : null),
    [current, project],
  );
  const styleResult = useMemo(
    () => resolveStudioStyle(project),
    [project.style, project.seed],
  );
  const stylePrompt = useMemo(
    () => compileStudioStyle(project, format),
    [project, format],
  );
  const totalLines = project.structure.reduce((n, s) => n + s.lines.length, 0);
  const sectionWarnings =
    analysis?.warnings.filter(
      (w) => !project.settings.ignoredWarnings.includes(w.id),
    ) || [];
  const flash = (message: string) => setNotice(message);
  function change(next: Project | ((p: Project) => Project)) {
    const value = typeof next === "function" ? next(project) : next;
    setPast((h) => [...h.slice(-49), project]);
    setFuture([]);
    setProject({ ...value, updatedAt: new Date().toISOString() });
    setSaveStatus("Saving…");
  }
  function updateStyle(next: Partial<StyleSpec>) {
    change((p) => ({ ...p, style: { ...p.style, ...next } }));
  }
  function updateLanguage(next: Partial<Project["language"]>) {
    change((p) => ({ ...p, language: { ...p.language, ...next } }));
  }
  function updateSection(id: string, next: Partial<SongSection>) {
    change((p) => ({
      ...p,
      structure: p.structure.map((s) => (s.id === id ? { ...s, ...next } : s)),
    }));
  }
  function undo() {
    if (!past.length) return;
    setFuture((f) => [project, ...f]);
    setProject(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, project]);
    setProject(future[0]);
    setFuture((f) => f.slice(1));
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      const latest = projectsRef.current;
      const list = latest.some((p) => p.id === project.id)
        ? latest.map((p) => (p.id === project.id ? project : p))
        : [...latest, project];
      setProjects(list);
      if (storageError) return;
      try {
        localStorage.setItem(STORAGE_KEY, serializeStudioLibrary(list));
        localStorage.setItem("lyriclab.active", project.id);
        setSaveStatus("Saved locally");
      } catch {
        setSaveStatus("Save unavailable");
        setStorageError(
          "Browser storage is unavailable or full. Export your project to keep your work.",
        );
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [project, storageError]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener("keydown", trap);
    return () => {
      dialog?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSectionMenu("");
        setAddMenu(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        downloadProject();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function toggleList(key: "instrumentation" | "production", value: string) {
    const list = project.style[key];
    updateStyle({
      [key]: list.includes(value)
        ? list.filter((x) => x !== value)
        : [...list, value],
    });
  }
  function regenerate(section: SongSection) {
    try {
      const result = regenerateProject(project, section.id);
      if (result.status === "applied" && "project" in result) {
        change(result.project);
        flash(
          `${section.name} refreshed. Locked and authored lines preserved.`,
        );
      } else
        flash(
          result.diagnostics.map((issue) => issue.message).join(" ") ||
            "No eligible draft was found.",
        );
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Unable to generate this section.",
      );
    }
  }
  function addSection(type: SectionType) {
    const s = makeSection(
      type,
      project.structure.filter((x) => x.type === type).length + 1,
    );
    change((p) => ({ ...p, structure: [...p.structure, s] }));
    setSelected(s.id);
    setAddMenu(false);
    setPanel("Structure");
    setTab("Song canvas");
  }
  function moveSection(id: string, delta: number) {
    const items = [...project.structure];
    const i = items.findIndex((s) => s.id === id);
    if (i + delta < 0 || i + delta >= items.length) return;
    [items[i], items[i + delta]] = [items[i + delta], items[i]];
    change((p) => ({ ...p, structure: items }));
  }
  function duplicateSection(section: SongSection) {
    try {
      const id = uid();
      change(
        duplicateStudioSection(
          project,
          section.id,
          id,
          section.lines.map(() => uid()),
        ),
      );
      setSelected(id);
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Unable to duplicate this section.",
      );
    }
  }
  function updateRole(role: SectionRole) {
    if (!current) return;
    try {
      change(setStudioRole(project, current.id, role));
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Unable to update this role.",
      );
    }
  }
  function downloadProject() {
    try {
      download(
        `${project.title || "Untitled"}.lyriclab.json`,
        serializeProject(toEnvelope(project)),
        "application/json",
      );
      flash("Project exported. Your blueprint and lyrics are included.");
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Unable to export this project.",
      );
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash("Copied to clipboard.");
    } catch {
      flash("Clipboard unavailable. Use the text export instead.");
    }
  }
  function openProject(p: Project) {
    const list = projects.some((x) => x.id === project.id)
      ? projects.map((x) => (x.id === project.id ? project : x))
      : [...projects, project];
    setProjects(list);
    setProject(p);
    setHookSeed(p.engineState?.variations["hook-lab"] || 0);
    setPast([]);
    setFuture([]);
    setSelected(p.structure[0]?.id || "");
    setModal(null);
  }
  function newProject() {
    const p = exampleProject();
    p.title = "Untitled song";
    p.concept = "";
    p.structure = [makeSection("verse"), makeSection("chorus")];
    openProject(freshStudioProject(p));
    flash("A fresh page. Make it yours.");
  }
  async function importProject(file: File) {
    try {
      const decoded = decodeProject(JSON.parse(await file.text()));
      if (decoded.status !== "resolved")
        throw new Error(
          decoded.diagnostics.map((issue) => issue.message).join(" "),
        );
      const p = toEditorProject(decoded.value);
      p.id = uid();
      openProject(p);
      flash(
        decoded.diagnostics.map((issue) => issue.message).join(" ") ||
          "Project imported and validated.",
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "Unable to import this file.");
    }
  }
  const hooks = useMemo(
    () => (tab === "Hook lab" ? previewHooks(project, hookSeed) : []),
    [project, hookSeed, tab],
  );
  const dialectDraft = useMemo(
    () =>
      current
        ? previewStudioDialect(project, current.id, replaceAuthored)
        : null,
    [project, current, replaceAuthored],
  );
  useEffect(() => {
    setDialectApply(false);
  }, [dialectDraft]);
  function nextHooks() {
    const variation = hookSeed + 1;
    setHookSeed(variation);
    change({
      ...project,
      engineState: {
        ...(project.engineState || emptyEngineState()),
        variations: {
          ...project.engineState?.variations,
          "hook-lab": variation,
        },
      },
    });
  }
  function inspectReplay() {
    const recipe = [...(project.engineState?.recipes || [])]
      .reverse()
      .find((record) => record.inputs.sectionId === current?.id);
    if (!recipe) {
      flash("This section has no recorded original draft.");
      return;
    }
    const result = replayRecipe(recipe);
    setReplayText(
      result.status === "resolved"
        ? result.value.lines.map((line) => line.text).join("\n")
        : result.diagnostics.map((issue) => issue.message).join("\n"),
    );
    setModal("replay");
  }
  function exportSelected() {
    try {
      const safeName = project.title || "Untitled";
      if (
        exportType === "project" ||
        exportType === "spec" ||
        exportType === "legacy"
      )
        download(
          `${safeName}.${exportType === "project" ? "lyriclab" : exportType === "legacy" ? "legacy-v1" : "SongSpec"}.json`,
          exportType === "project"
            ? serializeProject(toEnvelope(project))
            : JSON.stringify(
                exportType === "legacy"
                  ? legacyProject(project)
                  : projectSongSpec(toEnvelope(project)),
                null,
                2,
              ),
          "application/json",
        );
      else if (exportType === "lyrics" || exportType === "annotated")
        download(
          `${safeName}${exportType === "annotated" ? "-annotated" : ""}.txt`,
          lyricsText(project, exportType === "annotated"),
        );
      else
        download(
          `${safeName}-style.txt`,
          compileStudioStyle(
            project,
            exportType === "detailed" ? "Detailed" : "Compact",
          ),
        );
      flash("Export downloaded. Ready to take with you.");
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Unable to export this project.",
      );
    }
  }
  const blueprintContent = (kind: Panel) => {
    if (kind === "Style")
      return (
        <div className="blueprint-fields">
          <div className="field-label">
            GENRE BLEND <span>100%</span>
          </div>
          <div className="genre-list">
            {project.style.genres.map((g, i) => (
              <div className="genre-card" key={g.id}>
                <div className="genre-title">
                  <span className={`genre-dot dot-${i}`} />
                  <span>{genres.find((x) => x.id === g.id)?.name || g.id}</span>
                  <button
                    className="tiny-button"
                    title="Remove genre"
                    aria-label="Remove genre"
                    onClick={() =>
                      {
                        const remaining = project.style.genres.filter(
                          (x) => x.id !== g.id,
                        );
                        const total = remaining.reduce(
                          (sum, genre) => sum + genre.weight,
                          0,
                        );
                        updateStyle({
                          genres: remaining.map((genre) => ({
                            ...genre,
                            weight: total
                              ? (genre.weight / total) * 100
                              : genre.weight,
                          })),
                        });
                      }
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="genre-slider">
                  <input
                    aria-label={`${g.id} blend weight`}
                    type="range"
                    min="1"
                    max={project.style.genres.length > 1 ? 99 : 100}
                    value={g.weight}
                    onChange={(e) => {
                      const weight = Number(e.target.value);
                      const rest = project.style.genres.filter(
                        (x) => x.id !== g.id,
                      );
                      const restTotal = rest.reduce((n, x) => n + x.weight, 0);
                      updateStyle({
                        genres: project.style.genres.map((x) =>
                          x.id === g.id
                            ? { ...x, weight: rest.length ? weight : 100 }
                            : {
                                ...x,
                                weight:
                                  ((100 - weight) * x.weight) /
                                  (restTotal || 1),
                              },
                        ),
                      });
                    }}
                  />
                  <span>
                    {Math.round(
                      styleResult.status === "resolved"
                        ? styleResult.value.genres.find((x) => x.id === g.id)
                            ?.weight || 0
                        : 0,
                    )}
                    <small>%</small>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="text-button add-genre"
            onClick={() => setGenrePicker(!genrePicker)}
          >
            <Plus size={13} /> Add a genre
          </button>
          {genrePicker && (
            <select
              autoFocus
              aria-label="Choose additional genre"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const existingTotal = project.style.genres.reduce(
                  (sum, genre) => sum + genre.weight,
                  0,
                );
                const hasExistingBlend = existingTotal > 0;
                updateStyle({
                  genres: [
                    ...project.style.genres.map((g) => ({
                      ...g,
                      weight: hasExistingBlend
                        ? (g.weight / existingTotal) * 80
                        : 0,
                    })),
                    { id: e.target.value, weight: hasExistingBlend ? 20 : 100 },
                  ],
                });
                setGenrePicker(false);
              }}
            >
              <option value="">Choose a genre…</option>
              {Array.from(new Set(genres.map((genre) => genre.family))).map((family) => {
                const options = genres.filter(
                  (genre) =>
                    genre.family === family &&
                    !project.style.genres.some((selected) => selected.id === genre.id),
                );
                return options.length ? (
                  <optgroup key={family} label={family}>
                    {options.map((genre) => (
                      <option key={genre.id} value={genre.id}>
                        {genre.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          )}
          <div className="field-label spaced">MOOD</div>
          <div className="chips">
            {moods.slice(0, 5).map((m) => (
              <button
                key={m}
                className={`chip ${project.style.moods.some((x) => x.id === m) ? "selected" : ""}`}
                onClick={() =>
                  updateStyle({
                    moods: project.style.moods.some((x) => x.id === m)
                      ? project.style.moods.filter((x) => x.id !== m)
                      : [...project.style.moods, { id: m, weight: 50 }],
                  })
                }
              >
                {project.style.moods.some((x) => x.id === m) && (
                  <Check size={11} />
                )}{" "}
                {m}
              </button>
            ))}
            <select
              className="chip-select"
              aria-label="More moods"
              value=""
              onChange={(e) => {
                if (
                  e.target.value &&
                  !project.style.moods.some((x) => x.id === e.target.value)
                )
                  updateStyle({
                    moods: [
                      ...project.style.moods,
                      { id: e.target.value, weight: 50 },
                    ],
                  });
              }}
            >
              <option value="">+ More</option>
              {moods.slice(5).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            {project.style.moods
              .filter((x) => !moods.slice(0, 5).includes(x.id))
              .map((m) => (
                <button
                  className="chip selected"
                  key={m.id}
                  onClick={() =>
                    updateStyle({
                      moods: project.style.moods.filter((x) => x.id !== m.id),
                    })
                  }
                >
                  {m.id}
                  <X size={11} />
                </button>
              ))}
          </div>
          <div className="field-label spaced">
            TEMPO{" "}
            <span className="tempo-value">
              <input
                aria-label="Tempo in BPM"
                type="number"
                min="40"
                max="240"
                value={project.style.bpm}
                onChange={(e) =>
                  updateStyle({
                    bpm: Math.max(40, Math.min(240, Number(e.target.value))),
                  })
                }
              />{" "}
              BPM
            </span>
          </div>
          <input
            className="tempo-range"
            aria-label="Tempo"
            type="range"
            min="40"
            max="180"
            value={project.style.bpm}
            onChange={(e) => updateStyle({ bpm: Number(e.target.value) })}
          />
          <div className="range-labels">
            <span>Slow & steady</span>
            <span>Upbeat</span>
          </div>
          <select
            aria-label="Rhythm"
            value={project.style.rhythm}
            onChange={(e) => updateStyle({ rhythm: e.target.value })}
          >
            {[
              "Steady 4/4",
              "Swing 4/4",
              "Waltz 3/4",
              "Half-time groove",
              "Syncopated groove",
              "Free rhythm",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <div className="field-label spaced">INSTRUMENTATION</div>
          <div className="chips">
            {project.style.instrumentation.map((x) => (
              <button
                key={x}
                className="chip neutral"
                onClick={() => toggleList("instrumentation", x)}
              >
                {x}
                <X size={10} />
              </button>
            ))}
            <button
              className="chip add-chip"
              aria-label="Add instrument"
              onClick={() => setInstrumentPicker(!instrumentPicker)}
            >
              <Plus size={13} />
            </button>
          </div>
          {instrumentPicker && (
            <div className="option-pool">
              {instruments
                .filter((x) => !project.style.instrumentation.includes(x))
                .map((x) => (
                  <button
                    className="chip"
                    key={x}
                    onClick={() => {
                      toggleList("instrumentation", x);
                      setInstrumentPicker(false);
                    }}
                  >
                    {x}
                  </button>
                ))}
            </div>
          )}
          <div className="field-label spaced">PRODUCTION</div>
          <div className="chips">
            {productions.slice(0, 4).map((x) => (
              <button
                key={x}
                className={`chip ${project.style.production.includes(x) ? "selected" : ""}`}
                onClick={() => toggleList("production", x)}
              >
                {project.style.production.includes(x) && <Check size={11} />}{" "}
                {x}
              </button>
            ))}
          </div>
          <details className="advanced-style">
            <summary>
              Fine-tune the arrangement
              <ChevronDown size={11} />
            </summary>
            <label className="field-label">DRUMS</label>
            <select
              aria-label="Drums"
              value={project.style.drums[0] || ""}
              onChange={(e) =>
                updateStyle({ drums: e.target.value ? [e.target.value] : [] })
              }
            >
              {[
                "",
                "Soft live drums",
                "Brushed drums",
                "Sample-driven drums",
                "Tight electronic drums",
                "Heavy live drums",
              ].map((x) => (
                <option key={x} value={x}>
                  {x || "No drums"}
                </option>
              ))}
            </select>
            <label className="field-label spaced">BASS</label>
            <select
              aria-label="Bass"
              value={project.style.bass[0] || ""}
              onChange={(e) =>
                updateStyle({ bass: e.target.value ? [e.target.value] : [] })
              }
            >
              {[
                "",
                "Warm bass",
                "Rounded sub-bass",
                "Acoustic upright bass",
                "Distorted bass",
                "Synth bass",
              ].map((x) => (
                <option key={x} value={x}>
                  {x || "No bass"}
                </option>
              ))}
            </select>
            <label className="field-label spaced">MIX</label>
            <select
              aria-label="Mix"
              value={project.style.mix[0] || ""}
              onChange={(e) =>
                updateStyle({ mix: e.target.value ? [e.target.value] : [] })
              }
            >
              {[
                "",
                "Vocal-forward",
                "Balanced mix",
                "Wide stereo",
                "Dry and intimate",
                "Deep reverberant mix",
              ].map((x) => (
                <option key={x} value={x}>
                  {x || "Natural mix"}
                </option>
              ))}
            </select>
            <div className="field-label spaced">MORE PRODUCTION TRAITS</div>
            <div className="chips">
              {productions.slice(4).map((x) => (
                <button
                  key={x}
                  className={`chip ${project.style.production.includes(x) ? "selected" : ""}`}
                  onClick={() => toggleList("production", x)}
                >
                  {x}
                </button>
              ))}
            </div>
          </details>
        </div>
      );
    if (kind === "Voice")
      return (
        <div className="blueprint-fields">
          <label className="field-label">VOCAL TYPE</label>
          <select
            value={project.style.voice.type}
            onChange={(e) =>
              updateStyle({
                voice: { ...project.style.voice, type: e.target.value },
              })
            }
          >
            {["Lead", "Duet", "Group", "Instrumental"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <label className="field-label spaced">REGISTER</label>
          <select
            value={project.style.voice.register}
            onChange={(e) =>
              updateStyle({
                voice: { ...project.style.voice, register: e.target.value },
              })
            }
          >
            {["Low", "Mid-range", "High", "Wide range"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <div className="field-label spaced">TEXTURE</div>
          <div className="chips">
            {textures.map((x) => (
              <button
                key={x}
                className={`chip ${project.style.voice.texture.includes(x) ? "selected" : ""}`}
                onClick={() =>
                  updateStyle({
                    voice: {
                      ...project.style.voice,
                      texture: project.style.voice.texture.includes(x)
                        ? project.style.voice.texture.filter((t) => t !== x)
                        : [...project.style.voice.texture, x],
                    },
                  })
                }
              >
                {x}
              </button>
            ))}
          </div>
          <label className="field-label spaced">DELIVERY</label>
          <select
            value={project.style.voice.delivery[0]}
            onChange={(e) =>
              updateStyle({
                voice: { ...project.style.voice, delivery: [e.target.value] },
              })
            }
          >
            {deliveries.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <p className="helper">
            The voice is part of your sound. Set a different delivery for each
            section in the inspector.
          </p>
        </div>
      );
    if (kind === "Theme")
      return (
        <div className="blueprint-fields">
          <label className="field-label">PRIMARY THEME</label>
          <select
            value={project.language.theme}
            onChange={(e) => updateLanguage({ theme: e.target.value })}
          >
            {themes.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <label className="field-label spaced">SONG CONCEPT</label>
          <textarea
            className="regular-textarea"
            rows={4}
            value={project.concept}
            onChange={(e) => change((p) => ({ ...p, concept: e.target.value }))}
            placeholder="What is this song really about?"
          />
          <label className="field-label spaced">CENTRAL MOTIF</label>
          <input
            className="text-input"
            value={project.language.motif}
            onChange={(e) => updateLanguage({ motif: e.target.value })}
          />
          <label className="field-label spaced">PERSPECTIVE</label>
          <select
            value={project.language.perspective}
            onChange={(e) =>
              updateLanguage({
                perspective: e.target
                  .value as Project["language"]["perspective"],
              })
            }
          >
            <option value="first">First person · I / we</option>
            <option value="second">Second person · you</option>
            <option value="third">Third person · they</option>
          </select>
          <div className="palette-note">
            <Leaf size={17} />
            <b>Your imagery palette</b>
            <div className="chips">
              {(
                palette[project.language.theme] || palette[themes[0]]
              ).objects.map((x) => (
                <span className="chip neutral" key={x}>
                  {x}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    if (kind === "Structure")
      return (
        <div className="blueprint-fields">
          <label className="field-label">SONG TEMPLATE</label>
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const templates: Record<string, SectionType[]> = {
                Pop: [
                  "verse",
                  "pre-chorus",
                  "chorus",
                  "verse",
                  "chorus",
                  "bridge",
                  "chorus",
                ],
                Minimal: ["verse", "chorus"],
                Story: ["verse", "verse", "bridge", "chorus"],
                Rap: ["intro", "verse", "chorus", "verse", "chorus", "outro"],
              };
              const sections = templates[e.target.value].map((t, i) =>
                makeSection(t, i + 1),
              );
              change((p) => ({
                ...p,
                structure: [...p.structure, ...sections],
              }));
              flash("Template sections added below your existing work.");
            }}
          >
            <option value="">Add template sections…</option>
            {["Pop", "Minimal", "Story", "Rap"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <p className="helper">
            Templates append sections so your existing lyrics stay safe.
          </p>
          <div className="structure-list">
            {project.structure.map((s, i) => (
              <div
                key={s.id}
                className={`structure-item ${current?.id === s.id ? "active" : ""}`}
              >
                <button
                  onClick={() => {
                    setSelected(s.id);
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <GripVertical size={13} />
                  <span>
                    {s.name}
                    <small>{s.purpose}</small>
                  </span>
                </button>
                <button
                  className="tiny-button"
                  aria-label={`Move ${s.name} up`}
                  disabled={i === 0}
                  onClick={() => moveSection(s.id, -1)}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  className="tiny-button"
                  aria-label={`Move ${s.name} down`}
                  disabled={i === project.structure.length - 1}
                  onClick={() => moveSection(s.id, 1)}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
            ))}
          </div>
          <button className="text-button" onClick={() => addSection("verse")}>
            <Plus size={13} /> Add a verse
          </button>
        </div>
      );
    return (
      <div className="blueprint-fields">
        <label className="field-label">LANGUAGE REGISTER</label>
        <select
          value={project.language.register}
          onChange={(e) => updateLanguage({ register: e.target.value })}
        >
          {["Plain", "Poetic", "Conversational", "Aggressive", "Abstract"].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <label className="field-label spaced">PREFERRED VOCABULARY</label>
        <textarea
          className="regular-textarea"
          rows={3}
          value={project.language.preferred}
          onChange={(e) => updateLanguage({ preferred: e.target.value })}
        />
        <label className="field-label spaced">AVOIDED WORDS & PHRASES</label>
        <textarea
          className="regular-textarea"
          rows={3}
          value={project.language.avoided}
          onChange={(e) => updateLanguage({ avoided: e.target.value })}
        />
        <p className="helper">
          Separate entries with commas. Avoided phrases are excluded from
          generated lines.
        </p>
        <label className="field-label spaced">DIALECT GUIDANCE</label>
        <select
          value={project.language.dialect}
          onChange={(e) => updateLanguage({ dialect: e.target.value })}
        >
          {["Standard", "British English", "American English"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <div className="field-label spaced">
          STRENGTH <span>{project.language.dialectStrength} / 5</span>
        </div>
        <input
          aria-label="Dialect strength"
          type="range"
          min="1"
          max="5"
          value={project.language.dialectStrength}
          onChange={(e) =>
            updateLanguage({ dialectStrength: Number(e.target.value) })
          }
        />
        <button
          className="outline-button full"
          onClick={() => {
            setDialectApply(false);
            setModal("dialect");
          }}
        >
          Preview guidance <ArrowUpRight size={13} />
        </button>
      </div>
    );
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Song canvas");
          }}
        >
          <span className="brand-mark">
            <AudioLines size={22} />
          </span>
          <span>
            Lyric<span className="brand-light">Lab</span>
            <span className="version">BETA</span>
          </span>
        </a>
        <nav className="header-nav">
          <button className="active" onClick={() => setTab("Song canvas")}>
            Workspace
          </button>
          <button onClick={() => setModal("projects")}>My projects</button>
        </nav>
        <div className="header-right">
          <span className="offline-status">
            <span className="status-dot" /> Offline by design
          </span>
          <span className="header-divider" />
          <button
            className="icon-button"
            title="Studio guide"
            aria-label="Studio guide"
            onClick={() => setModal("guide")}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="profile-button"
            title="Local projects"
            onClick={() => setModal("projects")}
          >
            LL
          </button>
        </div>
      </header>
      <div className="project-toolbar">
        <div className="project-breadcrumb">
          <FolderOpen size={15} />
          <button onClick={() => setModal("projects")}>My projects</button>
          <ChevronRight size={12} />
          <span>{project.title || "Untitled song"}</span>
          <span className="project-type">SONG</span>
        </div>
        <div className="toolbar-actions">
          <span className="save-status">
            <CheckCheck size={14} />
            {saveStatus}
          </span>
          <button
            className="icon-button"
            title="Undo"
            aria-label="Undo"
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            title="Redo"
            aria-label="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <button className="export-button" onClick={() => setModal("export")}>
            <Download size={14} />
            Export
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      {storageError && (
        <div className="error-banner">
          {storageError}
          <button
            onClick={() => {
              try {
                const original = localStorage.getItem(STORAGE_KEY);
                download(
                  "LyricLab-original-storage.json",
                  original ?? serializeStudioLibrary(projects),
                  "application/json",
                );
                setStorageError("");
              } catch {
                flash(
                  "Unable to read original storage. Export your active project separately.",
                );
              }
            }}
          >
            Export & enable saving
          </button>
        </div>
      )}
      <div className="studio-layout">
        <aside className={`blueprint ${mobileBlueprint ? "mobile-open" : ""}`}>
          <div className="sidebar-heading">
            <span>YOUR BLUEPRINT</span>
            <button
              className="icon-button"
              aria-label="Blueprint help"
              onClick={() => setModal("guide")}
            >
              <SlidersHorizontal size={15} />
            </button>
          </div>
          <p className="sidebar-intro">Give your song a direction.</p>
          {(
            ["Style", "Voice", "Theme", "Structure", "Language"] as Panel[]
          ).map((kind) => {
            const Icon = panelIcons[kind];
            return (
              <div
                key={kind}
                className={`blueprint-section ${panel === kind ? "open" : ""}`}
              >
                <button
                  className="blueprint-section-title"
                  onClick={() => setPanel(kind)}
                >
                  <Icon size={16} />
                  <span>{kind}</span>
                  <span className="section-summary">
                    {kind === "Voice"
                      ? `${project.style.voice.texture[0] || "Clear"}, ${project.style.voice.delivery[0]?.toLowerCase() || "melodic"}`
                      : kind === "Theme"
                        ? project.style.moods[0]?.id || "Choose a theme"
                        : kind === "Structure"
                          ? `${project.structure.length} sections`
                          : kind === "Language"
                            ? project.language.register
                            : ""}
                  </span>
                  {panel === kind ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                {panel === kind && blueprintContent(kind)}
              </div>
            );
          })}
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <div>
              Your ideas stay yours.
              <span>No accounts. No cloud. Just you.</span>
            </div>
          </div>
        </aside>
        <main className="main-workspace">
          <div className="canvas-heading">
            <div className="eyebrow">
              <span className="little-line" /> A WORK IN PROGRESS
            </div>
            <div className="song-title-row">
              <input
                aria-label="Song title"
                className="song-title"
                value={project.title}
                placeholder="Untitled song"
                onChange={(e) =>
                  change((p) => ({ ...p, title: e.target.value }))
                }
              />
              <button
                className="icon-button mobile-blueprint-toggle"
                aria-label="Toggle blueprint"
                onClick={() => setMobileBlueprint(!mobileBlueprint)}
              >
                <Menu size={20} />
              </button>
              <button
                className="icon-button song-more"
                title="Project settings"
                aria-label="Project settings"
                onClick={() => setModal("seed")}
              >
                <MoreHorizontal size={21} />
              </button>
            </div>
            <p>A little structure. A lot of possibility.</p>
          </div>
          <div className="workspace-tabs">
            <div role="tablist" aria-label="Studio views">
              {(["Song canvas", "Style prompt", "Hook lab"] as Tab[]).map(
                (t, i) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? "active" : ""}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {i === 0 ? (
                      <FileText size={14} />
                    ) : i === 1 ? (
                      <SlidersHorizontal size={14} />
                    ) : (
                      <Sparkles size={14} />
                    )}{" "}
                    {t}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="canvas-content">
            {tab === "Song canvas" && (
              <>
                <div className="canvas-tools">
                  <span>
                    {project.structure.length} sections{" "}
                    <span className="middot">·</span> {totalLines} lines{" "}
                    <span className="canvas-hint">
                      Make every line your own.
                    </span>
                  </span>
                  <div>
                    <button
                      className="icon-button mobile-inspector-toggle"
                      aria-label="Toggle inspector"
                      onClick={() => setMobileInspector(!mobileInspector)}
                    >
                      <Settings2 size={16} />
                    </button>
                    <button
                      className="seed-button"
                      onClick={() => setModal("seed")}
                    >
                      <Hash size={12} />
                      {project.seed}
                    </button>
                    <button
                      className="generate-button"
                      onClick={() => current && regenerate(current)}
                    >
                      <WandSparkles size={14} /> Generate
                    </button>
                  </div>
                </div>
                <div className="song-sections">
                  {project.structure.map((section, i) => {
                    const a = analyzeStudioSection(project, section.id);
                    const active = current?.id === section.id;
                    return (
                      <article
                        id={section.id}
                        className={`lyric-section ${active ? "selected-section" : ""}`}
                        key={section.id}
                        onClick={() => setSelected(section.id)}
                      >
                        <div className="lyric-section-header">
                          <div
                            className={`section-symbol ${section.type === "chorus" ? "chorus-symbol" : ""}`}
                          >
                            {section.type === "verse" ? (
                              `V${project.structure.slice(0, i + 1).filter((s) => s.type === "verse").length}`
                            ) : section.type === "chorus" ? (
                              <Music2 size={16} />
                            ) : section.type === "bridge" ? (
                              "B"
                            ) : (
                              "S"
                            )}
                          </div>
                          <h2>{section.name}</h2>
                          <span
                            className={`purpose-badge ${section.type === "chorus" ? "chorus-purpose" : ""}`}
                          >
                            {section.type === "verse"
                              ? "Story"
                              : section.type === "chorus"
                                ? "The heart"
                                : section.type === "bridge"
                                  ? "A new perspective"
                                  : "Atmosphere"}
                          </span>
                          <div className="section-actions">
                            <button
                              className="icon-button"
                              title="Regenerate unlocked generated lines"
                              aria-label={`Regenerate ${section.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                regenerate(section);
                              }}
                            >
                              <RefreshCw size={14} />
                            </button>
                            <button
                              className={`icon-button ${section.locked ? "locked" : ""}`}
                              title={
                                section.locked
                                  ? "Unlock section"
                                  : "Lock section"
                              }
                              aria-label={`${section.locked ? "Unlock" : "Lock"} ${section.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSection(section.id, {
                                  locked: !section.locked,
                                });
                              }}
                            >
                              {section.locked ? (
                                <LockKeyhole size={14} />
                              ) : (
                                <UnlockKeyhole size={14} />
                              )}
                            </button>
                            <div className="menu-anchor">
                              <button
                                className="icon-button"
                                aria-label={`${section.name} actions`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSectionMenu(
                                    sectionMenu === section.id
                                      ? ""
                                      : section.id,
                                  );
                                }}
                              >
                                <MoreHorizontal size={17} />
                              </button>
                              {sectionMenu === section.id && (
                                <div className="dropdown-menu">
                                  <button
                                    onClick={() => {
                                      duplicateSection(section);
                                      setSectionMenu("");
                                    }}
                                  >
                                    <Copy size={13} />
                                    Duplicate section
                                  </button>
                                  <button
                                    onClick={() => {
                                      updateSection(section.id, {
                                        lines: [
                                          ...section.lines,
                                          {
                                            id: uid(),
                                            text: "",
                                            locked: false,
                                            authored: false,
                                          },
                                        ],
                                      });
                                      setSectionMenu("");
                                    }}
                                  >
                                    <Plus size={13} />
                                    Add line
                                  </button>
                                  <button
                                    onClick={() => {
                                      moveSection(section.id, -1);
                                      setSectionMenu("");
                                    }}
                                  >
                                    <ArrowUp size={13} />
                                    Move up
                                  </button>
                                  <button
                                    onClick={() => {
                                      moveSection(section.id, 1);
                                      setSectionMenu("");
                                    }}
                                  >
                                    <ArrowDown size={13} />
                                    Move down
                                  </button>
                                  <button
                                    className="danger"
                                    onClick={() => {
                                      change((p) => ({
                                        ...p,
                                        structure: p.structure.filter(
                                          (s) => s.id !== section.id,
                                        ),
                                      }));
                                      setSectionMenu("");
                                    }}
                                  >
                                    <Trash2 size={13} />
                                    Delete section
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="lyric-lines">
                          {section.lines.map((line, j) => (
                            <div
                              key={line.id}
                              className={`lyric-line ${lineFocus === line.id ? "focused-line" : ""}`}
                            >
                              <span className="line-number">
                                {String(j + 1).padStart(2, "0")}
                              </span>
                              <textarea
                                aria-label={`${section.name} line ${j + 1}`}
                                rows={1}
                                value={line.text}
                                placeholder="Start with a thought…"
                                onFocus={() => {
                                  setSelected(section.id);
                                  setLineFocus(line.id);
                                }}
                                onChange={(e) =>
                                  updateSection(section.id, {
                                    lines: section.lines.map((l) =>
                                      l.id === line.id
                                        ? {
                                            ...l,
                                            text: e.target.value.replace(
                                              /\n/g,
                                              " ",
                                            ),
                                            authored: true,
                                          }
                                        : l,
                                    ),
                                  })
                                }
                              />
                              <button
                                className={`line-lock ${line.locked ? "is-locked" : ""}`}
                                title={
                                  line.locked ? "Unlock line" : "Lock line"
                                }
                                aria-label={`${line.locked ? "Unlock" : "Lock"} line ${j + 1}`}
                                onClick={() =>
                                  updateSection(section.id, {
                                    lines: section.lines.map((l) =>
                                      l.id === line.id
                                        ? { ...l, locked: !l.locked }
                                        : l,
                                    ),
                                  })
                                }
                              >
                                {line.locked ? (
                                  <LockKeyhole size={11} />
                                ) : (
                                  <UnlockKeyhole size={11} />
                                )}
                              </button>
                              <span
                                className="line-syllables"
                                title={`Syllables: ${a.confidence[j] || "unknown"}`}
                              >
                                {a.counts[j] || "–"}
                              </span>
                              <span
                                className={`rhyme-letter rhyme-${a.scheme[j] || "A"}`}
                                title="Estimated end rhyme"
                              >
                                {a.scheme[j] || "–"}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="section-footer">
                          <span>
                            <span className="small-dot" />
                            {section.delivery} <span className="middot">·</span>{" "}
                            {section.rhymeScheme}
                          </span>
                          <span>
                            {section.lines.filter((l) => l.locked).length >
                              0 && (
                              <>
                                <LockKeyhole size={10} />
                                {
                                  section.lines.filter((l) => l.locked).length
                                }{" "}
                                locked <span className="middot">·</span>
                              </>
                            )}
                            {section.lines.length} lines
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="add-section-wrap">
                  <button
                    className="add-section"
                    onClick={() => setAddMenu(!addMenu)}
                  >
                    <Plus size={16} /> Add a section
                    <span>Give your story somewhere to go</span>
                  </button>
                  {addMenu && (
                    <div className="section-options">
                      {(
                        [
                          "intro",
                          "verse",
                          "pre-chorus",
                          "chorus",
                          "bridge",
                          "outro",
                          "custom",
                        ] as SectionType[]
                      ).map((t) => (
                        <button key={t} onClick={() => addSection(t)}>
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="canvas-bottom-note">
                  <Lightbulb size={13} /> Good songs start with a thought. You
                  can edit every word.
                </p>
              </>
            )}
            {tab === "Style prompt" && (
              <div className="prompt-workspace">
                <div className="view-heading">
                  <span className="feature-icon">
                    <SlidersHorizontal size={22} />
                  </span>
                  <div>
                    <h2>Your sound, in words.</h2>
                    <p>A portable prompt, compiled from your blueprint.</p>
                  </div>
                </div>
                <div className="format-tabs">
                  {(["Compact", "Detailed", "Annotated"] as PromptFormat[]).map(
                    (f) => (
                      <button
                        key={f}
                        className={format === f ? "active" : ""}
                        onClick={() => setFormat(f)}
                      >
                        {f}
                      </button>
                    ),
                  )}
                </div>
                <div className="prompt-paper">
                  <div className="field-label">
                    {format.toUpperCase()} STYLE PROMPT{" "}
                    <span>
                      <span className="status-dot" /> DETERMINISTIC
                    </span>
                  </div>
                  <textarea
                    aria-label="Compiled style prompt"
                    readOnly
                    value={stylePrompt}
                    rows={format === "Compact" ? 8 : 19}
                  />
                  <div className="prompt-footer">
                    <span>Seed {project.seed} · No AI required</span>
                    <button
                      className="outline-button"
                      onClick={() => copy(stylePrompt)}
                    >
                      <Copy size={13} />
                      Copy prompt
                    </button>
                  </div>
                </div>
                {styleResult.diagnostics.map((warning, i) => (
                  <div className="style-warning" key={i}>
                    <Lightbulb size={15} />
                    {warning.message}
                  </div>
                ))}
                <div className="prompt-explainer">
                  <ShieldCheck size={18} />
                  <div>
                    <b>Built from choices, not chance.</b>
                    <p>
                      The same blueprint and seed always produce the same
                      prompt. Change your sound in the Blueprint panel.
                    </p>
                  </div>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    download(`${project.title}-style.txt`, stylePrompt)
                  }
                >
                  <Download size={14} /> Export as text
                </button>
              </div>
            )}
            {tab === "Hook lab" && (
              <div className="hook-workspace">
                <div className="view-heading">
                  <span className="feature-icon">
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <h2>Find the line that stays.</h2>
                    <p>Three starting points. One song that's yours.</p>
                  </div>
                </div>
                <div className="hook-toolbar">
                  <span>
                    <Leaf size={13} />
                    {project.language.theme}
                  </span>
                  <button className="outline-button" onClick={nextHooks}>
                    <RefreshCw size={13} />
                    New variations
                  </button>
                </div>
                {hooks.map((preview, i) => (
                  <div className="hook-card" key={i}>
                    <div className="hook-card-header">
                      <span className="field-label">
                        VARIATION {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="chip neutral">
                        {["Title drop", "Refrain", "Central claim"][i]}
                      </span>
                    </div>
                    {preview.lines.map((l) => (
                      <p key={l.id}>{l.text}</p>
                    ))}
                    {!preview.draft && (
                      <p className="helper">
                        {preview.diagnostics
                          .map((issue) => issue.message)
                          .join(" ")}
                      </p>
                    )}
                    <div className="hook-card-footer">
                      <span>
                        4 lines · Melodic · Seed {project.seed} · Variation{" "}
                        {hookSeed}
                      </span>
                      <button
                        className="text-button"
                        disabled={!preview.draft}
                        onClick={() => {
                          const result = acceptHook(project, preview);
                          if (
                            result.status === "applied" &&
                            "project" in result
                          ) {
                            change(result.project);
                            setHookSeed(
                              result.project.engineState?.variations[
                                "hook-lab"
                              ] || hookSeed,
                            );
                            setSelected(
                              result.project.structure.at(-1)?.id || "",
                            );
                            setTab("Song canvas");
                            flash("Hook added as a new chorus.");
                          } else
                            flash(
                              result.diagnostics
                                .map((issue) => issue.message)
                                .join(" "),
                            );
                        }}
                      >
                        Use this hook
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="helper">
                  Procedural drafts use local phrase templates. Shape them into
                  your own voice.
                </p>
              </div>
            )}
          </div>
        </main>
        <aside
          className={`inspector ${mobileInspector ? "mobile-inspector-open" : ""}`}
        >
          <div className="sidebar-heading">
            <span>INSPECTOR</span>
            {mobileInspector ? (
              <button
                className="icon-button"
                aria-label="Close inspector"
                onClick={() => setMobileInspector(false)}
              >
                <X size={16} />
              </button>
            ) : (
              <Settings2 size={16} />
            )}
          </div>
          {current && analysis ? (
            <>
              <div className="inspector-selection">
                <span className="small-dot" />
                {current.name.toUpperCase()}
                <span className="live-label">LIVE</span>
              </div>
              <div className="inspector-block">
                <label className="field-label">SECTION PURPOSE</label>
                <textarea
                  className="purpose-input"
                  aria-label="Section purpose"
                  rows={2}
                  value={current.purpose}
                  onChange={(e) =>
                    updateSection(current.id, { purpose: e.target.value })
                  }
                />
                <div className="field-label spaced">
                  INTENSITY{" "}
                  <span>
                    {current.intensity}
                    <small>%</small>
                  </span>
                </div>
                <div className="intensity-chart">
                  {project.structure.map((s, i) => (
                    <button
                      key={s.id}
                      title={`${s.name}: ${s.intensity}%`}
                      onClick={() => setSelected(s.id)}
                    >
                      <span
                        className={`intensity-bar ${s.id === current.id ? "current" : ""}`}
                        style={{
                          height: `${Math.max(8, s.intensity * 0.65)}px`,
                        }}
                      />
                      <small>
                        {s.type === "verse"
                          ? `V${project.structure.slice(0, i + 1).filter((x) => x.type === "verse").length}`
                          : s.type === "chorus"
                            ? "C"
                            : s.type === "bridge"
                              ? "B"
                              : s.type[0].toUpperCase()}
                      </small>
                    </button>
                  ))}
                </div>
                <input
                  className="intensity-range"
                  aria-label="Section intensity"
                  type="range"
                  min="0"
                  max="100"
                  value={current.intensity}
                  onChange={(e) =>
                    updateSection(current.id, {
                      intensity: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="inspector-block">
                <div className="inspector-field">
                  <span>Section role</span>
                  <select
                    aria-label="Section role"
                    value={
                      project.engineState?.roles[current.id] ||
                      (current.type === "chorus" || current.type === "outro"
                        ? "resolve"
                        : current.type === "bridge"
                          ? "reveal"
                          : current.type === "pre-chorus"
                            ? "challenge"
                            : current.type === "intro" ||
                                current.id ===
                                  project.structure.find(
                                    (section) => section.type === "verse",
                                  )?.id
                              ? "establish"
                              : "develop")
                    }
                    onChange={(event) =>
                      updateRole(event.target.value as SectionRole)
                    }
                  >
                    {[
                      "establish",
                      "develop",
                      "challenge",
                      "reveal",
                      "resolve",
                    ].map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <button className="text-button" onClick={inspectReplay}>
                  Verify original draft
                </button>
              </div>
              <div className="inspector-block rhyme-cadence">
                <h3>
                  <AudioLines size={15} />
                  Rhyme & cadence
                </h3>
                <div className="inspector-field">
                  <span>Rhyme target</span>
                  <select
                    aria-label="Rhyme target"
                    value={current.rhymeScheme}
                    onChange={(e) =>
                      updateSection(current.id, { rhymeScheme: e.target.value })
                    }
                  >
                    {["ABAB", "AABB", "AAAA", "ABCB", "AABA", "ABBA"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </div>
                <div className="inspector-field">
                  <span>Delivery</span>
                  <select
                    aria-label="Section delivery"
                    value={current.delivery}
                    onChange={(e) =>
                      updateSection(current.id, {
                        delivery: e.target.value,
                        syllableRange: cadenceRanges[e.target.value] || [8, 12],
                      })
                    }
                  >
                    {deliveries.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="target-note">
                  <span className="small-dot" />
                  Target: {analysis.range[0]}–{analysis.range[1]} syllables /
                  line
                </div>
              </div>
              <div className="inspector-block line-analysis">
                <div className="field-label">
                  LINE BY LINE<span>SYLLABLES</span>
                </div>
                {current.lines.map((l, i) => (
                  <button
                    className={lineFocus === l.id ? "active-analysis" : ""}
                    key={l.id}
                    onClick={() => {
                      setLineFocus(l.id);
                      document
                        .querySelector<HTMLTextAreaElement>(
                          `textarea[aria-label="${current.name} line ${i + 1}"]`,
                        )
                        ?.focus();
                    }}
                  >
                    <span>Line {String(i + 1).padStart(2, "0")}</span>
                    <div className="syllable-track">
                      <div
                        style={{
                          width: `${Math.min(100, (analysis.counts[i] / 20) * 100)}%`,
                        }}
                      />
                    </div>
                    <b>{analysis.counts[i]}</b>
                    <span
                      className={`analysis-indicator ${analysis.counts[i] >= analysis.range[0] && analysis.counts[i] <= analysis.range[1] ? "good" : ""}`}
                    />
                  </button>
                ))}
                <div className="rhyme-detected">
                  <span>Detected rhyme</span>
                  <div>
                    {analysis.scheme.split("").map((s, i) => (
                      <span key={i} className={`rhyme-letter rhyme-${s}`}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="estimate-note">
                  Syllables and rhymes are estimates.
                </p>
              </div>
              <div className="inspector-block notes-block">
                <h3>
                  <Lightbulb size={15} />A little guidance{" "}
                  <span>{sectionWarnings.length}</span>
                </h3>
                {sectionWarnings.length ? (
                  sectionWarnings.slice(0, 3).map((w) => (
                    <div className="guidance-note" key={w.id}>
                      <span>{w.text}</span>
                      <button
                        title="Ignore this warning"
                        aria-label="Ignore this warning"
                        onClick={() =>
                          change((p) => ({
                            ...p,
                            settings: {
                              ignoredWarnings: [
                                ...p.settings.ignoredWarnings,
                                w.id,
                              ],
                            },
                          }))
                        }
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="all-clear">
                    <Check size={13} />
                    <span>Your lines fit the current constraints.</span>
                  </div>
                )}
                <p className="guidance-caption">
                  Suggestions, never rules.
                  <br />
                  Trust your ear.
                </p>
              </div>
            </>
          ) : (
            <div className="empty-inspector">
              <Music2 size={28} />
              <p>Add a section to start shaping your song.</p>
            </div>
          )}
          <div className="inspector-bottom">
            <span className="status-dot" />
            Your creative space. No AI required.
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>
          <span className="status-dot" />
          All engines run locally
        </span>
        <span>
          <LockKeyhole size={11} />
          Private by default<span className="middot">·</span>LyricLab v0.1
        </span>
        <button onClick={() => setModal("guide")}>
          A space for your next song <ArrowUpRight size={11} />
        </button>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <input
        ref={importRef}
        type="file"
        accept=".json,.lyriclab.json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) void importProject(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <section
            className={`modal ${modal === "export" ? "export-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "export"
                ? "Export your song"
                : modal === "projects"
                  ? "My projects"
                  : modal === "guide"
                    ? "Studio guide"
                    : modal === "seed"
                      ? "Project settings"
                      : modal === "replay"
                        ? "Original draft inspection"
                        : "Dialect preview"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            {modal === "export" && (
              <>
                <span className="feature-icon">
                  <Download size={23} />
                </span>
                <h2>Take your song with you.</h2>
                <p className="modal-subtitle">
                  Your words. Your sound. In the format you need.
                </p>
                <div className="export-options">
                  {[
                    {
                      id: "project",
                      title: "LyricLab project",
                      desc: "Everything, including choices and locked lines",
                      Icon: FolderOpen,
                    },
                    {
                      id: "lyrics",
                      title: "Plain lyrics",
                      desc: "Clean lyrics, with section headings · .txt",
                      Icon: FileText,
                    },
                    {
                      id: "annotated",
                      title: "Annotated lyrics",
                      desc: "Lyrics with purpose and cadence notes · .txt",
                      Icon: BookOpen,
                    },
                    {
                      id: "compact",
                      title: "Compact style prompt",
                      desc: "A concise prompt for your music generator · .txt",
                      Icon: Music2,
                    },
                    {
                      id: "detailed",
                      title: "Detailed style prompt",
                      desc: "Your full sound, arrangement, and voice · .txt",
                      Icon: SlidersHorizontal,
                    },
                    {
                      id: "legacy",
                      title: "Legacy project JSON",
                      desc: "Compatibility schema v1; no recipes or word locks",
                      Icon: FileJson,
                    },
                    {
                      id: "spec",
                      title: "SongSpec JSON",
                      desc: "Portable schema v1 for other applications",
                      Icon: FileJson,
                    },
                  ].map(({ id, title, desc, Icon }) => (
                    <button
                      className={`export-option ${exportType === id ? "active" : ""}`}
                      key={id}
                      onClick={() => setExportType(id)}
                    >
                      <Icon size={19} />
                      <span>
                        <b>{title}</b>
                        <small>{desc}</small>
                      </span>
                      <span className="radio-circle">
                        {exportType === id && <span />}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  className="primary-button full"
                  onClick={exportSelected}
                >
                  <Download size={15} />
                  Download {exportType === "project" ? "project" : "export"}
                </button>
                <p className="modal-footnote">
                  <ShieldCheck size={12} /> Export happens entirely on your
                  device.
                </p>
              </>
            )}
            {modal === "projects" && (
              <>
                <span className="feature-icon">
                  <FolderOpen size={23} />
                </span>
                <h2>Your songs live here.</h2>
                <p className="modal-subtitle">
                  Saved in this browser. Export a project for a portable backup.
                </p>
                <div className="project-list">
                  {projects.map((p) => (
                    <div
                      className={`project-item ${project.id === p.id ? "active" : ""}`}
                      key={p.id}
                    >
                      <button
                        className="project-open"
                        onClick={() => openProject(p)}
                      >
                        <Music2 size={18} />
                        <span>
                          <b>{p.id === project.id ? project.title : p.title}</b>
                          <small>
                            {p.structure.length} sections ·{" "}
                            {new Date(p.updatedAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </small>
                        </span>
                        {project.id === p.id && (
                          <span className="chip selected">Open</span>
                        )}
                      </button>
                      <button
                        className="icon-button"
                        title="Duplicate project"
                        aria-label={`Duplicate ${p.title}`}
                        onClick={() => {
                          const clone = {
                            ...(p.id === project.id ? project : p),
                            id: uid(),
                            title: `${(p.id === project.id ? project : p).title} (copy)`,
                          };
                          setProjects((ps) => [...ps, clone]);
                          try {
                            if (!storageError)
                              localStorage.setItem(
                                STORAGE_KEY,
                                serializeStudioLibrary([...projects, clone]),
                              );
                          } catch {
                            setSaveStatus("Save unavailable");
                            setStorageError("Browser storage is unavailable or full. Export your projects to keep your work.");
                          }
                          flash("Project duplicated.");
                        }}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title="Delete project"
                        aria-label={`Delete ${p.title}`}
                        disabled={project.id === p.id}
                        onClick={() => {
                          const next = projects.filter((x) => x.id !== p.id);
                          setProjects(next);
                          try {
                            if (!storageError)
                              localStorage.setItem(
                                STORAGE_KEY,
                                serializeStudioLibrary(next),
                              );
                          } catch {
                            setSaveStatus("Save unavailable");
                            setStorageError("Browser storage is unavailable or full. Export your projects to keep your work.");
                          }
                          flash("Project removed from this browser.");
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="modal-action-row">
                  <button
                    className="outline-button"
                    onClick={() => importRef.current?.click()}
                  >
                    <FolderOpen size={14} />
                    Import project
                  </button>
                  <button className="primary-button" onClick={newProject}>
                    <Plus size={15} />
                    New song
                  </button>
                </div>
              </>
            )}
            {modal === "seed" && (
              <>
                <span className="feature-icon">
                  <Hash size={23} />
                </span>
                <h2>A little intention in the details.</h2>
                <p className="modal-subtitle">
                  The same blueprint and seed always give you the same starting
                  point.
                </p>
                <label className="field-label">GENERATION SEED</label>
                <input
                  className="text-input"
                  type="number"
                  aria-label="Generation seed"
                  min={0}
                  max={4294967295}
                  value={project.seed}
                  onChange={(e) =>
                    change((p) => ({
                      ...p,
                      seed: Math.min(
                        4294967295,
                        Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                      ),
                    }))
                  }
                />
                <label className="field-label spaced">PROJECT TITLE</label>
                <input
                  className="text-input"
                  value={project.title}
                  onChange={(e) =>
                    change((p) => ({ ...p, title: e.target.value }))
                  }
                />
                <label className="field-label spaced">CONCEPT</label>
                <textarea
                  className="regular-textarea"
                  rows={3}
                  value={project.concept}
                  onChange={(e) =>
                    change((p) => ({ ...p, concept: e.target.value }))
                  }
                />
                <button
                  className="primary-button full spaced"
                  onClick={() => setModal(null)}
                >
                  <Check size={14} />
                  Done
                </button>
              </>
            )}
            {modal === "guide" && (
              <>
                <span className="feature-icon">
                  <Lightbulb size={23} />
                </span>
                <h2>A space to find your song.</h2>
                <p className="modal-subtitle">
                  A few choices, a blank page, and room to experiment.
                </p>
                <div className="guide-steps">
                  <div>
                    <span>01</span>
                    <p>
                      <b>Shape the sound.</b> Choose a genre blend, moods,
                      instruments, and a voice. Your style prompt is compiled
                      from those choices.
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      <b>Find the words.</b> Write directly in the canvas or try
                      a procedural draft. Generating preserves authored and
                      locked lines.
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <p>
                      <b>Listen to the shape.</b> Select a section to inspect
                      rhyme, estimated syllables, delivery, and intensity.
                      Guidance never blocks your choices.
                    </p>
                  </div>
                  <div>
                    <span>04</span>
                    <p>
                      <b>Keep it yours.</b> Work saves in this browser. Export
                      lyrics, style, or a full project to carry it elsewhere.
                    </p>
                  </div>
                </div>
                <div className="guide-offline">
                  <ShieldCheck size={18} />
                  <span>
                    No accounts, models, or API keys.
                    <br />
                    Everything happens on your device.
                  </span>
                </div>
                <button
                  className="primary-button full"
                  onClick={() => setModal(null)}
                >
                  Back to the song <ArrowUpRight size={15} />
                </button>
              </>
            )}
            {modal === "replay" && (
              <>
                <h2>Original draft</h2>
                <p className="helper">
                  Replayed from its recorded inputs. Your current lyrics stay
                  editable.
                </p>
                <textarea
                  className="regular-textarea"
                  rows={10}
                  readOnly
                  aria-label="Replayed original draft"
                  value={replayText}
                />
              </>
            )}
            {modal === "dialect" && (
              <>
                <span className="feature-icon">
                  <Globe2 size={23} />
                </span>
                <h2>A touch of local language.</h2>
                <p className="modal-subtitle">
                  {project.language.dialect} · Strength{" "}
                  {project.language.dialectStrength}/5. Preview vocabulary
                  substitutions before applying.
                </p>
                <label className="helper">
                  <input
                    type="checkbox"
                    aria-label="Allow dialect changes to authored text"
                    checked={replaceAuthored}
                    onChange={(e) => setReplaceAuthored(e.target.checked)}
                  />{" "}
                  Allow changes to authored text. Section, line, and word locks
                  stay protected.
                </label>
                {dialectDraft?.preview.diagnostics.map((issue, index) => (
                  <p className="helper" key={`${issue.ruleId}:${index}`}>
                    {issue.message}
                  </p>
                ))}
                <div className="dialect-preview">
                  {current?.lines.map((l) => (
                    <div key={l.id}>
                      <small>
                        {l.locked || current.locked
                          ? "LOCKED — PRESERVED"
                          : "ORIGINAL"}
                      </small>
                      <p>{l.text || "Empty line"}</p>
                      <small>PREVIEW</small>
                      <p className="dialect-result">
                        {dialectDraft?.lines.find((line) => line.id === l.id)
                          ?.text ?? l.text}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="helper">
                  A small vocabulary pack, with optional “going to” phrasing at
                  strengths 4–5. Authored text is protected unless enabled
                  above. Locks stay unchanged. Undo reverses the application.
                </p>
                <button
                  className="primary-button full"
                  disabled={dialectApply || !current}
                  onClick={() => {
                    if (!current) return;
                    if (!dialectDraft) return;
                    if (!dialectDraft.preview.edits.length) {
                      flash(
                        dialectDraft.preview.diagnostics
                          .map((issue) => issue.message)
                          .join(" ") ||
                          "No eligible vocabulary changes. Authored text and locks are protected.",
                      );
                      return;
                    }
                    const result = applyStudioDialect(project, dialectDraft);
                    if (result.status === "applied" && "project" in result) {
                      change(result.project);
                      setDialectApply(true);
                      flash(
                        "Guidance applied. Undo restores the original lines.",
                      );
                    } else
                      flash(
                        result.diagnostics
                          .map((issue) => issue.message)
                          .join(" ") || "No eligible vocabulary changes.",
                      );
                  }}
                >
                  {dialectApply ? (
                    <>
                      <Check size={14} />
                      Applied
                    </>
                  ) : (
                    <>
                      Apply to selected section
                      <ArrowUpRight size={14} />
                    </>
                  )}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
export default App;
