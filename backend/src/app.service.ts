import { Injectable } from '@nestjs/common';

/**
 * AppService handles the /health check.
 *
 * It pings Ollama and Qdrant to verify backend-to-service connectivity.
 * This is a real health check, not just { status: "ok" }.
 *
 * Why ping dependencies here?
 * In production, a health check that only returns "ok" without checking
 * dependencies is misleading. A pod can be "healthy" while Qdrant is down.
 * A good health check tells you what's actually broken.
 */
@Injectable()
export class AppService {
  async getHealth() {
    const ollamaOk = await this.pingOllama();
    const qdrantOk = await this.pingQdrant();

    return {
      status: ollamaOk && qdrantOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        ollama: ollamaOk,
        qdrant: qdrantOk,
      },
    };
  }

  /**
   * Ping Ollama's /api/tags endpoint.
   * If it responds with any 2xx, Ollama is up and the model runtime is ready.
   */
  private async pingOllama(): Promise<boolean> {
    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434';
      const res = await fetch(`${ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ping Qdrant's /collections endpoint.
   * If it responds, the vector database is ready to accept queries.
   */
  private async pingQdrant(): Promise<boolean> {
    try {
      const qdrantHost = process.env.QDRANT_HOST ?? 'qdrant';
      const qdrantPort = process.env.QDRANT_PORT ?? '6333';
      const res = await fetch(`http://${qdrantHost}:${qdrantPort}/collections`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
