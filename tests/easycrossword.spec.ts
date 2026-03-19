import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('generate crossword', async ({ page }) => {
  const title     = process.env.PUZZLE_TITLE ?? 'Default Title';
  const topic     = process.env.PUZZLE_TOPIC ?? 'General';
  const outputDir = process.env.OUTPUT_DIR   ?? 'rawhtmls/easy';
  const filename  = process.env.OUTPUT_FILE  ?? `${Date.now()}_PuzzleHTML.html`;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await page.goto('https://puzzleme.amuselabs.com/pmm/puzzle-create');

  await page.getByText('Crossword Crosswords of any').click();
  await page.locator('.widget').first().click();

  await page.locator('#title').fill(title);
  await page.getByRole('textbox', { name: /Enter a topic/i }).fill(topic);

  // Change grid size to 11x11 (easy)
  await page.getByRole('combobox', { name: '× 15' }).click();
  await page.getByTitle('× 11').click();

  await page.locator('div').filter({ hasText: 'Create game' }).nth(3).click();

  await page.waitForURL('**/preview**');

  await page.locator('div').filter({ hasText: 'Edit grid & clues' }).nth(3).click();

  await page.waitForLoadState('networkidle');

  const html = await page.content();
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, html);

  console.log(`HTML saved to: ${outputPath}`);
});