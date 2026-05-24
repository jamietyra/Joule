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

# 5. Hermes 에이전트 — 자연어 질문 (Joule 가 떠있어야 함)
npx tsx hermes/index.ts ask "이번 주 절감 얼마야?"

# 5b. Hermes 주간 리포트 — dry-run preview (선택)
npx tsx hermes/index.ts run weekly-report --dry-run \
  --db ./joule.db --to demo@example.com \
  --output ./weekly-report-preview.html

# 6. Persona seed (대시보드 차트 데이터)
npx tsx scripts/generate_personas.ts --seed 42
```

## Hermes Agent (자연어로 물어보기)

Hermes 는 Joule 호출 로그를 읽는 read-only 자연어 에이전트입니다. **Joule 자체의 OpenAI 호환 endpoint(`localhost:3001/v1`) 를 거쳐 Crusoe Nemotron 을 호출**하므로 Hermes 의 LLM 호출도 자기 카본을 측정 받습니다 — self-reference.

### CLI

```bash
npx tsx hermes/index.ts ask "이번 주 절감 얼마야?"
npx tsx hermes/index.ts ask "Top 3 비싼 호출은?"
npx tsx hermes/index.ts ask "Super 와 Nano 비율?"
```

### Dashboard 채팅창

`http://localhost:3000` 의 통계 패널 아래 채팅창에서 자연어 입력. 예시 칩 4개 클릭으로 즉시 질문 가능.

### 도구 (5개, 모두 시연 가능)

| 도구 | 자연어 예 | Effect |
|---|---|---|
| `getAggregateSavings` | "이번 주 절감 얼마야?" | read-only |
| `getTopCalls(n)` | "Top 3 비싼 호출은?" | read-only |
| `getModelMix` | "Super 와 Nano 비율?" | read-only |
| `generateReport` | "리포트 만들어줘" | file-write |
| `sendWeeklyReport(to)` | "jamie@example.com 으로 리포트 보내" | external (SMTP) |

### 안전 가드

- 입력 길이 캡 (2000자) — prompt injection 방지
- `getTopCalls(n)` 의 `n` 은 1~10 클램프
- `HERMES_FORCE_DRY_RUN=true` env 로 sendWeeklyReport 를 파일 출력만으로 강제 전환 (시연 환경 권장)
- 도구 이름은 화이트리스트 검증 (임의 실행 차단)
- LLM 응답 JSON 파싱 실패 → 안전한 자연어 폴백 답변

### 아키텍처 (Hermes 단계별)

```
사용자 입력 ("Top 3 비싼 호출 보여줘")
   ↓
Planner (Super) → JSON 도구 결정
   {"tool":"getTopCalls","args":{"n":3}}
   ↓
Executor → 도구 실행 (SQLite read)
   [{id, modelId, cost, ...}, ...]
   ↓
Responder (Nano) → 한국어 1~3 문장 요약
   "가장 비쌌던 호출 3건은..."
```

3 단계 모두 Joule 자체 endpoint 거침 = Hermes 도 카본 측정 대상.

## Architecture

Local-first. 모든 process가 같은 머신에서 동작:

- **Joule core** — Hono on Node 20, localhost:3001 (Gateway + Routing + Inference + Carbon + Storage 5 module)
- **Dashboard** — Next.js 14 app router, localhost:3000 (recharts + SQLite read)
- **Hermes** — CLI binary (manual trigger v0.1; 자율 cron post-hackathon)
- **공유 상태** — `./joule.db` (better-sqlite3 WAL)

외부 호스팅 없음 (Vercel/Railway 없음). 정적 landing만 GitHub Pages.

## 6컷 데모 검증

각 스크립트는 Joule core(:3001) 또는 Dashboard(:3000) 가 실행 중일 때 동작합니다.

- `scripts/verify-shot-1.sh` — BaseURLDiff (chatcmpl- id 응답)
- `scripts/verify-shot-2.sh` — AutoModelSelection (summarize→nano, code→super)
- `scripts/verify-shot-3.sh` — Dashboard cumulative (live data point)
- `scripts/verify-shot-4.sh` — Hermes 주간 리포트 dry-run (HTML preview)
- `scripts/verify-shot-5.sh` — XCarbonGrams source label (static/header)
- `scripts/verify-shot-6.sh` — **Hermes 자연어 chat (자연어 → 도구 → 답)**

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
