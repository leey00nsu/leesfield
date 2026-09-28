import { describe, it, expect, vi, afterEach } from "vitest";

import { ComfyEngineError, engineNeverAnswered, errorCode } from "../server/engine";
import { createEngineFetch } from "../server/fetch";
import { SdkComfyEngine } from "../server/sdkEngine";
import type { ComfyConnection } from "../types";

/** What Node's fetch throws when the request never reaches the host. */
const fetchFailed = (code?: string) => {
  const error = new TypeError("fetch failed");
  if (code) (error as { cause?: unknown }).cause = { code };
  return error;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const connection: ComfyConnection = {
  mode: "cloud",
  baseUrl: "https://cloud.comfy.org",
  apiKey: "comfyui-test",
  useSdk: true,
  jobTimeoutMs: 900_000,
};

/** Stand in for the SDK client, which the engine creates lazily. */
function engineWith(jobsGet: () => unknown): SdkComfyEngine {
  const engine = new SdkComfyEngine(connection);
  (engine as unknown as { client: unknown }).client = { jobs: { get: jobsGet } };
  return engine;
}

/** What a dual-stack host that answered on no address looks like. */
const noAddressAnswered = () => {
  const inner = new Error("connect ETIMEDOUT");
  (inner as { code?: string }).code = "ETIMEDOUT";
  const aggregate = new AggregateError([inner], "");
  (aggregate as { code?: string }).code = "ETIMEDOUT";
  const outer = new TypeError("fetch failed");
  (outer as { cause?: unknown }).cause = aggregate;
  return outer;
};

/** What `AbortSignal.timeout()` throws — the Comfy SDK arms one per request. */
const timedOut = () => {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
};

describe("engineNeverAnswered", () => {
  it("recognises a request that never arrived", () => {
    expect(engineNeverAnswered(fetchFailed())).toBe(true);
    expect(engineNeverAnswered(fetchFailed("ECONNRESET"))).toBe(true);
    expect(engineNeverAnswered(fetchFailed("EAI_AGAIN"))).toBe(true);
    expect(engineNeverAnswered(fetchFailed("UND_ERR_SOCKET"))).toBe(true);
    expect(engineNeverAnswered(noAddressAnswered())).toBe(true);
  });

  it("recognises a request we stopped waiting for", () => {
    // Both timeout shapes: the SDK's AbortSignal.timeout, and resilientFetch's.
    expect(engineNeverAnswered(timedOut())).toBe(true);
    expect(
      engineNeverAnswered(new Error("Request to https://cloud.comfy.org timed out after 30000ms"))
    ).toBe(true);
  });

  it("does not claim an answer the engine actually gave", () => {
    // A rejected key, a failed node, an out-of-credit account: all verdicts.
    expect(engineNeverAnswered(new Error("Comfy Cloud rejected the API key"))).toBe(false);
    expect(engineNeverAnswered(new Error("KSampler: CUDA out of memory"))).toBe(false);
    expect(engineNeverAnswered("not an error")).toBe(false);
  });
});

describe("errorCode", () => {
  it("digs the code out of an AggregateError over every address tried", () => {
    expect(errorCode(noAddressAnswered())).toBe("ETIMEDOUT");
  });

  it("reads the ordinary single-cause shape too", () => {
    expect(errorCode(fetchFailed("ECONNRESET"))).toBe("ECONNRESET");
    expect(errorCode(new Error("plain"))).toBe(null);
  });

  it("keeps looking past a cause that carries no code", () => {
    // Both shapes at once: a bare cause and one coded entry per address. A
    // search that stopped at the cause reported no code at all, and no code
    // means no connect-phase retry for a request that was safe to repeat.
    const coded = new Error("connect ECONNREFUSED");
    (coded as { code?: string }).code = "ECONNREFUSED";
    const aggregate = new AggregateError([coded], "");
    (aggregate as { cause?: unknown }).cause = new Error("no code here");

    expect(errorCode(aggregate)).toBe("ECONNREFUSED");
  });
});

describe("createEngineFetch", () => {
  const okResponse = () => new Response("{}", { status: 200 });

  it("repeats a POST whose connection never opened", async () => {
    // The observed failure: uploading an input to Comfy Cloud failed on roughly
    // half of attempts with this exact shape, and nothing retried it.
    let calls = 0;
    const inner = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw noAddressAnswered();
      return okResponse();
    });
    vi.stubGlobal("fetch", inner);

    const engineFetch = createEngineFetch({ retryBaseMs: 0 });
    const res = await engineFetch("https://cloud.comfy.org/api/v2/jobs", { method: "POST" });

    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("does not repeat a POST the engine may already have acted on", async () => {
    // A socket that opened and then broke could have delivered the request, so
    // sending it again risks a second job on the user's bill.
    const inner = vi.fn(async () => {
      throw fetchFailed("ECONNRESET");
    });
    vi.stubGlobal("fetch", inner);

    const engineFetch = createEngineFetch({ retryBaseMs: 0 });
    await expect(
      engineFetch("https://cloud.comfy.org/api/v2/jobs", { method: "POST" })
    ).rejects.toThrow("fetch failed");
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("repeats a GET on any unanswered request, since asking twice costs nothing", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      if (calls < 2) throw fetchFailed("ECONNRESET");
      return okResponse();
    });

    const engineFetch = createEngineFetch({ retryBaseMs: 0 });
    expect((await engineFetch("https://cloud.comfy.org/api/queue")).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("hands back an answer the engine gave, however bad", async () => {
    // A 500 is the engine talking. Retrying it here would hide it and bill twice.
    const inner = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", inner);

    const engineFetch = createEngineFetch({ retryBaseMs: 0 });
    expect((await engineFetch("https://cloud.comfy.org/api/v2/jobs", { method: "POST" })).status).toBe(500);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  /** A fetch that never answers, so only the armed timeout ends it. */
  const stubStalledFetch = (starts: number[]) =>
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      starts.push(Date.now());
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });

  it("does not let one stalled request outlast the caller's whole budget", async () => {
    // The failure this prevents: a poll inherited the timeout meant for
    // downloading a finished video, and was then retried four times. One
    // request could occupy 25 minutes, so an 8-second video reported "timed out
    // after 15 min" having been asked about exactly once.
    const starts: number[] = [];
    stubStalledFetch(starts);

    // 200ms rather than 40: the deadline is two timeouts and it is only checked
    // between attempts, so the expected elapsed time is 2-3x the timeout either
    // way — but at 40ms the margin left over is small enough that one GC pause
    // on a loaded CI runner fails a test that found nothing wrong.
    const engineFetch = createEngineFetch({ retryBaseMs: 0, requestTimeoutMs: 200 });
    const began = Date.now();
    await expect(engineFetch("https://cloud.comfy.org/api/v2/jobs/job-1")).rejects.toThrow();

    // Bounded by elapsed time, not by the retry count: four retries of one
    // timeout would be five times the wait, and the caller checks its own
    // deadline only between requests.
    expect(Date.now() - began).toBeLessThan(200 * 4);
    expect(starts.length).toBeGreaterThanOrEqual(1);
  });

  it("holds a connect failure to the same deadline once it costs a timeout", async () => {
    // `ETIMEDOUT` is a connect failure — nothing was sent, so repeating is safe
    // — but unlike a refused connection it costs the whole timeout. Bounding
    // that branch by the retry count alone let five attempts against an
    // unreachable dual-stack host run for minutes on an asset route.
    const starts: number[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      starts.push(Date.now());
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(noAddressAnswered()), { once: true });
      });
    });

    const engineFetch = createEngineFetch({ retryBaseMs: 0, requestTimeoutMs: 200, retries: 4 });
    const began = Date.now();
    await expect(engineFetch("https://cloud.comfy.org/api/v2/jobs/job-1")).rejects.toThrow();

    expect(Date.now() - began).toBeLessThan(200 * 4);
    expect(starts.length).toBeLessThanOrEqual(3);
  });

  it("still spends its whole retry count on connect failures that cost nothing", async () => {
    // The reason the count exists: a refused connection fails in milliseconds,
    // and roughly two Comfy Cloud submits in five needed a second attempt.
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      if (calls <= 4) throw fetchFailed("ECONNREFUSED");
      return new Response("{}", { status: 200 });
    });

    const engineFetch = createEngineFetch({ retryBaseMs: 0, retries: 4 });
    expect((await engineFetch("https://cloud.comfy.org/api/v2/jobs")).status).toBe(200);
    expect(calls).toBe(5);
  });

  it("counts the backoff against the same budget the requests spend", async () => {
    // The check that a retry is allowed happens *before* the sleep, so a large
    // configured backoff could cross the deadline and still start another full
    // attempt — the budget the comment promises, spent twice over.
    const starts: number[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      starts.push(Date.now());
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(noAddressAnswered()), { once: true });
      });
    });

    const engineFetch = createEngineFetch({
      requestTimeoutMs: 150,
      retryBaseMs: 5_000,
      retries: 4,
    });
    const began = Date.now();
    await expect(engineFetch("https://cloud.comfy.org/api/v2/jobs/job-1")).rejects.toThrow();

    // One attempt, then a backoff clipped to what is left of the deadline.
    expect(Date.now() - began).toBeLessThan(150 * 4);
    expect(starts.length).toBe(1);
  });

  it("releases the body of a response it is about to throw away", async () => {
    // An unread body holds its socket until the collector gets to it, so a run
    // that retries a 429 several times leaks one connection per attempt.
    const cancelled: string[] = [];
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 429,
          statusText: "Too Many Requests",
          headers: new Headers(),
          body: {
            cancel: async () => {
              cancelled.push("first");
            },
          },
        } as unknown as Response;
      }
      return new Response("{}", { status: 200 });
    });

    const { resilientFetch } = await import("../server/fetch");
    const res = await resilientFetch("https://cloud.comfy.org/api/v2/jobs", {
      retries: 1,
      retryBaseMs: 0,
    });

    expect(res.status).toBe(200);
    expect(cancelled).toEqual(["first"]);
  });

  it("gives an asset transfer longer than a poll", async () => {
    // Same client and same code path — only the URL differs. A poll is a few
    // hundred bytes; collecting a finished job can be a whole video.
    const starts: number[] = [];
    stubStalledFetch(starts);
    const engineFetch = createEngineFetch({
      retryBaseMs: 0,
      requestTimeoutMs: 30,
      downloadTimeoutMs: 400,
    });

    const pollBegan = Date.now();
    await expect(engineFetch("https://cloud.comfy.org/api/v2/jobs/job-1")).rejects.toThrow();
    const pollTook = Date.now() - pollBegan;

    const assetBegan = Date.now();
    await expect(
      engineFetch("https://cloud.comfy.org/api/v2/assets/abc/content")
    ).rejects.toThrow();
    const assetTook = Date.now() - assetBegan;

    expect(assetTook).toBeGreaterThan(pollTook * 2);
  }, 20_000);

  it("stops the moment the caller cancels, without waiting out the backoff", async () => {
    // Cancelling during a wait has to land when the user asks. Left to run, the
    // backoff finishes first — Stop appears to do nothing for a second or two,
    // and the loop then opens another attempt with a signal already aborted.
    const controller = new AbortController();
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      setTimeout(() => controller.abort(), 20);
      throw noAddressAnswered();
    });

    const engineFetch = createEngineFetch({ retryBaseMs: 10_000, retries: 4 });
    const began = Date.now();
    await expect(
      engineFetch("https://cloud.comfy.org/api/queue", { signal: controller.signal })
    ).rejects.toThrow();

    expect(Date.now() - began).toBeLessThan(1_000);
    expect(calls).toBe(1);
  });

  it("stops when the caller cancels", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", async () => {
      controller.abort();
      throw noAddressAnswered();
    });

    const engineFetch = createEngineFetch({ retryBaseMs: 0 });
    await expect(
      engineFetch("https://cloud.comfy.org/api/v2/jobs", {
        method: "POST",
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

describe("SdkComfyEngine.poll", () => {
  it("marks an unreachable engine transient, not a verdict", async () => {
    // The failure this fixes: one dropped socket during a long render used to
    // read as "the job failed", ending a render that was still going.
    const engine = engineWith(() => {
      throw fetchFailed("ECONNRESET");
    });
    const error = await engine.poll("job-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ComfyEngineError);
    expect((error as ComfyEngineError).transient).toBe(true);
    expect((error as ComfyEngineError).status).toBe(503);
    expect((error as ComfyEngineError).message).toContain("Could not reach Comfy Cloud");
  });

  it("keeps an engine verdict terminal", async () => {
    const engine = engineWith(() => {
      throw new Error("job 1 does not exist");
    });
    const error = (await engine.poll("job-1").catch((e: unknown) => e)) as ComfyEngineError;
    expect(error.transient).toBe(false);
    expect(error.status).toBe(502);
    expect(error.message).toContain("Could not read the job from Comfy Cloud");
  });

  it("reports a failed job as a state, not an exception", async () => {
    const engine = engineWith(() => ({
      status: "failed",
      error: { message: "out of memory", node_id: "31" },
    }));
    const state = await engine.poll("job-1");
    expect(state.terminal).toBe(true);
    expect(state.error).toContain("out of memory");
  });
});
