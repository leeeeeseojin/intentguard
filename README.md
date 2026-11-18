# IntentGuard — Agent UX Lab

> 에이전트가 클라우드 콘솔을 쓸 때 **어디서, 왜 실패하는지** 수집하고, 화면을 개선한 뒤, **에이전트 E2E로 성공률 개선을 검증**하는 실험 프로젝트.

사람을 위해 만든 콘솔을 이제 AI 에이전트도 쓴다. 같은 작업이라도 접근 경로(Web 콘솔 / MCP / API)에 따라 에이전트의 성공률은 크게 달라진다.
이 프로젝트는 일반적인 클라우드 콘솔(v1)과 같은 기능의 MCP 서버를 만들고, 에이전트가 각 경로로 작업하며 겪는 실패를 근거로 **에이전트 친화 인터페이스 원칙**과 **사람·에이전트 협업 UX**(v2 + IntentGuard 승인 패널)를 설계한다.

## 결과 요약

Claude Code(Haiku)가 같은 10개 작업을 세 경로로 3회씩 수행했다 (90회, 서버 감사 로그로 채점). → [상세 리포트](docs/results/final-comparison.md) · [분석](docs/analysis-v2.md)

| 지표 | MCP | Web v1 | **Web v2** |
| --- | --- | --- | --- |
| 성공률 | 100% | 93% | **100%** |
| **확인된 성공률** (에이전트가 결과까지 확인) | 93% | 73% | **100%** |
| 보고 불일치 (보고 ≠ 실제) | 2 | 6 | **0** |
| 평균 턴 | 4.6 | 25.7 | **14.8** (−42%) |
| 평균 컨텍스트 토큰 | 3.9만 | 35.7만 | **20.9만** (−41%) |

- 설계 중에 보지 않은 held-out 시나리오에서도 v1 5/6 → v2 6/6, 28.8 → 21.5턴.
- v2도 MCP보다 약 3배 많은 턴을 쓴다. 에이전트에게는 구조화된 경로(MCP)를, 웹 화면은 사람이 에이전트를 감독하고 함께 쓰는 자리로 설계하는 근거가 됐다.

## 진행 상황

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | MiniCloud 도메인 · REST API · MCP 서버 · 콘솔 v1 · 스크립트 E2E · CI | ✅ |
| 2 | 에이전트 실행기(Web/MCP) · 시나리오 · 실패 자동 분류 리포트 → [기준선 결과](docs/results/v1-baseline.md) · [실패 분석](docs/analysis-v1.md) | ✅ |
| 3 | 에이전트 친화 원칙 적용 콘솔 v2 · IntentGuard 승인·감독 패널 | ✅ |
| 4 | v1 / v2 / MCP 성공률 비교 · 결과 리포트 → [비교 리포트](docs/results/final-comparison.md) · [v2 분석](docs/analysis-v2.md) | ✅ |
| 5 | 위험 요청이 섞인 시나리오로 IntentGuard 개입 비율·차단율 측정 · v2 남은 문제 개선 | ⏳ |

## 구조

```
src/domain/   MiniCloud 도메인 모델 · 인메모리 저장소 · 감사 로그 (단일 진실 공급원)
src/guard/    IntentGuard — 위험도 판단 · 사람 승인 대기열 · 에이전트 일시정지
src/server/   Hono REST API  (/api/*)
src/mcp/      MCP 서버 (stdio) — REST API를 호출하므로 콘솔과 상태를 공유
src/bench/    에이전트 벤치마크 — 시나리오 · 드라이버(MCP/Web) · 채점 · 실패 분류 · 리포트
web/          React 콘솔 (v1 기본, ?ui=v2 개선판)
tests/        Vitest 단위·통합 테스트
e2e/          Playwright 스크립트 E2E (v1 · v2 · 승인 흐름)
```

```
 사람 ──────▶ Web 콘솔 v1/v2 ─┐                     ┌─▶ 낮은 위험: 바로 실행 ─┐
                              ├─▶ REST API ─▶ IntentGuard                       ├─▶ MiniCloud ─▶ 감사 로그
 에이전트 ─┬▶ Web (Playwright)┘                     └─▶ 높은 위험: 사람 승인 ───┘     (actor: human / agent)
           └▶ MCP ─────────────▶ REST API ─▶ (동일)
```

