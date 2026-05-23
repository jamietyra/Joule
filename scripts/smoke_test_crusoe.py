#!/usr/bin/env python3
"""Crusoe Managed Inference 스모크 테스트.

표준 라이브러리만 사용 — pip 설치 불필요. 6일 일정의 최대 리스크인
"Crusoe API 첫 호출"을 가장 먼저, 가장 단순하게 깨기 위한 스크립트.

실행:
    python scripts/smoke_test_crusoe.py

키 로드:
    같은 저장소 루트의 .env 에서 CRUSOE_API_KEY / CRUSOE_BASE_URL 을 읽는다.
    .env 는 .gitignore 로 제외됨 — 키는 절대 코드/커밋에 두지 않는다.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
DEFAULT_BASE_URL = "https://api.inference.crusoecloud.com/v1"


def load_env(path: Path) -> dict[str, str]:
    """단순 KEY=VALUE .env 파서 (의존성 회피용)."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def api_request(method: str, url: str, key: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "joule-smoke-test/0.1")
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read().decode())


def main() -> int:
    env = load_env(ENV_PATH)
    key = env.get("CRUSOE_API_KEY") or os.environ.get("CRUSOE_API_KEY", "")
    base = (env.get("CRUSOE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")

    if not key:
        print("FAIL: CRUSOE_API_KEY 없음.")
        print("  → .env.example 을 .env 로 복사하고 CRUSOE_API_KEY 를 채우세요.")
        return 1

    print(f"엔드포인트: {base}")

    # 1) 모델 목록 조회 — 연결·인증 확인 + Nemotron 모델 ID 발견
    try:
        models = api_request("GET", f"{base}/models", key)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print(f"FAIL: 모델 목록 조회 실패 — HTTP {e.code}\n  {body}")
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: 연결 실패 — {type(e).__name__}: {e}")
        return 1

    ids = [m.get("id", "?") for m in models.get("data", [])]
    if not ids:
        print("FAIL: 사용 가능한 모델이 없습니다.")
        return 1

    nemotron = [i for i in ids if "nemotron" in i.lower()]
    print(f"PASS: 모델 {len(ids)}개 조회 — 인증 성공")
    print(f"  Nemotron 모델: {nemotron or '(목록에 없음 — 확인 필요)'}")
    print(f"  전체 모델: {ids}")

    # 2) 채팅 완성 1회 — Nemotron 우선, 없으면 첫 모델
    model = nemotron[0] if nemotron else ids[0]
    try:
        comp = api_request(
            "POST",
            f"{base}/chat/completions",
            key,
            {
                "model": model,
                "messages": [{"role": "user", "content": "Reply with exactly: JOULE OK"}],
                "max_tokens": 16,
            },
        )
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print(f"FAIL: 채팅 완성 실패 (model={model}) — HTTP {e.code}\n  {body}")
        return 1

    reply = comp.get("choices", [{}])[0].get("message", {}).get("content", "")
    print(f"PASS: 채팅 완성 성공 (model={model})")
    print(f"  응답: {reply!r}")
    print("\n=== 스모크 테스트 통과 ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
