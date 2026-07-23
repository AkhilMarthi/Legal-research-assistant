import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [ChatModule, DocumentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
