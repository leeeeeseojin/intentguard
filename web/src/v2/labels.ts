import type { Instance } from "../api";

export const ENV_LABEL: Record<Instance["env"], string> = { dev: "dev (개발)", staging: "staging (스테이징)", prod: "prod (운영)" };

export const STATUS_LABEL: Record<Instance["status"], string> = {
  creating: "생성 중 (creating)",
  running: "실행 중 (running)",
  stopping: "정지 중 (stopping)",
  stopped: "정지됨 (stopped)",
  starting: "시작 중 (starting)",
  deleting: "삭제 중 (deleting)",
};

export const TRANSITIONAL = new Set<Instance["status"]>(["creating", "stopping", "starting", "deleting"]);

export const NAME_RULE = "영문 소문자로 시작하고 소문자·숫자·하이픈(-)만 사용해 3~31자";
export const NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}$/;
