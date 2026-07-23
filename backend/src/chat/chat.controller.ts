import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';

/**
 * ChatController exposes two endpoints:
 *
 *  POST /chat          → full response (Phase 2, kept for reference)
 *  GET  /chat/stream   → SSE streaming response (Phase 3)
 *
 * Why GET for SSE?
 * The browser's built-in EventSource API only supports GET requests.
 * We pass the message as a query parameter.
 * If you needed POST + streaming (e.g. with a large body), you'd use
 * fetch() + ReadableStream on the frontend instead.
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ── Phase 2: Full response ─────────────────────────────────────────────────
  @Post()
  @HttpCode(200)
  async chat(@Body() body: { message: string }): Promise<{ reply: string }> {
    const reply = await this.chatService.chat(body.message);
    return { reply };
  }

  // ── Phase 3: Streaming SSE response ───────────────────────────────────────
  /**
   * @Sse() tells NestJS to set the response headers:
   *   Content-Type: text/event-stream
   *   Cache-Control: no-cache
   *   Connection: keep-alive
   *
   * It then subscribes to the returned Observable and writes each emitted
   * value to the response as:  data: <JSON.stringify(value.data)>\n\n
   *
   * The browser's EventSource auto-reconnects on network errors.
   * We don't want that here (it would restart the generation), so the
   * frontend closes the EventSource when it receives [DONE].
   */
  @Sse('stream')
  stream(@Query('message') message: string): Observable<MessageEvent> {
    return this.chatService.streamChat(message);
  }
}
