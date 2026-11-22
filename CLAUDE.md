# IntentGuard — Agent UX Lab

에이전트가 클라우드 콘솔을 쓸 때 어디서 실패하는지 수집하고, 화면을 개선한 뒤, 에이전트 E2E로 성공률 개선을 검증하는 프로젝트.

## 구조

- `src/domain/` — MiniCloud 도메인 모델과 인메모리 저장소 (단일 진실 공급원)
- `src/server/` — Hono REST API (`/api/*`), 포트 8787
- `src/mcp/` — MCP 서버 (stdio). REST API를 호출하므로 콘솔과 상태를 공유한다
- `web/` — React 콘솔. `?ui=v1` / `?ui=v2`로 버전 전환
- `web/src/demo/` — 서버 없는 공개 데모 (`vite --mode demo`). 기본 모드(실험 기준선)의 화면과 동작에 영향을 주지 말 것
- `src/audit/` — 배포 URL 검사기 (Antigravity CLI). 사용자 전역 agy 설정을 바꾸거나 `--dangerously-skip-permissions`를 쓰지 말 것
- `src/app/`, `web/audit-app/` — 로컬 검사 앱. 127.0.0.1 전용이며 Host·Origin·전용 헤더 검사를 약하게 만들지 말 것
- `tests/` — Vitest 단위 테스트
- `e2e/` — Playwright 스크립트 E2E

## 콘솔 v1 원칙

v1은 실제 클라우드 콘솔에서 흔히 보이는 사용성 패턴을 **의도적으로** 재현한다.
그런 코드에는 `// v1-pattern: <이름>` 주석을 달고, README의 패턴 표와 이름을 맞춘다.
v1 패턴을 "버그"로 보고 고치지 말 것. 개선은 v2에서 한다.

## 명령어

- `pnpm dev` — API(8787) + 웹(5173) 동시 실행
- `pnpm mcp` — MCP 서버 실행 (`MINICLOUD_URL` 기본값 http://localhost:8787)
- `pnpm typecheck` / `pnpm test` / `pnpm test:e2e`
- 테스트 데이터 초기화: `POST /api/_reset` (`x-actor: human` 헤더 필요)

## 완료 기준

작업을 끝냈다고 말하기 전에 `pnpm typecheck`, `pnpm test`, 관련 있으면 `pnpm test:e2e`를 통과시킨다.

## 커밋 규칙

작업 단위별로 잘게 나눠 커밋한다. 형식: `<태그>: <한국어 설명>` (예: `feat: 유저 로그인 페이지 레이아웃 생성`)

| 태그 | 설명 |
| --- | --- |
| feat | 새로운 기능 추가 |
| fix | 버그 수정 |
| design | CSS 등 사용자 UI 디자인 변경 |
| docs | 문서 수정 |
| refactor | 프로덕션 코드 리팩토링 |
| test | 테스트 추가·리팩토링 (프로덕션 코드 변경 X) |
| chore | 빌드·패키지 매니저 설정 (프로덕션 코드 변경 X) |
| rename | 파일·폴더명 수정 또는 이동만 |
| remove | 파일 삭제만 |
