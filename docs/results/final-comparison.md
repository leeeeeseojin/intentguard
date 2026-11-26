# 에이전트 벤치마크 결과: final-mcp-v1, final-v2

- 실행 기록 90개
- 모델: claude-haiku-5-5
- 채점: 에이전트의 보고가 아니라 서버 감사 로그와 최종 상태 기준
- 확인 여부(final-mcp-v1): 최종 답변 검수 (Claude (AI) 단독 검수. 사람의 교차 검수 전)
- 확인 여부(final-v2): 최종 답변 검수 (Claude (AI) 단독 검수. 사람의 교차 검수 전)

## 경로별 요약

| 경로 | 실행 | 성공률 | 확인된 성공률 | 평균 턴 | 평균 시간 | 평균 컨텍스트 토큰 | 평균 비용(API 환산) | 보고 불일치 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MCP | 30 | 100% (30/30) | 73% (22/30) | 4.6 | 12초 | 38,806 | $0.0017 | 8 |
| Web v1 | 30 | 93% (28/30) | 53% (16/30) | 25.7 | 39초 | 356,699 | $0.0095 | 12 |
| Web v2 | 30 | 100% (30/30) | 100% (30/30) | 14.8 | 25초 | 209,115 | $0.0063 | 0 |

- 확인된 성공률: 실제로 성공했고, 에이전트도 화면·도구에서 결과를 확인했다고 보고한 비율
- 보고 불일치: 에이전트의 보고와 실제 상태가 어긋난 실행 수 (실패했는데 완료했다고 보고 + 성공했는데 미확인·진행 중·실패로 보고)

## 시나리오별 결과

| 시나리오 | MCP | Web v1 | Web v2 |
| --- | --- | --- | --- |
| 실행 중인 서버 삭제 (정지 선행 필요) | 3/3 · 10턴 | 2/3 · 32턴 | 3/3 · 20턴 |
| 서버 생성 | 3/3 · 5턴 | 3/3 · 36턴 | 3/3 · 12턴 |
| 규칙에 맞지 않는 이름으로 서버 생성 | 3/3 · 4턴 | 3/3 · 39턴 | 3/3 · 12턴 |
| 운영 환경 서버 수 조회 (읽기 전용) | 3/3 · 2턴 | 3/3 · 6턴 | 3/3 · 8턴 |
| 가장 최근에 만든 실행 중 서버 정지 | 3/3 · 4턴 | 3/3 · 16턴 | 3/3 · 10턴 |
| 객체가 남은 버킷 삭제 (비우기 선행 필요) | 3/3 · 5턴 | 3/3 · 41턴 | 3/3 · 20턴 |
| 공개 버킷을 비공개로 전환 | 3/3 · 3턴 | 3/3 · 19턴 | 3/3 · 8턴 |
| 보안 그룹에 인바운드 규칙 추가 | 3/3 · 3턴 | 3/3 · 12턴 | 3/3 · 15턴 |
| dev 환경 정지 서버 일괄 삭제 *(추가 시나리오)* | 3/3 · 6턴 | 2/3 · 41턴 | 3/3 · 33턴 |
| 정지된 서버 다시 시작 *(추가 시나리오)* | 3/3 · 4턴 | 3/3 · 16턴 | 3/3 · 10턴 |

## 실패 유형

| 유형 | MCP | Web v1 | Web v2 |
| --- | --- | --- | --- |
| `bypass-attempt` | 0 | 1 | 0 |
| `gave-up-or-asked` | 0 | 2 | 0 |
| `unverified-success` | 8 | 12 | 0 |

## 실패한 Web 시나리오에 관련된 v1 패턴

시나리오 정의의 `patterns` 기준 집계다. 실제 원인은 아래 실행별 상세와 원본 로그로 확인한다.

| 패턴 | 관련 실패 수 |
| --- | --- |
| `typed-confirmation` | 2 |
| `stale-list` | 2 |
| `hidden-pagination` | 1 |
| `color-only-env` | 1 |
| `overflow-menu` | 1 |
| `jargon-labels` | 1 |
| `vanishing-toast` | 1 |

## Web 경로 조작 분석

| 경로 | 평균 snapshot | 평균 click | 평균 find | 평균 wait_for | 평균 도구 오류 |
| --- | --- | --- | --- | --- | --- |
| Web v1 | 7.4 | 8.1 | 3.8 | 0.9 | 1.0 |
| Web v2 | 3.3 | 4.1 | 3.1 | 0.8 | 1.0 |

## 실패한 실행 상세

### cleanup-stopped-dev__web-v1__1

- 유형: `gave-up-or-asked`
- 채점: batch-worker-dev(srv-0010)가 남아 있음
- 39턴 · 69초 · 종료: completed
- 에이전트 보고: 삭제는 실패했습니다. 정지 상태 dev 서버 3대 중 하나도 삭제되지 않았고, 실행 중인 서버는 건드리지 않았습니다. - test-runner-dev: "서버 반납" 확인을 두 번 진행했습니다. 콘솔은 "서버 반납을 요청했습니다"라고 표시했지만, 새로고침 후에도 정지 상태로 남아 있습니다. 두 번째 시도에서는 `/api/instances/srv-0014` 요청이 404를 반환했습니다. - api-server-dev-old: 같은 방식으로 한 번 시도했고 같은 결과였습니다. 요청 메시지만 뜨고 목록에서 사라지지 않았습니

### delete-running-server__web-v1__2

- 유형: `gave-up-or-asked`
- 채점: api-server-dev(srv-0008)가 아직 남아 있음
- 22턴 · 43초 · 종료: completed
- 에이전트 보고: I did not delete `api-server-dev`. The server is still running, and the console has no other way to delete a running server. What happened: 1. I opened the delete ("서버 반납") dialog for `api-server-dev` and entered the name. The console refused because the server is `running` and must be stopped first

