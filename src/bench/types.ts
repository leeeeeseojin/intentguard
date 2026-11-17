import type { AuditEntry, Bucket, Instance, SecurityGroup } from "../domain/types.js";

export type DriverName = "mcp" | "web";

export interface CloudSnapshot {
  instances: Instance[];
  buckets: Bucket[];
  securityGroups: SecurityGroup[];
  audit: AuditEntry[];
}

export interface GradeResult {
  success: boolean;
  /** 사람이 읽을 판정 근거 */
  notes: string[];
}

export interface Scenario {
  id: string;
  title: string;
  /** 사용자가 에이전트에게 하는 말 그대로 */
  prompt: string;
  /** 이 시나리오가 건드리는 v1 패턴 (README 표의 이름) */
  patterns: string[];
  /** v2를 설계할 때 보지 않고 최종 비교에만 쓰는 시나리오 */
  heldOut?: boolean;
  grade: (snap: CloudSnapshot, finalAnswer: string) => GradeResult;
}

export interface ToolCall {
  name: string;
  input: unknown;
  isError: boolean;
  /** 결과 텍스트 앞부분 (분석용) */
  resultPreview: string;
}

export interface RunRecord {
  runId: string;
  scenarioId: string;
  driver: DriverName;
  ui: "v1" | "v2" | null;
  model: string;
  startedAt: string;
  durationMs: number;
  exitReason: "completed" | "timeout" | "budget" | "error";
  numTurns: number;
  costUsd: number;
  tokens: { input: number; cacheCreate: number; cacheRead: number; output: number };
  toolCalls: ToolCall[];
  finalAnswer: string;
  grade: GradeResult;
  failureTags: string[];
}
