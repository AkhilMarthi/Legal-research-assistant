import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * OllamaMessage represents one turn in a conversation.
 * The 'role' tells the LLM who is speaking:
 *   - 'system'    → instructions/persona. The LLM treats this as ground rules.
 *   - 'user'      → the human's message.
 *   - 'assistant' → the LLM's previous reply (used in Phase 12 for memory).
 */
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * ChatService handles all Ollama communication.
 * Supports both:
 *   - Full response (Phase 2): callOllama() → Promise<string>
 *   - Streaming    (Phase 3): streamOllama() → Observable<MessageEvent>
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  private readonly ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434';
  private readonly llmModel =
    process.env.OLLAMA_LLM_MODEL ?? 'llama3.2';

  // ── The system prompt used by both chat() and streamChat() ─────────────────
  private readonly systemPrompt: OllamaMessage = {
    role: 'system',
    content:
      'You are a helpful legal research assistant. ' +
      'Provide clear, accurate, and concise answers. ' +
      'When you are not certain about something, say so.',
  };

  // ── Phase 2: Full (non-streaming) response ─────────────────────────────────
  async chat(userMessage: string): Promise<string> {
    const messages: OllamaMessage[] = [
      this.systemPrompt,
      { role: 'user', content: userMessage },
    ];
    return this.callOllama(messages);
  }

  // ── Phase 3: Streaming response ────────────────────────────────────────────
  /**
   * Returns an RxJS Observable that emits one MessageEvent per token.
   *
   * Why Observable (not AsyncGenerator or Promise)?
   * NestJS's @Sse() decorator expects Observable<MessageEvent>.
   * Observable gives us clean cancellation when the client disconnects —
   * the subscriber is automatically unsubscribed, and we can close
   * the Ollama connection in the teardown logic.
   *
   * SSE event format (what the browser's EventSource receives):
   *   data: {"token":"A"}\n\n
   *   data: {"token":" contract"}\n\n
   *   ...
   *   data: [DONE]\n\n
   */
  streamChat(userMessage: string): Observable<MessageEvent> {
    const messages: OllamaMessage[] = [
      this.systemPrompt,
      { role: 'user', content: userMessage },
    ];
    return this.streamOllama(messages);
  }

  // ── Internal: Ollama full response ─────────────────────────────────────────
  async callOllama(messages: OllamaMessage[]): Promise<string> {
    this.logger.log(`[full] calling ${this.llmModel}`);

    let response: Response;
    try {
      response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.llmModel,
          messages,
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      this.logger.error('Ollama unreachable', err);
      throw new ServiceUnavailableException('Could not reach the AI model.');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('Ollama returned an error.');
    }

    const data = (await response.json()) as {
      message: { content: string };
    };
    return data.message.content;
  }

  // ── Internal: Ollama streaming ─────────────────────────────────────────────
  /**
   * How Ollama streaming works:
   *
   *  POST /api/chat { stream: true }
   *  ← response body stays open, server keeps writing newline-delimited JSON:
   *
   *  {"message":{"content":"A"},"done":false}
   *  {"message":{"content":" contract"},"done":false}
   *  ...
   *  {"message":{"content":""},"done":true}
   *
   * We read the body as a ReadableStream, decode each chunk with TextDecoder,
   * split on newlines, parse each JSON line, and emit it as an SSE MessageEvent.
   */
  private streamOllama(messages: OllamaMessage[]): Observable<MessageEvent> {
    const url = `${this.ollamaBaseUrl}/api/chat`;
    const model = this.llmModel;
    const logger = this.logger;

    return new Observable<MessageEvent>((subscriber) => {
      // AbortController lets us cancel the Ollama fetch if the client disconnects
      const controller = new AbortController();

      (async () => {
        logger.log(`[stream] calling ${model}`);

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages,
              stream: true, // ← the key difference from Phase 2
              options: { temperature: 0.1 },
            }),
            signal: controller.signal,
          });
        } catch (err: unknown) {
          if ((err as Error).name === 'AbortError') return; // client disconnected, that's fine
          subscriber.error(new ServiceUnavailableException('Could not reach the AI model.'));
          return;
        }

        if (!response.ok || !response.body) {
          subscriber.error(new ServiceUnavailableException('Ollama returned an error.'));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // holds partial lines between chunks

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode the raw bytes to a string and add to our line buffer.
            // Chunks don't always align with JSON lines — we might get half a line.
            buffer += decoder.decode(value, { stream: true });

            // Split on newlines and process complete lines
            const lines = buffer.split('\n');

            // Keep the last (potentially incomplete) line in the buffer
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue; // skip empty lines

              let chunk: { message?: { content: string }; done: boolean };
              try {
                chunk = JSON.parse(trimmed);
              } catch {
                continue; // skip malformed lines
              }

              if (!chunk.done && chunk.message?.content) {
                // Emit one SSE event per token
                // The browser EventSource receives: data: {"token":"A"}\n\n
                subscriber.next({
                  data: { token: chunk.message.content },
                } as MessageEvent);
              } else if (chunk.done) {
                // Signal the frontend that generation is complete
                subscriber.next({ data: '[DONE]' } as MessageEvent);
                subscriber.complete();
                return;
              }
            }
          }
        } catch (err: unknown) {
          if ((err as Error).name !== 'AbortError') {
            subscriber.error(err);
          }
        } finally {
          reader.releaseLock();
        }

        subscriber.complete();
      })();

      // Teardown: called when the client disconnects or unsubscribes.
      // This aborts the in-flight Ollama fetch — no resource leak.
      return () => {
        logger.log('[stream] client disconnected — aborting Ollama request');
        controller.abort();
      };
    });
  }
}
