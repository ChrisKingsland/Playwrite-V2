# Crossword Pipeline

Automatically generates crossword puzzles at 3 difficulty levels from a list of prompts and exports each one as a parsed CSV.

## How It Works

1. Reads `promptList.txt` for puzzle titles and topics
2. For each entry, runs a Playwright (Chromium) script at each difficulty level, creating the puzzle on PuzzleMe and saving the HTML
3. Parses each HTML with Python and outputs a structured CSV

**10 prompts × 3 difficulties = 30 puzzles total per run**

## Project Structure

```
├── run_pipeline.js               # Orchestrator — run this
├── parse_crossword.py            # Parses HTML → CSV
├── promptList.txt                # Your list of puzzles to generate
├── tests/
│   ├── easycrossword.spec.ts     # Playwright script — 11x11 grid
│   ├── mediumcrossword.spec.ts   # Playwright script — 15x15 grid
│   └── hardcrossword.spec.ts     # Playwright script — 20x20 grid
├── rawhtmls/
│   ├── easy/                     # Generated HTMLs (auto-created)
│   ├── medium/
│   └── hard/
└── parsedCSVs/
    ├── easy/                     # Output CSVs (auto-created)
    ├── medium/
    └── hard/
```

## Setup

Install Python dependency:
```bash
pip install beautifulsoup4
```

Install Playwright browsers (if not already done):
```bash
npx playwright install chromium
```

## Usage

1. Edit `promptList.txt` — one puzzle per line, comma separated:
   ```
   Space Exploration, Space
   Ocean Life, Ocean
   Ancient Egypt, Egypt
   ```

2. Run the pipeline:
   ```bash
   node run_pipeline.js
   ```

3. Find your CSVs in `parsedCSVs/easy`, `parsedCSVs/medium`, `parsedCSVs/hard`

## Output

Each CSV is named `{unix_timestamp}_parsedCSV.csv` and contains one row per clue with these columns:

`Series, Puzzle ID, Puzzle Type, Title, Publish Time, Author, Tags, Start Message, Notes, Starting X, Starting Y, Clue Number, Across Clue, Answer, Clue, Question Text, Incorrect Options, Correct Option, Explanation, Puzzle Data`

## Notes

- Only Chromium is used — Firefox and WebKit are skipped
- Old files in `rawhtmls/` can be left in place — filenames are unique per run
- Each puzzle takes ~30–60 seconds due to Playwright load time — 30 puzzles will take roughly 15–30 minutes
- Lines starting with `#` in `promptList.txt` are treated as comments and skipped