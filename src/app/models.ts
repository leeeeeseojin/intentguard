/** 화면과 서버가 함께 쓴다. node 모듈을 넣지 말 것. */
export const MODELS = ["gemini-3.8-flash-low", "gemini-4-argon-low", "claude-sonnet-5-5-low", "gpt-oss-120b-medium"] as const;

export const MODEL_NAMES: Record<(typeof MODELS)[number], string> = {
  "gemini-3.8-flash-low": "Gemini 3.8 Flash",
  "gemini-4-argon-low": "Gemini 4 Argon",
  "claude-sonnet-5-5-low": "Claude Sonnet 5.5",
  "gpt-oss-120b-medium": "GPT-OSS 120B",
};
