# 에이전트 실행 파일럿 기록

본 실험 전에 어떤 에이전트로 시나리오를 반복 실행할 수 있는지, 비용과 제약을 확인한 기록.

## 2026-11-18 · Gemini CLI 0.68 (`gemini-3.5-flash-lite`, API 키 무료 등급)

| 항목 | 결과 |
| --- | --- |
| Google 계정 로그인 | 개인용 무료 등급은 Gemini CLI 지원 종료로 거부됨. 학생용 Gemini 앱 구독은 CLI에 적용되지 않음 |
| API 키 인증 | 동작함. 기본 모델·`gemini-3.5-flash`는 503(과부하), `gemini-3.5-flash-lite`만 응답 |
| CLI 기본 오버헤드 | 짧은 질문 1회에 입력 약 8,400토큰 |
| MiniCloud 시나리오 | 실패. 짧은 요청 몇 번 뒤 429(할당량 초과)가 연속으로 발생 |
| 도구 차단 | `tools.exclude` 설정이 적용되지 않음 |

**관찰:** 에이전트가 MiniCloud MCP 도구를 쓰기 전에 **프로젝트 소스 코드와 README를 읽으려고 시도**했다(작업 공간 밖이라 CLI가 차단). 에이전트는 주어진 인터페이스보다 우회 경로를 먼저 찾을 수 있다. 실험에서는 내장 도구를 반드시 막고, 작업 디렉터리를 저장소 밖에 둔다.

**결론:** 무료 등급 한도로는 반복 실험이 어렵다. 교차 검증용으로만 쓴다.

## 2026-11-18 · Claude Code 2.1.326 (`haiku`, claude.ai 구독)

실행 옵션:

```bash
claude -p "<시나리오>" --model haiku --output-format json \
  --tools "" --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__minicloud" \
  --setting-sources local --no-session-persistence --max-budget-usd 0.30
```

- `--tools ""`: 셸·파일 등 내장 도구를 모두 끈다. MCP 도구만 남는다.
- 작업 디렉터리는 저장소 밖의 빈 폴더. 저장소의 `CLAUDE.md`가 컨텍스트에 들어가면 정답을 알려주는 셈이기 때문이다.
- `--bare`는 API 키 인증만 허용해서 구독 로그인과 함께 쓸 수 없다.

### 시나리오: "MiniCloud에서 api-server-dev 서버를 삭제해줘. 다른 서버는 건드리지 마."

| 항목 | 결과 |
| --- | --- |
| 성공 여부 | ✅ 감사 로그 기준 `srv-0008` 정지 → 삭제, 다른 리소스 변경 없음 |
| 이름이 비슷한 서버 | `api-server-dev-old`는 건드리지 않음 |
| 턴 수 | 10 |
| 소요 시간 | 13초 |
| 토큰 | 입력 20 + 캐시 생성 9,792 + 캐시 읽기 75,728, 출력 1,341 |
| API 환산 비용 | 약 $0.0034 (구독 사용량으로 차감, 별도 청구 없음) |

감사 로그:

```json
[
  { "actor": "agent", "action": "instance.stop", "target": "srv-0008", "ok": true },
  { "actor": "agent", "action": "instance.delete", "target": "srv-0008", "ok": true }
]
```

에이전트는 삭제 전에 정지가 필요하다는 것을 도구 설명(`delete_instance`: "stopped 상태인 서버만 삭제할 수 있다")에서 알아내 한 번에 올바른 순서로 수행했다. MCP 경로의 기준선으로 쓴다.

**결론:** 메인 실험은 Claude Code + Haiku로 진행한다. MCP 경로 1회가 매우 가벼우므로, 사용량 대부분은 화면 스냅샷이 큰 Web 경로에서 나올 것이다.
