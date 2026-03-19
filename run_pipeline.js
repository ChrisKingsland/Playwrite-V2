/**
 * run_pipeline.js
 * ---------------
 * Reads promptList.txt line by line (format: "Title, Prompt"),
 * runs the Playwright crossword generator for each entry at 3 difficulty levels,
 * then runs the Python CSV parser on each output HTML.
 *
 * Usage:
 *   node run_pipeline.js
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const PROMPT_FILE    = 'promptList.txt';
const RAW_HTML_DIR   = 'rawhtmls';
const PARSED_CSV_DIR = 'parsedCSVs';
const PYTHON_SCRIPT  = 'parse_crossword.py';
const PYTHON_CMD     = process.platform === 'win32' ? 'python' : 'python3';

const DIFFICULTIES = [
  { name: 'easy',   spec: 'tests/easycrossword.spec.ts'   },
  { name: 'medium', spec: 'tests/mediumcrossword.spec.ts' },
  { name: 'hard',   spec: 'tests/hardcrossword.spec.ts'   },
];
// ─────────────────────────────────────────────────────────────────────────────

console.log('Pipeline starting...');

function ensureDirs() {
  for (const diff of DIFFICULTIES) {
    const htmlDir = path.join(RAW_HTML_DIR, diff.name);
    const csvDir  = path.join(PARSED_CSV_DIR, diff.name);
    for (const dir of [htmlDir, csvDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created folder: ${dir}`);
      }
    }
  }
}

function loadPrompts() {
  if (!fs.existsSync(PROMPT_FILE)) {
    throw new Error(`'${PROMPT_FILE}' not found.`);
  }

  const lines = fs.readFileSync(PROMPT_FILE, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  return lines.map((line, i) => {
    const commaIndex = line.indexOf(',');
    if (commaIndex === -1) {
      throw new Error(`Line ${i + 1} malformed: "${line}" — expected format: Title, Topic`);
    }
    return {
      title: line.slice(0, commaIndex).trim(),
      topic: line.slice(commaIndex + 1).trim(),
    };
  });
}

function runPlaywright(title, topic, specFile, htmlDir, htmlFilename) {
  const env = {
    ...process.env,
    PUZZLE_TITLE: title,
    PUZZLE_TOPIC: topic,
    OUTPUT_DIR:   htmlDir,
    OUTPUT_FILE:  htmlFilename,
  };

  console.log(`  ▶ Playwright [${path.basename(specFile, '.ts').replace('crossword', '').replace('.spec', '') || 'medium'}]: "${title}"`);

  try {
    execSync(
      `npx playwright test ${specFile} --project=chromium --reporter=line`,
      { env, stdio: 'inherit', timeout: 120000 }
    );
  } catch (err) {
    // Chromium may still have succeeded even if other browsers failed
  }
}

function runPythonParser(htmlPath, csvPath) {
  console.log(`  ▶ Parsing: ${path.basename(htmlPath)} → ${path.basename(csvPath)}`);
  try {
    execSync(
      `${PYTHON_CMD} "${PYTHON_SCRIPT}" "${htmlPath}" "${csvPath}"`,
      { stdio: 'inherit', timeout: 30000 }
    );
    return true;
  } catch (err) {
    console.error(`  ✗ Python parser failed for: ${htmlPath}`);
    return false;
  }
}

function main() {
  ensureDirs();

  const prompts = loadPrompts();
  console.log(`Found ${prompts.length} prompts × ${DIFFICULTIES.length} difficulties = ${prompts.length * DIFFICULTIES.length} total puzzles\n`);

  const results = [];

  for (let i = 0; i < prompts.length; i++) {
    const { title, topic } = prompts[i];

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[${i + 1}/${prompts.length}] "${title}" (${topic})`);
    console.log(`${'═'.repeat(60)}`);

    for (const diff of DIFFICULTIES) {
      const timestamp  = Date.now();
      const htmlDir    = path.join(RAW_HTML_DIR, diff.name);
      const csvDir     = path.join(PARSED_CSV_DIR, diff.name);
      const htmlFile   = `${timestamp}_PuzzleHTML.html`;
      const csvFile    = `${timestamp}_parsedCSV.csv`;
      const htmlPath   = path.join(htmlDir, htmlFile);
      const csvPath    = path.join(csvDir, csvFile);

      console.log(`\n  ── ${diff.name.toUpperCase()} ──`);

      runPlaywright(title, topic, diff.spec, htmlDir, htmlFile);

      if (!fs.existsSync(htmlPath)) {
        console.error(`  ✗ HTML not found at ${htmlPath} — skipping parse`);
        results.push({ title, difficulty: diff.name, success: false });
        continue;
      }

      const ok = runPythonParser(htmlPath, csvPath);
      results.push({ title, difficulty: diff.name, success: ok });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('PIPELINE COMPLETE — Summary:');
  console.log(`${'═'.repeat(60)}`);
  for (const r of results) {
    console.log(`  ${r.success ? '✓' : '✗'}  [${r.difficulty.padEnd(6)}] ${r.title}`);
  }
  const passed = results.filter(r => r.success).length;
  console.log(`\n${passed}/${results.length} puzzles completed successfully.`);
}

try {
  main();
} catch (err) {
  console.error('Fatal error:', err.message);
  process.exit(1);
}