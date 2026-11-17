export type CloudErrorCode =
  | "NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "CONFLICT"
  | "INVALID_STATE"
  | "QUOTA_EXCEEDED"
  | "BUCKET_NOT_EMPTY";

const HTTP_STATUS: Record<CloudErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_ARGUMENT: 400,
  CONFLICT: 409,
  INVALID_STATE: 409,
  QUOTA_EXCEEDED: 429,
  BUCKET_NOT_EMPTY: 409,
};

/**
 * 도메인 오류. `hint`는 "다음에 무엇을 하면 되는지"를 담는다.
 * API/MCP는 hint를 그대로 노출하고, 콘솔 v1은 일부러 message만 잠깐 보여준다.
 */
export class CloudError extends Error {
  readonly status: number;

  constructor(
    readonly code: CloudErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "CloudError";
    this.status = HTTP_STATUS[code];
  }

  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}
