import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const authoredLine = "I keep the copper compass close tonight";
const storageKey = 'lyriclab.projects.v1';
async function savedProject(page: Page) {
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).not.toBeNull();
  await expect(page.locator('.save-status')).toHaveText('Saved locally');
  return page.evaluate(key => {
    const projects = JSON.parse(localStorage.getItem(key)!);
    return projects.find((project: {id:string}) => project.id === localStorage.getItem('lyriclab.active'));
  }, storageKey);
}
async function exportJSON(page: Page, option?: string) {
  await page.getByRole('button', {name:'Export', exact:true}).click();
  if (option) await page.getByRole('button', {name:new RegExp(option)}).click();
  const promise = page.waitForEvent('download');
  await page.getByRole('button', {name:option?'Download export':'Download project',exact:true}).click();
  const download = await promise;
  const contents = await readFile((await download.path())!, 'utf8');
  await page.getByRole('button', {name:'Close dialog',exact:true}).click();
  return {json:JSON.parse(contents),contents,filename:download.suggestedFilename()};
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Song title")).toHaveValue(
    "Where the light goes",
  );
});

test("compiles structured tempo and genre edits into deterministic prompts", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Style prompt" }).click();
  const prompt = page.getByLabel("Compiled style prompt");
  await expect(prompt).toHaveValue(/92 BPM/);
  await page.getByLabel("Tempo in BPM").fill("108");
  await expect(prompt).toHaveValue(/108 BPM/);
  await page.getByRole("button", { name: "Add a genre" }).click();
  await page.getByLabel("Choose additional genre").selectOption("soul");
  await expect(prompt).toHaveValue(/neo-soul influences/);
  const text = await prompt.inputValue();
  await page.getByRole("tab", { name: "Song canvas" }).click();
  await page.getByRole("tab", { name: "Style prompt" }).click();
  await expect(prompt).toHaveValue(text);
});

