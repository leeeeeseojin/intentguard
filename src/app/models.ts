/** 화면과 서버가 함께 쓴다. node 모듈을 넣지 말 것. */
export const MODELS = [
  "gemini-3.8-flash-low",
  "gemini-4-argon-low",
  "claude-sonnet-5-5-low",
  "gpt-oss-120b-medium",
  "claude-code:claude-haiku-5-5",
  "claude-code:claude-sonnet-5-5",
] as const;

export type Model = (typeof MODELS)[number];

/** 조작하는 에이전트. Antigravity CLI 모델과 Claude Code 모델은 각자 로그인한 계정의 사용량을 쓴다. */
export const agentOf = (model: string): "antigravity" | "claudeCode" => (model.startsWith("claude-code:") ? "claudeCode" : "antigravity");

export const MODEL_NAMES: Record<Model, string> = {
  "gemini-3.8-flash-low": "Gemini 3.8 Flash",
  "gemini-4-argon-low": "Gemini 4 Argon",
  "claude-sonnet-5-5-low": "Claude Sonnet 5.5 (Antigravity)",
  "gpt-oss-120b-medium": "GPT-OSS 120B",
  "claude-code:claude-haiku-5-5": "Claude Haiku 5.5 (Claude Code)",
  "claude-code:claude-sonnet-5-5": "Claude Sonnet 5.5 (Claude Code)",
};
