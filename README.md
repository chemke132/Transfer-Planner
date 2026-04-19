# Transfer Planner

California CC 학생들이 TAG/Transfer용 수업을 학기별로 플래닝하는 웹앱.
MVP: DVC(Diablo Valley College) CS 전공 기준.

## Getting started

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 채우기
npm run dev
```

Supabase 프로젝트 만든 뒤 `supabase/schema.sql`을 SQL 에디터에 실행.

## Structure

- `src/pages/` — Setup, Requirements, Planner
- `src/components/` — Requirements(CourseList, CoursePath) / Planner(SemesterColumn, CourseCard, AutoPlanButton)
- `src/lib/supabase.js` — Supabase 클라이언트
- `src/lib/topologicalSort.js` — 위상 정렬 + 자동 학기 배치
- `src/data/seed.js` — Supabase 연결 전 시드 데이터
- `scraper/` — assist.org Python + Playwright 스크래퍼
- `supabase/schema.sql` — DB 스키마
- `.github/workflows/scrape.yml` — 학기마다 자동 스크래핑