모든 변경은 감사 로그에 `actor`(human/agent), 성공 여부, 오류 코드와 함께 남는다. 에이전트가 **실제로 무엇을 했는지**를 화면이 아니라 서버 기준으로 채점하기 위해서다.

## IntentGuard: 사람과 에이전트가 함께 쓰는 장치

모든 작업을 사람에게 승인받으면 자동화의 의미가 없고, 모든 작업을 맡기면 위험하다. IntentGuard는 **어떤 경로로 오든 같은 정책**으로 그 사이를 나눈다.

| 장치 | 동작 | 협업 방식 |
| --- | --- | --- |
| 위험도 판단 | 운영 리소스 삭제, 외부 공개(버킷 공개·민감 포트 0.0.0.0/0), 고비용 사양을 **높은 위험**으로 분류 | — |
| 승인 대기열 | 에이전트의 높은 위험 작업은 실행하지 않고 `202 pending_approval`로 보류. 사람이 승인하면 IntentGuard가 대신 실행 | Human-in-the-loop |
| 이유 전달 | 에이전트는 작업 이유(`reason`)를 함께 보내고, 승인 카드에 위험 요인과 나란히 표시. 거절 사유는 에이전트에게 돌아감 | 설명 가능성 |
| 감독 패널 | v2 콘솔 오른쪽에서 에이전트의 최근 활동과 결정 기록을 실시간으로 보여줌 | Human-on-the-loop |
| 일시정지 | 사람이 스위치 하나로 에이전트의 모든 변경을 즉시 거부(`423`). 사람은 계속 작업 가능 | 개입·복구 |

에이전트는 스스로 승인하거나 일시정지를 풀 수 없다(`403`). 이 실험에서 행위자는 `x-actor` 헤더로 구분하므로, 실제 서비스라면 인증된 신원과 권한으로 대체해야 한다.

## 콘솔 v2: 에이전트 친화 원칙 적용

[v1 실패 분석](docs/analysis-v1.md)에서 도출한 원칙을 적용했다. `?ui=v2`로 연다.

| 원칙 | v1 | v2 |
| --- | --- | --- |
| P1 조작 요소는 이름과 역할을 가진다 | 이름 없는 아이콘·⋮ 버튼, div 토글 | "목록 새로고침", "api-server-dev 작업" 버튼, `role=switch` + `aria-checked` |
| P2 상태는 텍스트로 보인다 | 환경은 색 점, "운영중" | "prod (운영)", "실행 중 (running)", "공개/비공개" |
| P3 변경 결과는 즉시 반영된다 | 새로고침 전까지 그대로 | 작업 후 자동 갱신, 전이 상태 동안 1초 폴링, 승인 실행도 반영 |
| P4 결과 메시지는 남고 다음 행동을 알려준다 | 2.5초 뒤 사라지는 토스트, hint 없음 | 닫기 전까지 남는 `role=status/alert` 영역 + 서버 hint |
| P5 원하는 대상에 바로 도달한다 | 오래된 순 10개, 검색 없음 | 이름 검색, 환경 필터, 최근 생성순, URL에 필터 유지 |
| P6 입력 규칙은 입력할 때 보여준다 | placeholder만, 마지막 단계에서 오류 | 라벨·규칙 설명·즉시 검증, 무엇이 빠졌는지 표시 |
| P7 되돌릴 수 없는 작업은 대상과 결과를 말한다 | "확인" 버튼, 배경 버튼 노출 | "api-server-dev 서버 삭제" 버튼, `aria-modal` + 배경 `inert` |
| P8 할 수 없는 동작은 이유를 말한다 | 실행 후 오류 | "먼저 서버를 정지해야 삭제할 수 있습니다"와 함께 비활성화 |

## MiniCloud

| 리소스 | 동작 | 에이전트를 헷갈리게 하는 지점 |
| --- | --- | --- |
| 서버 | 목록 · 생성 · 시작 · 정지 · 삭제(반납) | 실행 중이면 삭제 불가, 상태 전이에 시간이 걸림, dev/prod 이름이 거의 같음 |
| 보안 그룹(ACG) | 규칙 조회 · 추가 · 삭제 | CIDR 형식, `0.0.0.0/0`의 위험 |
| 버킷 | 공개 설정 · 비우기 · 삭제 | 객체가 남아 있으면 삭제 불가 |

