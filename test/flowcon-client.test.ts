import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { FlowConClient } from "../src/flowcon-client";

describe("FlowConClient", () => {
  const mockFetch = mock(() => Promise.resolve(new Response()));
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as any;
    mockFetch.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("constructor", () => {
    test("creates client with server URL and PAT", () => {
      const client = new FlowConClient("http://localhost:8080", "test-token");
      expect(client).toBeDefined();
    });
  });

  describe("sendMemory", () => {
    test("POSTs memory to /api/memories endpoint", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const client = new FlowConClient(
        "http://localhost:8080",
        "test-pat-token",
      );
      await client.sendMemory({ content: "test memory", tags: ["test"] });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:8080/api/memories");
      expect(options?.method).toBe("POST");
    });

    test("includes Authorization header with PAT", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const client = new FlowConClient(
        "http://localhost:8080",
        "secret-pat-123",
      );
      await client.sendMemory({ content: "test", tags: [] });

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toMatchObject({
        Authorization: "Bearer secret-pat-123",
      });
    });

    test("sends JSON content-type header", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const client = new FlowConClient("http://localhost:8080", "token");
      await client.sendMemory({ content: "test", tags: [] });

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toMatchObject({
        "Content-Type": "application/json",
      });
    });

    test("serializes memory object as JSON body", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const client = new FlowConClient("http://localhost:8080", "token");
      const memory = { content: "important memory", tags: ["work", "urgent"] };
      await client.sendMemory(memory);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.body).toBe(JSON.stringify(memory));
    });

    test("returns success true when server responds 200", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "123" }), { status: 200 }),
      );

      const client = new FlowConClient("http://localhost:8080", "token");
      const result = await client.sendMemory({ content: "test", tags: [] });

      expect(result).toEqual({ success: true });
    });

    test("retries with exponential backoff on failure", async () => {
      // Fail twice, succeed on third attempt
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        );

      const client = new FlowConClient("http://localhost:8080", "token");
      const result = await client.sendMemory({ content: "test", tags: [] });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ success: true });
    });

    test("uses exponential backoff: 1s, 2s, 4s", async () => {
      const delays: number[] = [];
      const startTimes: number[] = [];

      mockFetch.mockImplementation(async () => {
        startTimes.push(Date.now());
        throw new Error("Network error");
      });

      const client = new FlowConClient("http://localhost:8080", "token");

      // Capture delays between attempts
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: any, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0); // Speed up test
      }) as any;

      try {
        await client.sendMemory({ content: "test", tags: [] });
      } catch {
        // Expected to fail after retries
      }

      global.setTimeout = originalSetTimeout;

      // Should have delays: 1000ms, 2000ms (before 3rd attempt, which fails)
      expect(delays.length).toBeGreaterThanOrEqual(2);
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
    });

    test("limits retries to 3 attempts", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const client = new FlowConClient("http://localhost:8080", "token");

      // Should gracefully degrade - return success even after all retries fail
      const result = await client.sendMemory({ content: "test", tags: [] });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ success: true }); // Graceful degradation
    });

    test("returns success even when server is unreachable (non-blocking)", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const client = new FlowConClient("http://localhost:8080", "token");
      const result = await client.sendMemory({ content: "test", tags: [] });

      // Should NOT throw - graceful degradation
      expect(result).toEqual({ success: true });
    });

    test("returns success even on 500 server error (non-blocking)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
        }),
      );

      const client = new FlowConClient("http://localhost:8080", "token");
      const result = await client.sendMemory({ content: "test", tags: [] });

      // Should NOT throw - graceful degradation
      expect(result).toEqual({ success: true });
    });

    test("returns success even on 404 not found (non-blocking)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );

      const client = new FlowConClient("http://localhost:8080", "token");
      const result = await client.sendMemory({ content: "test", tags: [] });

      // Should NOT throw - graceful degradation
      expect(result).toEqual({ success: true });
    });
  });
});
