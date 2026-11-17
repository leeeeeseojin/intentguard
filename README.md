# IntentGuard — Agent UX Lab

> 에이전트가 클라우드 콘솔을 쓸 때 **어디서, 왜 실패하는지** 수집하고, 화면을 개선한 뒤, **에이전트 E2E로 성공률 개선을 검증**하는 실험 프로젝트.

사람을 위해 만든 콘솔을 이제 AI 에이전트도 쓴다. 같은 작업이라도 접근 경로(Web 콘솔 / MCP / API)에 따라 에이전트의 성공률은 크게 달라진다.
이 프로젝트는 일반적인 클라우드 콘솔(v1)과 같은 기능의 MCP 서버를 만들고, 에이전트가 각 경로로 작업하며 겪는 실패를 근거로 **에이전트 친화 인터페이스 원칙**과 **사람·에이전트 협업 UX**(v2 + IntentGuard 승인 패널)를 설계한다.

## 진행 상황

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | MiniCloud 도메인 · REST API · MCP 서버 · 콘솔 v1 · 스크립트 E2E · CI | ✅ |
| 2 | 에이전트 실행기(Web/MCP) · 시나리오 · 실패 자동 분류 리포트 → [기준선 결과](docs/results/v1-baseline.md) · [실패 분석](docs/analysis-v1.md) | ✅ |
| 3 | 에이전트 친화 원칙 도출 · 콘솔 v2 · IntentGuard 승인 패널 | ⏳ |
| 4 | v1 / v2 / MCP 성공률 비교 · 결과 리포트 | ⏳ |

## 구조

```
src/domain/   MiniCloud 도메인 모델 · 인메모리 저장소 · 감사 로그 (단일 진실 공급원)
src/server/   Hono REST API  (/api/*)
src/mcp/      MCP 서버 (stdio) — REST API를 호출하므로 콘솔과 상태를 공유
web/          React 콘솔 v1
tests/        Vitest 단위·통합 테스트
e2e/          Playwright 스크립트 E2E
```

```
 사람 ──▶ Web 콘솔 ─┐
                    ├──▶ REST API ──▶ MiniCloud (인메모리) ──▶ 감사 로그 (actor: human / agent)
 에이전트 ─▶ MCP ───┘
```

모든 변경은 감사 로그에 `actor`(human/agent), 성공 여부, 오류 코드와 함께 남는다. 에이전트가 **실제로 무엇을 했는지**를 화면이 아니라 서버 기준으로 채점하기 위해서다.

## MiniCloud

| 리소스 | 동작 | 에이전트를 헷갈리게 하는 지점 |
| --- | --- | --- |
| 서버 | 목록 · 생성 · 시작 · 정지 · 삭제(반납) | 실행 중이면 삭제 불가, 상태 전이에 시간이 걸림, dev/prod 이름이 거의 같음 |
| 보안 그룹(ACG) | 규칙 조회 · 추가 · 삭제 | CIDR 형식, `0.0.0.0/0`의 위험 |
| 버킷 | 공개 설정 · 비우기 · 삭제 | 객체가 남아 있으면 삭제 불가 |

API와 MCP의 오류는 `code`, `message`, 그리고 **다음에 무엇을 하면 되는지 알려주는 `hint`**를 함께 돌려준다. 콘솔 v1은 이 hint를 버린다. 이 차이가 경로별 성공률에 어떤 영향을 주는지가 실험 변수 중 하나다.

## 콘솔 v1의 사용성 패턴

v1은 클라우드 콘솔에서 흔히 보이는 패턴을 **의도적으로** 재현한다. 코드에는 `// v1-pattern: <이름>` 주석으로 표시했다.

