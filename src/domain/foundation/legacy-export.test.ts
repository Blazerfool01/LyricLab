import { expect, it } from 'vitest';
import fixture from '../fixtures/legacy-v0.1.json';
import { emptyEngineState } from './adapters';
import { legacyProject } from './legacy-export';
import { validateProject } from '../project';
import type { Project } from '../types';
it('exports the explicit legacy shape without leaking ephemeral or executable state', () => {
  const source = { ...structuredClone(fixture.input.project as unknown as Project), engineState: emptyEngineState() };
  const exported = legacyProject(source);
  expect(exported).not.toHaveProperty('engineState');
  expect(exported.schemaVersion).toBe(1);
  expect(exported.structure).toEqual(source.structure);
  expect(validateProject(JSON.parse(JSON.stringify(exported)))).toEqual(exported);
  exported.structure[0].lines[0].text = 'Edited backup';
  expect(source.structure[0].lines[0].text).not.toBe('Edited backup');
});
