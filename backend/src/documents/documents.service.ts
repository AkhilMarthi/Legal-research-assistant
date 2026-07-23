import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type DocumentStatus =
  | 'uploaded'
  | 'parsing'
  | 'parsed'
  | 'chunked'
  | 'embedding'
  | 'indexed'
  | 'failed';

export interface DocumentMeta {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  status: DocumentStatus;
  uploadedAt: string;
}

@Injectable()
export class DocumentsService {
  private readonly documents = new Map<string, DocumentMeta>();

  create(file: any): DocumentMeta {
    const docId = randomUUID();
    const docMeta: DocumentMeta = {
      id: docId,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
    };

    this.documents.set(docId, docMeta);
    return docMeta;
  }

  findAll(): DocumentMeta[] {
    return Array.from(this.documents.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
  }

  findOne(id: string): DocumentMeta {
    const doc = this.documents.get(id);
    if (!doc) {
      throw new NotFoundException(`Document with ID "${id}" not found.`);
    }
    return doc;
  }

  updateStatus(id: string, status: DocumentStatus): DocumentMeta {
    const doc = this.findOne(id);
    doc.status = status;
    this.documents.set(id, doc);
    return doc;
  }

  remove(id: string): boolean {
    this.findOne(id);
    return this.documents.delete(id);
  }
}