| 패턴 | v1에서의 모습 | 사람에게 | 에이전트에게 (가설) | 실제 관찰 근거 |
| --- | --- | --- | --- | --- |
| `icon-only-buttons` | 새로고침·⋮·휴지통 버튼에 접근성 이름이 없음 | 아이콘으로 추측 가능 | 접근성 트리에서 이름 없는 button으로만 보임 | TODO |
| `overflow-menu` | 시작·정지·반납이 ⋮ 메뉴 뒤에 숨어 있음 | 익숙함 | 동작을 찾으려면 메뉴를 열어봐야 함 | TODO |
| `hidden-pagination` | 생성일 오래된 순 10개씩, 검색창 없음 | 페이지 넘기기 | 1페이지에 없으면 "없다"고 오판 | TODO |
| `color-only-env` | dev/staging/prod를 색 점으로만 구분 | 색으로 구분 | 텍스트로 환경을 알 수 없음 | TODO |
| `jargon-labels` | Server / Object Storage / ACG, 삭제 대신 "반납", running이 "운영중" | 학습 필요 | "운영중"(running)과 "운영"(prod)을 혼동할 수 있음 | TODO |
| `stale-list` | 작업 후 목록이 자동 갱신되지 않음 | 새로고침 | 작업이 실패한 줄 알고 재시도 | TODO |
| `vanishing-toast` | 오류가 2.5초 뒤 사라지고 hint 없음 | 놓치기 쉬움 | 스냅샷 시점에 따라 오류를 못 봄 | TODO |
| `silent-disabled` | 무엇이 빠졌는지 알려주지 않고 "다음"만 비활성화 | 답답함 | 왜 막혔는지 알 수 없음 | TODO |
| `late-validation` | 이름 형식 오류를 마지막 단계에서야 알림 | 되돌아가야 함 | 여러 단계를 다시 수행 | TODO |
| `multi-step-wizard` | 3단계 마법사, 현재 단계가 시각적으로만 표시 | 보통 | 단계 상태를 텍스트로 파악하기 어려움 | TODO |
| `placeholder-as-label` | 입력칸에 라벨 없이 placeholder만 | 입력하면 사라짐 | 값이 채워지면 무슨 칸인지 알 수 없음 | TODO |
| `div-controls` | 환경·사양 선택, 공개 토글, 목록 선택이 div | 클릭 가능 | 조작 가능한 요소로 인식되지 않음 | TODO |
| `typed-confirmation` | 이름을 입력해야 "확인" 활성화, 버튼이 동작을 말하지 않음 | 실수 방지 | 의도하지 않은 대상도 이름만 맞으면 통과 | TODO |

> "실제 관찰 근거" 칸은 실제 클라우드 콘솔을 사용하며 같은 패턴을 확인한 스크린샷·메모로 채운다. 가설 칸은 2단계 에이전트 실행 결과로 검증한다.

### 스크립트 E2E를 작성하며 먼저 발견한 것

- 아이콘 버튼에 이름이 없어 **테스트도 role 기반 locator를 쓸 수 없었다.** CSS 클래스와 위치에 의존하는 locator(`e2e/fixtures.ts`)가 필요했다.
- 모달이 열려 있어도 배경의 "서버 생성" 버튼이 접근성 트리에 남아 있어 `getByRole('button', { name: '생성' })`이 두 요소에 매칭됐다. 에이전트도 같은 혼동을 겪을 수 있다.

## 실행

```bash
pnpm install
pnpm exec playwright install chromium
```

```bash
pnpm dev          # API(8787) + 콘솔(5173)
```

```bash
pnpm typecheck && pnpm test && pnpm test:e2e
```

### Claude Code에서 MCP로 연결하기

`pnpm dev`를 켠 상태에서 이 폴더에서 Claude Code를 실행하면 `.mcp.json`의 `minicloud` 서버가 연결된다.
MCP로 한 작업은 감사 로그에 `actor: agent`로 기록되고, 콘솔에도 바로 반영된다(새로고침 필요 — `stale-list`).

```bash
curl -s localhost:8787/api/_audit
```

```bash
curl -s -X POST localhost:8787/api/_reset
```

## 향후 계획

- CLI · Skill 경로 추가해 5개 접근 경로 비교
- 실제 NAVER Cloud Platform 서비스 하나를 읽기 전용 API/CLI로 연동
- 토큰 사용량을 지표로 추가 (화면 구조가 컨텍스트 비용에 주는 영향)

## 기술 스택

TypeScript · React · Vite · Hono · MCP TypeScript SDK · zod · Vitest · Playwright · GitHub Actions
