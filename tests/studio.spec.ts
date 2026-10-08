import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const authoredLine = "I keep the copper compass close tonight";

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
  expect(spec.schemaVersion).toBe(1);
  expect(spec.app).toBe("LyricLab");
  expect(spec.structure[0].lines[0]).toMatchObject({
    text: authoredLine,
    locked: true,
    authored: true,
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
  await expect(page.getByLabel("Song title")).toHaveValue(spec.title);
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
