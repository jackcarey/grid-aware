export type ProviderName = "electricitymaps" | "neso";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider?: ProviderName,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string) {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string) {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message: string) {
    super(message, 429);
    this.name = "TooManyRequestsError";
  }
}

export class UpstreamError extends ApiError {
  constructor(message: string, provider: ProviderName) {
    super(message, 502, provider);
    this.name = "UpstreamError";
  }
}

export function errorBody(err: ApiError): { error: { message: string; provider?: ProviderName } } {
  return { error: { message: err.message, provider: err.provider } };
}
