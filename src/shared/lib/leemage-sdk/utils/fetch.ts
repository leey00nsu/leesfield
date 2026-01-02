import { LeemageError, NetworkError } from "../errors";
import type { ErrorResponse } from "../types/api";

export interface FetchClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * HTTP 클라이언트 래퍼
 */
export class FetchClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(options: FetchClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30000;
  }

  /**
   * API 요청 실행
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const { method = "GET", body, headers = {} } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: ErrorResponse;
        try {
          errorData = (await response.json()) as ErrorResponse;
        } catch {
          errorData = {
            message: response.statusText || "요청에 실패했습니다.",
          };
        }
        throw LeemageError.fromResponse(errorData, response.status);
      }

      // 204 No Content 처리
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof LeemageError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new NetworkError("요청 시간이 초과되었습니다.");
        }
        throw new NetworkError(error.message);
      }

      throw new NetworkError("알 수 없는 오류가 발생했습니다.");
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}
