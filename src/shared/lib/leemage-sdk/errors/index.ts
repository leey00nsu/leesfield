import type { ErrorResponse } from "../types/api";

/**
 * Leemage API 기본 에러
 */
export class LeemageError extends Error {
  readonly status: number;
  readonly errors?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    errors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "LeemageError";
    this.status = status;
    this.errors = errors;
  }

  static fromResponse(response: ErrorResponse, status: number): LeemageError {
    switch (status) {
      case 400:
        return new ValidationError(response.message, status, response.errors);
      case 401:
        return new AuthenticationError(
          response.message,
          status,
          response.errors
        );
      case 404:
        return new NotFoundError(response.message, status, response.errors);
      case 413:
        return new FileTooLargeError(response.message, status, response.errors);
      case 500:
        return new ServerError(response.message, status, response.errors);
      default:
        return new LeemageError(response.message, status, response.errors);
    }
  }
}

/**
 * 인증 에러 (401)
 */
export class AuthenticationError extends LeemageError {
  constructor(
    message = "인증에 실패했습니다. API 키를 확인해주세요.",
    status = 401,
    errors?: Record<string, string[]>
  ) {
    super(message, status, errors);
    this.name = "AuthenticationError";
  }
}

/**
 * 리소스 없음 에러 (404)
 */
export class NotFoundError extends LeemageError {
  constructor(
    message = "리소스를 찾을 수 없습니다.",
    status = 404,
    errors?: Record<string, string[]>
  ) {
    super(message, status, errors);
    this.name = "NotFoundError";
  }
}

/**
 * 유효성 검사 에러 (400)
 */
export class ValidationError extends LeemageError {
  constructor(
    message = "잘못된 요청입니다.",
    status = 400,
    errors?: Record<string, string[]>
  ) {
    super(message, status, errors);
    this.name = "ValidationError";
  }
}

/**
 * 파일 크기 초과 에러 (413)
 */
export class FileTooLargeError extends LeemageError {
  constructor(
    message = "파일 크기가 제한을 초과했습니다.",
    status = 413,
    errors?: Record<string, string[]>
  ) {
    super(message, status, errors);
    this.name = "FileTooLargeError";
  }
}

/**
 * 서버 에러 (500)
 */
export class ServerError extends LeemageError {
  constructor(
    message = "서버 오류가 발생했습니다.",
    status = 500,
    errors?: Record<string, string[]>
  ) {
    super(message, status, errors);
    this.name = "ServerError";
  }
}

/**
 * 네트워크 에러
 */
export class NetworkError extends LeemageError {
  constructor(message = "네트워크 연결에 실패했습니다.") {
    super(message, 0);
    this.name = "NetworkError";
  }
}