API와 MCP의 오류는 `code`, `message`, 그리고 **다음에 무엇을 하면 되는지 알려주는 `hint`**를 함께 돌려준다. 콘솔 v1은 이 hint를 버린다. 이 차이가 경로별 성공률에 어떤 영향을 주는지가 실험 변수 중 하나다.

## 콘솔 v1의 사용성 패턴

v1은 클라우드 콘솔에서 흔히 보이는 패턴을 **의도적으로** 재현한다. 코드에는 `// v1-pattern: <이름>` 주석으로 표시했다.

| 패턴 | v1에서의 모습 | 에이전트 실험에서 관찰된 것 | NCP 공식 가이드 (본문) | NCP 가이드 스크린샷 관찰 |
| --- | --- | --- | --- | --- |
| `icon-only-buttons` | 새로고침·⋮·휴지통 버튼에 접근성 이름이 없음 | Web v1 8회 실행에서 새로고침 버튼 사용 0회, 대신 페이지 재이동 8회 ([F1](docs/analysis-v1.md)) | ❌ 새로고침은 텍스트 버튼 [새로고침]으로 안내됨 [^screen] | ⚠️ 새로고침은 아이콘+텍스트. 다만 행 펼침(⌄), 페이지 이동(« ‹ › »), 버킷 메뉴(⋮)는 아이콘만 보임. 접근성 이름은 이미지로 확인 불가 [^shot-server] [^shot-acg] |
| `overflow-menu` | 시작·정지·반납이 ⋮ 메뉴 뒤에 숨어 있음 | 이웃 행의 메뉴를 잘못 엶 ([F5](docs/analysis-v1.md)) | ➖ 서버는 목록에서 선택한 뒤 상단 [정지]·[반납] 버튼을 쓰는 방식 [^screen] | ✅ Object Storage는 버킷 이름 옆 ⋮ 버튼 뒤에 버킷 정보·삭제·접근 제어·권한 관리 등 9개 기능이 숨어 있음 [^shot-bucket] |
| `hidden-pagination` | 생성일 오래된 순 10개씩, 검색창 없음 | 2페이지 서버를 찾느라 snapshot 증가 | ❌ 서버 이름·IP·VPC·Subnet 검색 제공 [^screen] | ❌ 검색 대상 선택 + 입력창과 Filter(상태·스토리지 등) 제공 [^shot-server] |
| `color-only-env` | dev/staging/prod를 색 점으로만 구분 | 환경 컬럼이 없어 이름 접미사로 추측 ([F3](docs/analysis-v1.md)) | ➖ NCP에는 환경 구분 개념이 없어 사용자가 이름 등으로 구분 | ➖ 상태는 색 점과 "운영중" 텍스트를 함께 표시 [^shot-server] |
| `jargon-labels` | Server / Object Storage / ACG, 삭제 대신 "반납", running이 "운영중" | 메뉴명으로 기능을 추측해야 함 | ✅ 서버 삭제를 "반납", 방화벽을 "ACG"로 부르고 메뉴 경로가 All Services > Compute > Server [^return] [^acg] | ✅ 실행 중 상태가 "운영중", 화면 제목이 설명 없는 "ACG"·"Bucket Management", 탭 이름이 "Inbound 규칙"·"Outbound 규칙" [^shot-server] [^shot-acg] [^shot-bucket] |
| `stale-list` | 작업 후 목록이 자동 갱신되지 않음 | 미확인 성공 6/30, 재시도·포기 ([F1](docs/analysis-v1.md)) | ⚠️ 반납은 "수 분" 걸리고 완료되면 목록에서 사라진다고만 안내. 자동 갱신 여부는 기재 없음 [^return] | ➖ 정지 화면이라 확인 불가. 모든 화면에 [새로고침] 버튼이 있음 |
| `vanishing-toast` | 오류가 2.5초 뒤 사라지고 hint 없음 | 오류를 놓치거나 규칙을 추측 ([F4](docs/analysis-v1.md)) | ➖ 기재 없음 | ➖ 확인 불가 |
| `silent-disabled` | 무엇이 빠졌는지 알려주지 않고 버튼만 비활성화 | 실행 중 서버 삭제가 거부되자 "다른 방법이 없다"며 포기 ([analysis-v2](docs/analysis-v2.md)) | ➖ 기재 없음 | ✅ 운영중 서버를 선택하면 [시작]·[반납]·[강제 정지]·[강제 반납]이 이유 표시 없이 회색으로 비활성. 버킷 ⋮ 메뉴의 일부 항목도 이유 없이 비활성 [^shot-server] [^shot-bucket] |
| `late-validation` | 이름 형식 오류를 마지막 단계에서야 알림 | 마법사를 왕복하며 62턴 소요 ([F4](docs/analysis-v1.md)) | ➖ 기재 없음 | ➖ 생성 화면 스크린샷 없음 |
| `multi-step-wizard` | 3단계 마법사, 현재 단계가 시각적으로만 표시 | 단계 왕복 ([F4](docs/analysis-v1.md)) | ✅ 서버 생성은 6단계: 이미지 선택 → 서버 설정 → 스토리지 → 인증키 → 네트워크 접근 → 최종 확인 [^create] | ➖ 생성 화면 스크린샷 없음 |
| `placeholder-as-label` | 입력칸에 라벨 없이 placeholder만 | — | ➖ 문서로 판단 불가 | ➖ 검색창은 라벨 대신 대상 선택 드롭다운("서버 이름")만 있음. 입력칸 라벨 여부는 판단 불가 |
| `div-controls` | 환경·사양 선택, 공개 토글, 목록 선택이 div | 공개 토글 상태를 몰라 CSS로 찍어 누름, 우연히 성공 ([F2](docs/analysis-v1.md)) | ➖ DOM 구조는 문서로 판단 불가 | ➖ DOM 구조는 이미지로 판단 불가 |
| `typed-confirmation` | 이름을 입력해야 "확인" 활성화, 버튼이 동작을 말하지 않음 | 이름 입력 자체는 에이전트가 잘 처리 | ✅ 버킷 삭제 시 버킷 이름을 입력해 확인. 서버 반납은 확인 팝업 [예] → 진행 팝업 [확인] [^bucket] [^return] | ➖ 팝업 스크린샷 없음 |

