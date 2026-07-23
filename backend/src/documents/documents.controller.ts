import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { DocumentMeta } from './documents.service';
import { DocumentsService } from './documents.service';

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        const allowedMimetypes = [
          'application/pdf',
          'text/plain',
          'text/markdown',
          'text/x-markdown',
        ];
        const allowedExts = ['.pdf', '.txt', '.md', '.markdown'];
        const ext = extname(file.originalname).toLowerCase();

        if (allowedMimetypes.includes(file.mimetype) || allowedExts.includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Invalid file type. Only PDF, TXT, and Markdown files are supported. Received: ${file.mimetype} (${ext})`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadFile(@UploadedFile() file: any): DocumentMeta {
    if (!file) {
      throw new BadRequestException('File is required. Please attach a file under the "file" field.');
    }
    return this.documentsService.create(file);
  }

  @Get()
  findAll(): DocumentMeta[] {
    return this.documentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): DocumentMeta {
    return this.documentsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string): { success: boolean } {
    const success = this.documentsService.remove(id);
    return { success };
  }
}
