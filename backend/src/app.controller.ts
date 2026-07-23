import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * AppController handles global endpoints.
 * GET /health is the most important one — it's what:
 *   - Your frontend calls to verify the backend is up
 *   - A load balancer (ALB/ECS) would call to know if the pod is healthy
 *   - You use to verify Ollama and Qdrant are reachable from the backend
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
