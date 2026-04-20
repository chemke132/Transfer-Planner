# Transfer Planner

A web app for California community college students planning their TAG / transfer
coursework, semester by semester. Pulls articulation data from
[assist.org](https://assist.org) so students see exactly which CC courses count
toward their target UC major.

Current coverage: **Diablo Valley College → UC Berkeley** (96 majors, 74% with
full articulation data). UCLA / UCSD / CSU scrapes are planned.

## Features

- **Setup** — pick your CC and target UC major.
- **Requirements → Major** — shows the exact CC courses you need, including
  OR-branches (e.g. "COMPSCI 61A = COMSC 140 *or* COMSC 240 + MATH 192").
- **Requirements → Cal-GETC** — pick courses for each GE area. Areas already
  covered by your major (e.g. Math 2, Science 5A/5B/5C for EECS) are auto-filled
  and disabled so you don't double-book.
- **Requirements → Course Path** — flat, top-to-bottom reading order of every
  course, sorted so prereqs come before their dependents.
- **Planner** — drag courses into semesters. AutoPlan packs them into a valid
  prereq-respecting schedule in two phases (major first, then GE).

## Getting started

```bash
npm install
cp .env.example .env   # fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev
```

Create a Supabase project, then run `supabase/schema.sql` in the SQL editor.
To seed data, either run the scraper (see below) or load `supabase/seed.sql`
for a minimal DVC → UCB CS example.

## Project layout

- `src/pages/` — Setup, Requirements, Planner
- `src/components/Requirements/` — `MajorList`, `CalGetcSelector`, `CoursePath`
- `src/components/Planner/` — `SemesterColumn`, `CourseCard`, `AutoPlanButton`
- `src/hooks/` — `useAppData` (Supabase cache), `useSetup`, `useOrChoices`,
  `useCalGetcSelections`
- `src/lib/supabase.js` — Supabase client
- `src/lib/topologicalSort.js` — topological sort + semester packing
- `src/data/seed.js` — fallback seed data when Supabase is unreachable
- `scraper/` — Python scrapers (see below)
- `supabase/schema.sql` — DB schema
- `.github/workflows/scrape.yml` — scheduled re-scrape each semester

## Scraper

Two independent scrapers feed the database:

- `scraper/scrape_all.py` — assist.org articulation for a whole UC campus.
  Walks the agreements list, fetches per-major articulation JSON (cached to
  `scraper/samples/cache/`), parses, and upserts into `target_majors`,
  `transfer_paths`, `courses`, `path_articulations`, `path_articulation_options`,
  and `path_requirements`. Respects 429 / `Retry-After` with exponential backoff.
- `scraper/dvc_catalog.py` + `scraper/upsert_catalog.py` — DVC course catalog
  (names, units, prerequisite chains) for subjects the articulation data
  references. Currently covers COMSC / MATH / PHYS / ENGL / CHEM; extend as
  new majors pull in new departments.

### Running manually

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Articulation for an entire UC campus
python scrape_all.py --uc-id ucb --receiving "University of California, Berkeley"

# DVC catalog refresh
python dvc_catalog.py > samples/dvc_catalog_YYYYMMDD.json
python upsert_catalog.py samples/dvc_catalog_YYYYMMDD.json --school-id dvc
```

Required env (in `scraper/.env` or exported):

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Tech stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS v4, @dnd-kit for the planner
- **Backend**: Supabase (Postgres + row-level-security-friendly read-only
  client, service role used only from the scraper)
- **Scraper**: Python + httpx (assist.org JSON API) and BeautifulSoup for the
  DVC catalog pages
- **Deploy**: Vercel (planned)
