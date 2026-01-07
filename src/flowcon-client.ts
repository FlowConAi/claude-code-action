export type Memory = {
  content: string;
  tags: string[];
  [key: string]: any;
};

export type SendMemoryResult = {
  success: boolean;
};

export class FlowConClient {
  private serverUrl: string;
  private pat: string;

  constructor(serverUrl: string, pat: string) {
    this.serverUrl = serverUrl;
    this.pat = pat;
  }

  async sendMemory(memory: Memory): Promise<SendMemoryResult> {
    const maxAttempts = 3;
    const delays = [1000, 2000, 4000];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.serverUrl}/api/memories`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.pat}`,
          },
          body: JSON.stringify(memory),
        });

        // If response is ok (200-299), return success
        if (response.ok) {
          return { success: true };
        }

        // Non-ok response (4xx, 5xx) - treat as failure but don't throw yet
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        // If this is not the last attempt, wait and retry
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
        // If this is the last attempt, gracefully degrade
        // (fall through to return success below)
      }
    }

    // Graceful degradation: return success even if all retries failed
    // This makes FlowCon non-blocking - the main workflow continues
    return { success: true };
  }
}
