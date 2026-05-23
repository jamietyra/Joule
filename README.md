# Joule

> **AI에게, 자기가 쓴 전기 요금을 청구하는 에이전트.**

Joule은 **Carbon-aware AI Gateway** — LLM 호출의 탄소·비용을 실시간으로 추적하고, 작업마다 "충분한 최소 모델"을 자동 선택해 절감을 최대화하는 OpenAI 호환 프록시입니다.

**DevNetwork [AI+ML] Hackathon 2026 — Crusoe 챌린지 출품작.**

## 1줄 진입점 — base_url Diff

기존 OpenAI 클라이언트의 `base_url` 한 줄만 바꾸면 됩니다:

```python
# Before
client = OpenAI(api_key="sk-...", base_url="https://api.openai.com/v1")

# After (route through Joule)
client = OpenAI(api_key="any", base_url="http://localhost:3001/v1")
```

이후 모든 요청은:
1. Joule이 intent를 분류 (Nano ~10ms)
2. 자동으로 Nemotron Nano(요약) 또는 Super(추론·코드) 라우팅
3. Crusoe Managed Inference 호출
4. `X-Carbon-grams` 헤더 추출 + 정적 환산표 fallback (Defensive)
5. SQLite call log 기록
6. OpenAI 호환 응답 반환

## Quick Start

```bash
# 1. 의존성 설치
npm install

# 2. .env 설정
cp .env.example .env
# .env 에 CRUSOE_API_KEY 채우기

# 3. Joule core 기동 (localhost:3001)
npm run dev

# 4. Dashboard 기동 (localhost:3000, 별도 터미널)
cd dashboard && npm install && npm run dev

# 5. Hermes 주간 리포트 (dry-run preview)
npx tsx hermes/index.ts run weekly-report --dry-run \
  --db ./joule.db --to demo@example.com \
  --output /tmp/weekly-report-preview.html

# 6. Persona seed (대시보드 차트 데이터)
npx tsx scripts/generate_personas.ts --seed 42
```

## Architecture

Local-first. 모든 process가 같은 머신에서 동작:

- **Joule core** — Hono on Node 20, localhost:3001 (Gateway + Routing + Inference + Carbon + Storage 5 module)
- **Dashboard** — Next.js 14 app router, localhost:3000 (recharts + SQLite read)
- **Hermes** — CLI binary (manual trigger v0.1; 자율 cron post-hackathon)
- **공유 상태** — `./joule.db` (better-sqlite3 WAL)

외부 호스팅 없음 (Vercel/Railway 없음). 정적 landing만 GitHub Pages.

## 5컷 데모

- `scripts/verify-shot-1.sh` — BaseURLDiff (chatcmpl- id 응답)
- `scripts/verify-shot-2.sh` — AutoModelSelection (summarize→nano, code→super)
- `scripts/verify-shot-3.sh` — Dashboard cumulative (live data point)
- `scripts/verify-shot-4.sh` — Hermes dry-run preview (3-block HTML)
- `scripts/verify-shot-5.sh` — XCarbonGrams source label (static/header)

## 데모 영상

(녹화 후 placeholder 교체)

- YouTube: `<TODO>`
- 길이: ~2:30
- 5컷 라이브 + 카메라 컷

## 개발

- Test: `npm test` — 33 tests across 7 files
- Typecheck: `npm run typecheck`
- Pre-commit: `pre-commit install` (auto-formatter + detect-secrets + tsc)

## License

MIT — see [LICENSE](./LICENSE).