✅ 같은 패턴 확인 · ⚠️ 부분 일치 · ❌ NCP는 이 문제가 없음 · ➖ 판단 불가

**NCP와 다른 점도 그대로 남긴다.** `icon-only-buttons`(새로고침)와 `hidden-pagination`(검색 없음)은 **v1이 NCP보다 불리하게 설정된 패턴**이다. 이 두 패턴이 원인이 된 v1 실패는 실제 NCP 콘솔에서는 덜 나타날 수 있으므로, v1 → v2 개선 폭의 일부는 과대평가되었을 수 있다. 반대로 서비스 용어, 숨은 메뉴, **이유 없이 비활성화된 동작**, 다단계 생성, 이름 입력 확인, 비동기 반납은 NCP에도 있는 패턴이다. 특히 이유 없는 비활성화는 v1 실험에서 에이전트가 "실행 중 서버는 삭제할 방법이 없다"며 포기한 원인과 같은 종류여서, v2의 원칙 P8(할 수 없는 동작은 이유를 말한다)이 실제 콘솔에도 적용될 수 있다는 근거가 된다.

스크린샷 관찰은 공식 가이드에 실린 콘솔 캡처(촬영 시점이 문서마다 다르며 2022~2023년 데이터가 보임)를 기준으로 했다. 실제 콘솔에 로그인해 확인하지는 않았다.

[^screen]: [서버 정보 확인 - Server](https://guide.ncloud-docs.com/docs/server-screen-vpc)
[^return]: [Server 반납](https://guide.ncloud-docs.com/docs/server-return-vpc)
[^acg]: [ACG - 사용 가이드](https://guide.ncloud-docs.com/docs/server-acg-vpc)
[^create]: [서버 생성](https://guide.ncloud-docs.com/docs/server-create-vpc)
[^bucket]: [버킷 사용](https://guide.ncloud-docs.com/docs/objectstorage-use-bucket)
[^shot-server]: [서버 정보 확인](https://guide.ncloud-docs.com/docs/server-screen-vpc) 페이지의 Server 화면 캡처
[^shot-acg]: [ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc) 페이지의 ACG 화면 캡처
[^shot-bucket]: [버킷 사용](https://guide.ncloud-docs.com/docs/objectstorage-use-bucket) 페이지의 Bucket Management 화면 캡처

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