test("preserves authored and locked lines during generation and after reopening", async ({
  page,
}) => {
  const verse = page.locator("#verse-1");
  await page.getByLabel("Song title").fill("Copper compass");
  await page.getByLabel("Verse 1 line 1", { exact: true }).fill(authoredLine);
  await verse.getByRole("button", { name: "Lock line 1", exact: true }).click();
  const second = page.getByLabel("Verse 1 line 2", { exact: true });
  const originalSecond = await second.inputValue();
  await verse
    .getByRole("button", { name: "Regenerate Verse 1", exact: true })
    .click();
  await expect(page.getByLabel("Verse 1 line 1", { exact: true })).toHaveValue(
    authoredLine,
  );
  await expect(
    verse.getByRole("button", { name: "Unlock line 1", exact: true }),
  ).toBeVisible();
  await expect(second).not.toHaveValue(originalSecond);
  // Authored content remains protected even after its explicit lock is removed.
  await verse
    .getByRole("button", { name: "Unlock line 1", exact: true })
    .click();
  await verse
    .getByRole("button", { name: "Regenerate Verse 1", exact: true })
    .click();
  await expect(page.getByLabel("Verse 1 line 1", { exact: true })).toHaveValue(
    authoredLine,
  );
  await verse.getByRole("button", { name: "Lock line 1", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.reload();
  await expect(page.getByLabel("Song title")).toHaveValue("Copper compass");
  await expect(page.getByLabel("Verse 1 line 1", { exact: true })).toHaveValue(
    authoredLine,
  );
  await expect(
    page
      .locator("#verse-1")
      .getByRole("button", { name: "Unlock line 1", exact: true }),
  ).toBeVisible();
});

test("adds a hook as a new section without overwriting existing lyrics", async ({
  page,
}) => {
  await page.getByLabel("Verse 1 line 1", { exact: true }).fill(authoredLine);
  const before = await page
    .locator(".lyric-line textarea")
    .evaluateAll((elements) =>
      elements.map((el) => (el as HTMLTextAreaElement).value),
    );
  await page.getByRole("tab", { name: "Hook lab" }).click();
  const selectedLines = await page
    .locator(".hook-card")
    .first()
    .locator("p")
    .allTextContents();
  await page.getByRole("button", { name: "Use this hook" }).first().click();
  await expect(page.locator(".lyric-section")).toHaveCount(5);
  const after = await page
    .locator(".lyric-line textarea")
    .evaluateAll((elements) =>
      elements.map((el) => (el as HTMLTextAreaElement).value),
    );
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after.slice(before.length)).toEqual(selectedLines);
  const saved = await savedProject(page);
  const section = saved.blueprint.sections.at(-1);
  const accepted = saved.document.sections.find((entry:{sectionId:string})=>entry.sectionId===section.id);
  const recipe = saved.recipes.find((record:{inputs:{sectionId:string}})=>record.inputs.sectionId===section.id);
  expect(section.hookArchetype).toBe('title-drop');
  expect(recipe.generationKey).toBe(section.generationKey);
  expect(recipe.rootSeed).toBe(saved.blueprint.rootSeed);
  expect(recipe.inputs.targetLineIds).toEqual(accepted.lines.map((line:{id:string})=>line.id));
  expect(accepted.lines.every((line:{recipeId:string})=>line.recipeId===recipe.id)).toBe(true);
});

test("downloads a portable project and imports its lyrics, blueprint and locks", async ({
  page,
}) => {
  await page.getByLabel("Song title").fill("Portable copper compass");
  await page.getByLabel("Verse 1 line 1", { exact: true }).fill(authoredLine);
  await page
    .locator("#verse-1")
    .getByRole("button", { name: "Lock line 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "Portable copper compass.lyriclab.json",
  );
  const contents = await readFile((await download.path())!, "utf8");
  const spec = JSON.parse(contents);
  expect(spec.schemaVersion).toBe(2);
  expect(spec.app).toBe("LyricLab");
  expect(spec.document.sections[0].lines[0]).toMatchObject({
    text: authoredLine,
    locked: true,
    origin: "authored",
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Song title").fill("Temporary changes");
  await page
    .getByLabel("Verse 1 line 1", { exact: true })
    .fill("Temporary words");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: Buffer.from(contents),
    });
  await expect(page.getByLabel("Song title")).toHaveValue(spec.blueprint.title);
  await expect(page.getByLabel("Verse 1 line 1", { exact: true })).toHaveValue(
    authoredLine,
  );
  await expect(
    page
      .locator("#verse-1")
      .getByRole("button", { name: "Unlock line 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Style prompt" }).click();
  await expect(page.getByLabel("Compiled style prompt")).toHaveValue(/92 BPM/);
});

test('keeps style and root seed stable through regeneration, reload and exact draft inspection', async ({page}) => {
  await page.getByRole('tab', {name:'Style prompt',exact:true}).click();
  const prompt = await page.getByLabel('Compiled style prompt').inputValue();
  const initial = await savedProject(page);
  await page.getByRole('tab', {name:'Song canvas',exact:true}).click();
  await page.locator('#verse-1').getByRole('button', {name:'Regenerate Verse 1',exact:true}).click();
  const generatedLine = await page.getByLabel('Verse 1 line 2',{exact:true}).inputValue();
  const generated = await savedProject(page);
  expect(generated.blueprint.rootSeed).toBe(initial.blueprint.rootSeed);
  expect(generated.blueprint.style).toEqual(initial.blueprint.style);
  expect(generated.recipes.length).toBe(1);
  const key = generated.blueprint.sections[0].generationKey;
  expect(generated.variations[key]).toBe(1);
  await page.reload();
  await expect(page.getByLabel('Verse 1 line 2',{exact:true})).toHaveValue(generatedLine);
  await page.getByRole('tab', {name:'Style prompt',exact:true}).click();
  await expect(page.getByLabel('Compiled style prompt')).toHaveValue(prompt);
  await page.getByRole('tab', {name:'Song canvas',exact:true}).click();
  await page.getByLabel('Verse 1 line 2',{exact:true}).fill('My later manual revision');
  await page.getByRole('button',{name:'Verify original draft',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Original draft inspection'})).toBeVisible();
  expect(await page.getByLabel('Replayed original draft').inputValue()).toContain(generatedLine);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.getByLabel('Verse 1 line 2',{exact:true})).toHaveValue('My later manual revision');
  await page.locator('#verse-1').getByRole('button', {name:'Regenerate Verse 1',exact:true}).click();
  const after = await savedProject(page);
  expect(after.variations[key]).toBe(2);
  expect(after.recipes[0]).toEqual(generated.recipes[0]);
  expect(after.blueprint.rootSeed).toBe(initial.blueprint.rootSeed);
  expect(after.blueprint.style).toEqual(initial.blueprint.style);
});

test('exports descriptive SongSpec and explicit legacy compatibility backups separately', async ({page}) => {
  await page.getByLabel('Verse 1 line 1',{exact:true}).fill(authoredLine);
  const spec = await exportJSON(page, 'SongSpec JSON');
  expect(spec.json.format).toBe('SongSpec'); expect(spec.json.schemaVersion).toBe(1);
  expect(spec.json.sections[0].lyrics[0]).toBe(authoredLine);
  expect(spec.json.style.genres[0]).toHaveProperty('label');
  expect(spec.json).not.toHaveProperty('recipes'); expect(spec.json).not.toHaveProperty('document');
  const legacy = await exportJSON(page, 'Legacy project JSON');
  expect(legacy.json.app).toBe('LyricLab'); expect(legacy.json.schemaVersion).toBe(1);
  expect(legacy.json.structure[0].lines[0].text).toBe(authoredLine);
  expect(legacy.json).not.toHaveProperty('engineState');
});

test('previews dialect changes with explicit authorship, section protection and reversible apply', async ({page}) => {
  const verse = page.locator('#verse-1'), original = 'An apartment beside the sidewalk';
  await page.getByLabel('Verse 1 line 1',{exact:true}).fill(original);
  await verse.getByRole('button',{name:'Lock Verse 1',exact:true}).click();
  await page.locator('.blueprint').getByRole('button',{name:/^Language/}).click();
  await page.locator('.blueprint select').filter({has:page.locator('option').filter({hasText:'British English'})}).selectOption('British English');
  const strength = page.getByLabel('Dialect strength');
  await strength.focus(); await strength.press('Home'); await strength.press('ArrowRight'); await strength.press('ArrowRight');
  await page.getByRole('button',{name:'Preview guidance'}).click();
  const allow = page.getByLabel('Allow dialect changes to authored text');
  await allow.check();
  await expect(page.locator('.dialect-result').first()).toHaveText(original);
  await page.getByRole('button',{name:'Apply to selected section',exact:true}).click();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.getByLabel('Verse 1 line 1',{exact:true})).toHaveValue(original);
  await verse.getByRole('button',{name:'Unlock Verse 1',exact:true}).click();
  await page.getByRole('button',{name:'Preview guidance'}).click();
  await allow.uncheck();
  await expect(page.locator('.dialect-result').first()).toHaveText(original);
  await allow.check();
  await expect(page.locator('.dialect-result').first()).toHaveText('An flat beside the pavement');
  await page.getByRole('button',{name:'Apply to selected section',exact:true}).click();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.getByLabel('Verse 1 line 1',{exact:true})).toHaveValue('An flat beside the pavement');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByLabel('Verse 1 line 1',{exact:true})).toHaveValue(original);
});

test('keeps accepted text accessible when an imported generation dependency is unavailable', async ({page}) => {
  const exported = await exportJSON(page);
  exported.json.blueprint.style.genres = [{id:'genre:not-installed',weight:1}];
  await page.locator('input[type=file]').setInputFiles({name:'unavailable.lyriclab.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported.json))});
  const original = await page.getByLabel('Verse 1 line 2',{exact:true}).inputValue();
  await page.locator('#verse-1').getByRole('button',{name:'Regenerate Verse 1',exact:true}).click();
  await expect(page.locator('.toast')).toContainText(/unavailable|missing|not installed/i);
  await expect(page.getByLabel('Verse 1 line 2',{exact:true})).toHaveValue(original);
  await page.getByLabel('Verse 1 line 1',{exact:true}).fill(authoredLine);
  await expect(page.locator('.inspector')).toContainText('SYLLABLE');
  const preserved = await exportJSON(page);
  expect(preserved.json.blueprint.style.genres).toEqual([{id:'genre:not-installed',weight:1}]);
  expect(preserved.json.document.sections[0].lines[0].text).toBe(authoredLine);
});

test('protects a corrupt saved library while permitting export of an editable recovery project', async ({page}) => {
  const corrupt = '{this original library is corrupt';
  await page.evaluate(({key,value}) => localStorage.setItem(key,value), {key:storageKey,value:corrupt});
  await page.reload();
  await expect(page.locator('.error-banner')).toContainText(/could not be read/i);
  await page.getByLabel('Song title').fill('Recovery draft');
  // Verify after the documented 450ms autosave boundary has elapsed.
  await page.waitForTimeout(650);
  expect(await page.evaluate(key => localStorage.getItem(key),storageKey)).toBe(corrupt);
  await page.getByRole('button',{name:'My projects',exact:true}).first().click();
  await page.getByRole('button',{name:/^Duplicate /}).first().click();
  await expect(page.locator('.project-item')).toHaveCount(2);
  expect(await page.evaluate(key => localStorage.getItem(key),storageKey)).toBe(corrupt);
  await page.getByRole('button',{name:/^Delete .*copy/}).click();
  await expect(page.locator('.project-item')).toHaveCount(1);
  expect(await page.evaluate(key => localStorage.getItem(key),storageKey)).toBe(corrupt);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  const exported = await exportJSON(page);
  expect(exported.json.blueprint.title).toBe('Recovery draft');
  expect(await page.evaluate(key => localStorage.getItem(key),storageKey)).toBe(corrupt);
});

test('reports a storage-full failure while preserving an in-memory duplicate and the previous backup', async ({page}) => {
  await savedProject(page);
  const original = await page.evaluate(key=>localStorage.getItem(key),storageKey);
  await page.evaluate(key => {
    const originalSetItem = Storage.prototype.setItem;
    Object.defineProperty(Storage.prototype,'setItem',{configurable:true,writable:true,value:function(this:Storage,storedKey:string,value:string) {
      if (storedKey===key) throw new DOMException('Storage quota exceeded','QuotaExceededError');
      originalSetItem.call(this,storedKey,value);
    }});
  },storageKey);
  await page.getByRole('button',{name:'My projects',exact:true}).first().click();
  await page.getByRole('button',{name:/^Duplicate /}).first().click();
  await expect(page.locator('.project-item')).toHaveCount(2);
  await expect(page.locator('.save-status')).toHaveText('Save unavailable');
  await expect(page.locator('.error-banner')).toContainText(/unavailable|full/i);
  expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBe(original);
});

test("reloads and performs editing, compilation and generation with networking disabled", async ({
  page,
  context,
}) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await page.getByLabel("Song title").fill("Offline compass");
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Song title")).toHaveValue("Offline compass");
  await page.getByLabel("Verse 1 line 1", { exact: true }).fill(authoredLine);
  await page
    .locator("#verse-1")
    .getByRole("button", { name: "Regenerate Verse 1", exact: true })
    .click();
  await expect(page.getByLabel("Verse 1 line 1", { exact: true })).toHaveValue(
    authoredLine,
  );
  await page.getByRole("tab", { name: "Style prompt" }).click();
  await page.getByLabel("Tempo in BPM").fill("102");
  await expect(page.getByLabel("Compiled style prompt")).toHaveValue(/102 BPM/);
  await page.getByRole("tab", { name: "Hook lab" }).click();
  await expect(page.locator(".hook-card")).toHaveCount(3);
  await page.getByRole("button", { name: "New variations" }).click();
  await expect(page.locator(".hook-card")).toHaveCount(3);
});

test('keeps duplicated projects when a pending autosave finishes', async ({ page }) => {
  await page.getByLabel('Song title').fill('Latest title');
  await page.getByRole('button', {name:'My projects', exact:true}).first().click();
  await page.getByRole('button', {name:/Duplicate/}).first().click();
  await expect(page.locator('.project-item')).toHaveCount(2);
  await expect(page.locator('.project-item').last()).toContainText('Latest title (copy)');
  await expect(page.locator('.save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('button', {name:'My projects', exact:true}).first().click();
  await expect(page.locator('.project-item')).toHaveCount(2);
  await expect(page.locator('.project-item').last()).toContainText('Latest title (copy)');
});

test('provides blueprint and analysis controls on a narrow screen', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', {name:'Toggle blueprint'}).click();
  await expect(page.locator('.blueprint')).toBeVisible();
  await page.getByRole('button', {name:'Toggle blueprint'}).click();
  await page.getByRole('button', {name:'Toggle inspector'}).click();
  await expect(page.getByLabel('Section delivery')).toBeVisible();
  await page.getByLabel('Section delivery').selectOption('Short / clipped');
  await expect(page.locator('.target-note')).toContainText('4–7 syllables');
  await page.getByRole('button', {name:'Close inspector'}).click();
  await expect(page.locator('.inspector')).not.toBeVisible();
});
