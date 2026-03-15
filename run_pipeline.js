/**
 * run_pipeline.js
 * ---------------
 * Reads promptList.txt line by line (format: "Title, Prompt"),
 * runs the Playwright crossword generator for each entry,
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
const SPEC_FILE      = 'tests/crossword.spec.ts';
const PYTHON_SCRIPT  = 'parse_crossword.py';
const PYTHON_CMD     = process.platform === 'win32' ? 'python' : 'python3';
// ─────────────────────────────────────────────────────────────────────────────

console.log('Pipeline starting...');

function ensureDirs() {
  for (const dir of [RAW_HTML_DIR, PARSED_CSV_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created folder: ${dir}`);
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

function runPlaywright(title, topic, htmlFilename) {
  const env = {
    ...process.env,
    PUZZLE_TITLE: title,
    PUZZLE_TOPIC: topic,
    OUTPUT_DIR:   RAW_HTML_DIR,
    OUTPUT_FILE:  htmlFilename,
  };

  console.log(`\n▶ Playwright: "${title}" (topic: ${topic})`);

  try {
    execSync(
      `npx playwright test ${SPEC_FILE} --project=chromium --reporter=line`,
      { env, stdio: 'inherit', timeout: 120000 }
    );
    return true;
  } catch (err) {
    console.error(`✗ Playwright failed for "${title}"`);
    return false;
  }
}

function runPythonParser(htmlPath, csvPath) {
  console.log(`▶ Parsing: ${path.basename(htmlPath)} → ${path.basename(csvPath)}`);
  try {
    execSync(
      `${PYTHON_CMD} "${PYTHON_SCRIPT}" "${htmlPath}" "${csvPath}"`,
      { stdio: 'inherit', timeout: 30000 }
    );
    return true;
  } catch (err) {
    console.error(`✗ Python parser failed for: ${htmlPath}`);
    return false;
  }
}

function main() {
  ensureDirs();

  const prompts = loadPrompts();
  console.log(`Found ${prompts.length} prompts in ${PROMPT_FILE}`);

  const results = [];

  for (let i = 0; i < prompts.length; i++) {
    const { title, topic } = prompts[i];
    const timestamp = Date.now();

    const htmlFilename = `${timestamp}_PuzzleHTML.html`;
    const csvFilename  = `${timestamp}_parsedCSV.csv`;
    const htmlPath     = path.join(RAW_HTML_DIR, htmlFilename);
    const csvPath      = path.join(PARSED_CSV_DIR, csvFilename);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${i + 1}/${prompts.length}] "${title}" | "${topic}"`);
    console.log(`${'─'.repeat(60)}`);

    runPlaywright(title, topic, htmlFilename);

    if (!fs.existsSync(htmlPath)) {
      console.error(`  Skipping Python parse — HTML not found at ${htmlPath}`);
      results.push({ title, success: false });
      continue;
    }

    const pythonOk = runPythonParser(htmlPath, csvPath);
    results.push({ title, success: pythonOk });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('PIPELINE COMPLETE — Summary:');
  console.log(`${'═'.repeat(60)}`);
  for (const r of results) {
    console.log(`  ${r.success ? '✓' : '✗'}  ${r.title}`);
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