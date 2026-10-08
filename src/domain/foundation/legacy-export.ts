import type { Project } from '../types';
/** Explicit compatibility export: schema 1 has no recipes, word locks, or unknown-origin field. */
export function legacyProject(project: Project): Project {
  const { engineState: _engineState, ...legacy } = project;
  return structuredClone(legacy);
}
