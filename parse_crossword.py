"""
parse_crossword.py
------------------
Parses a solved crossword puzzle HTML file (PuzzleMe/AmuseLabs format)
and exports clue data to a CSV file.

Requirements:
    pip install beautifulsoup4

Usage:
    # Default (reads puzzle_page.html, writes crossword_puzzle.csv)
    python parse_crossword.py

    # With explicit input/output paths (used by run_pipeline.ts)
    python parse_crossword.py path/to/input.html path/to/output.csv
"""

from bs4 import BeautifulSoup
import re
import csv
import os
import sys

# ── Config (defaults, overridden by CLI args if provided) ─────────────────────
INPUT_FILE  = "puzzle_page.html"
OUTPUT_FILE = "crossword_puzzle.csv"

if len(sys.argv) >= 3:
    INPUT_FILE  = sys.argv[1]
    OUTPUT_FILE = sys.argv[2]
elif len(sys.argv) == 2:
    INPUT_FILE  = sys.argv[1]
# ─────────────────────────────────────────────────────────────────────────────


def load_html(path):
    with open(path, "r", encoding="utf-8") as f:
        return BeautifulSoup(f.read(), "html.parser")


def parse_title(soup):
    tag = soup.find("title")
    return tag.get_text(strip=True) if tag else ""


def parse_clues(soup):
    across_clues = {}
    down_clues   = {}
    clue_lists = soup.find_all("div", class_="clue-list")
    for i, cl in enumerate(clue_lists):
        for cd in cl.find_all("div", class_="clueDiv"):
            num  = cd.find("div",  class_="clueNum").get_text(strip=True)
            text = cd.find("span", class_="clueText").get_text(strip=True)
            if i == 0:
                across_clues[num] = text
            else:
                down_clues[num] = text
    return across_clues, down_clues


def parse_grid(soup):
    crossword = soup.find("div", class_="crossword")
    grid = []
    row  = []
    for child in crossword.children:
        if not hasattr(child, "get"):
            continue
        classes = child.get("class", [])
        if "endRow" in classes:
            if row:
                grid.append(row)
                row = []
            continue
        if "box" not in classes:
            continue
        letter_span  = child.find("span", class_="letter-in-box")
        cluenum_span = child.find("span", class_="cluenum-in-box")
        letter  = letter_span.get_text(strip=True)  if letter_span  else ""
        cluenum = cluenum_span.get_text(strip=True) if cluenum_span else ""
        cluenum = re.sub(r"\u200d", "", cluenum).strip()
        is_letter = "letter" in classes
        row.append({
            "letter":    letter if is_letter else "#",
            "cluenum":   cluenum,
            "is_letter": is_letter,
        })
    if row:
        grid.append(row)
    return grid


def clue_positions(grid):
    positions = {}
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            if cell["cluenum"]:
                positions[cell["cluenum"]] = (r, c)
    return positions


def get_across_answer(grid, start_r, start_c):
    cols = len(grid[start_r])
    ans, c = "", start_c
    while c < cols and grid[start_r][c]["is_letter"]:
        ans += grid[start_r][c]["letter"]
        c   += 1
    return ans


def get_down_answer(grid, start_r, start_c):
    rows = len(grid)
    ans, r = "", start_r
    while r < rows and grid[r][start_c]["is_letter"]:
        ans += grid[r][start_c]["letter"]
        r   += 1
    return ans


def build_puzzle_data(grid):
    rows = []
    for row in grid:
        rows.append("".join(cell["letter"] if cell["is_letter"] else "." for cell in row))
    return "|".join(rows)


def build_csv_rows(title, across_clues, down_clues, grid):
    positions   = clue_positions(grid)
    puzzle_data = build_puzzle_data(grid)
    fieldnames = [
        "Series", "Puzzle ID", "Puzzle Type", "Title", "Publish Time",
        "Author", "Tags", "Start Message", "Notes",
        "Starting X", "Starting Y", "Clue Number", "Across Clue",
        "Answer", "Clue", "Question Text", "Incorrect Options",
        "Correct Option", "Explanation", "Puzzle Data",
    ]
    def base_row():
        return {k: "" for k in fieldnames}
    rows = []
    for num, clue_text in sorted(across_clues.items(), key=lambda x: int(x[0])):
        r, c = positions.get(num, (None, None))
        answer = get_across_answer(grid, r, c) if r is not None else ""
        row = base_row()
        row.update({
            "Puzzle Type": "Crossword",
            "Title":       title,
            "Starting X":  c if c is not None else "",
            "Starting Y":  r if r is not None else "",
            "Clue Number": num,
            "Across Clue": "Across",
            "Answer":      answer,
            "Clue":        clue_text,
            "Puzzle Data": puzzle_data,
        })
        rows.append(row)
    for num, clue_text in sorted(down_clues.items(), key=lambda x: int(x[0])):
        r, c = positions.get(num, (None, None))
        answer = get_down_answer(grid, r, c) if r is not None else ""
        row = base_row()
        row.update({
            "Puzzle Type": "Crossword",
            "Title":       title,
            "Starting X":  c if c is not None else "",
            "Starting Y":  r if r is not None else "",
            "Clue Number": num,
            "Across Clue": "Down",
            "Answer":      answer,
            "Clue":        clue_text,
            "Puzzle Data": puzzle_data,
        })
        rows.append(row)
    return rows, fieldnames


def write_csv(rows, fieldnames, output_path):
    out_dir = os.path.dirname(output_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    if not os.path.exists(INPUT_FILE):
        print("ERROR: Input file '{}' not found.".format(INPUT_FILE))
        sys.exit(1)
    print("Reading: {}".format(INPUT_FILE))
    soup = load_html(INPUT_FILE)
    title                    = parse_title(soup)
    across_clues, down_clues = parse_clues(soup)
    grid                     = parse_grid(soup)
    print("  Title : {}".format(title))
    print("  Grid  : {} rows x {} cols".format(len(grid), len(grid[0]) if grid else 0))
    print("  Clues : {} across, {} down".format(len(across_clues), len(down_clues)))
    rows, fieldnames = build_csv_rows(title, across_clues, down_clues, grid)
    write_csv(rows, fieldnames, OUTPUT_FILE)
    print("Written {} rows -> {}".format(len(rows), OUTPUT_FILE))


if __name__ == "__main__":
    main()