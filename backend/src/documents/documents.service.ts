import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CasesService } from '../cases/cases.service';
import * as crypto from 'crypto';
import { BlockchainService } from '../blockchain/blockchain.service';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData = require('form-data');

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const getAiServiceUrl = () => process.env.AI_SERVICE_URL || 'http://localhost:8001';

export type ComparisonResult = 'NEW' | 'DUPLICATE' | 'TAMPERED' | 'NOT_FOUND';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private casesService: CasesService,
    private blockchainService: BlockchainService,
  ) {}

  private hashStringOrBuffer(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Helper method to call external Python FastAPI OCR service
   */
  private async extractTextViaOCR(filePath: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));

      const ocrBaseUrl = process.env.OCR_SERVICE_URL || 'http://localhost:8000';
      const response = await axios.post(`${ocrBaseUrl}/extract-text`, formData, {
        headers: formData.getHeaders(),
        timeout: 240000,
      });

      return response.data?.text || '';
    } catch (error: any) {
      console.warn('OCR extraction failed, continuing without extracted text:', error.message || error);
      return '';
    }
  }

  /**
   * SHARED HELPER FUNCTION — Single Source of Truth
   * Compares a given file hash against any stored document record with the same filename inside caseId.
   */
  async compareAgainstStoredDocument(
    caseId: number,
    filename: string,
    newFileHash: string,
    isVerifyMode = false,
  ): Promise<{ status: ComparisonResult; storedDoc?: any }> {
    const storedDoc = await this.prisma.document.findFirst({
      where: { caseId, originalName: filename },
      include: { uploader: { select: { username: true, role: true } } },
      orderBy: { uploadedAt: 'desc' },
    });

    if (!storedDoc) {
      return { status: isVerifyMode ? 'NOT_FOUND' : 'NEW' };
    }

    if (storedDoc.fileHash === newFileHash) {
      return { status: 'DUPLICATE', storedDoc };
    }

    return { status: 'TAMPERED', storedDoc };
  }

  /**
   * POST /documents/upload
   */
  async uploadDocument(
    file: Express.Multer.File,
    caseId: number,
    userId: number,
    role: string,
    evidenceType: string = 'SECONDARY',
  ) {
    if (!caseId) throw new BadRequestException('caseId is required for document upload.');

    // 1. Enforce Case Access Security Check
    await this.casesService.validateCaseAccess(caseId, userId, role);

    const newFileHash = this.hashStringOrBuffer(file.buffer);

    // 2. Call Shared Tamper-Check Helper
    const comparison = await this.compareAgainstStoredDocument(caseId, file.originalname, newFileHash);

    // 3A. Handle DUPLICATE
    if (comparison.status === 'DUPLICATE') {
      const message = `This exact document already exists in this case — no changes detected.`;

      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'DUPLICATE_UPLOAD',
          documentId: comparison.storedDoc.id,
          result: `Attempted duplicate upload of "${file.originalname}" in Case #${caseId}`,
        },
      });

      return {
        status: 'duplicate',
        accepted: false,
        message,
        document: comparison.storedDoc,
      };
    }

    // 3B. Handle TAMPERED AT UPLOAD TIME
    if (comparison.status === 'TAMPERED') {
      const message = `⚠️ Tampering Detected: A document named "${file.originalname}" already exists in Case #${caseId} with different content! Upload blocked to preserve original record integrity.`;

      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'TAMPERED_UPLOAD_ATTEMPT',
          documentId: comparison.storedDoc.id,
          result: `BLOCKED TAMPERED UPLOAD: "${file.originalname}" in Case #${caseId}. Stored Hash: ${comparison.storedDoc.fileHash.substring(0, 10)}... vs Attempted Hash: ${newFileHash.substring(0, 10)}...`,
        },
      });

      const response: any = {
        status: 'tampered',
        accepted: false,
        message,
        forensics: {
          uploaderUsername: comparison.storedDoc.uploader.username,
          uploadedAt: comparison.storedDoc.uploadedAt,
          attemptedAt: new Date(),
        },
      };

      if (role === 'ADMIN') {
        response.storedFileHash = comparison.storedDoc.fileHash;
        response.attemptedFileHash = newFileHash;
      }

      return response;
    }

    // 3C. Handle NEW DOCUMENT — Proceed with upload & Hash-Chaining within this specific caseId
    const latestDocInCase = await this.prisma.document.findFirst({
      where: { caseId },
      orderBy: { id: 'desc' },
    });

    const previousHash = latestDocInCase ? latestDocInCase.chainHash : GENESIS_HASH;
    const chainHash = this.hashStringOrBuffer(newFileHash + previousHash);

    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const storedFilename = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(uploadsDir, storedFilename);
    fs.writeFileSync(filePath, file.buffer);

    // Call OCR extraction on NEW file
    const extractedText = await this.extractTextViaOCR(filePath);

    const document = await this.prisma.document.create({
      data: {
        caseId,
        filename: storedFilename,
        originalName: file.originalname,
        fileHash: newFileHash,
        chainHash,
        previousHash,
        extractedText: extractedText || null,
        evidenceType,
        uploaderId: userId,
      },
    });
    // Anchor this case's latest chainHash on-chain — non-blocking, fails gracefully
     const blockchainTxHash = await this.blockchainService.anchorCaseHash(String(caseId), chainHash);
     if (blockchainTxHash) {
       await this.prisma.document.update({
         where: { id: document.id },
         data: { blockchainTxHash },
       });
       document.blockchainTxHash = blockchainTxHash;
     }

    // AI Service: Ingest & Graph Extraction (fail gracefully)
    const textToProcess = extractedText || file.originalname;
    const aiBaseUrl = getAiServiceUrl();
    try {
      await fetch(`${aiBaseUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToProcess,
          case_id: String(caseId),
          doc_name: file.originalname,
        }),
      });
    } catch (e: any) {
      console.warn('AI Ingest failed, continuing without vector store:', e.message || e);
    }

    try {
      const graphRes = await fetch(`${aiBaseUrl}/extract-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToProcess,
          case_id: String(caseId),
          doc_name: file.originalname,
        }),
      });
      if (graphRes.ok) {
        const graphData = await graphRes.json();
        await this.processGraphExtraction(caseId, file.originalname, graphData);
      }
    } catch (e: any) {
      console.warn('Graph extraction failed, continuing:', e.message || e);
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'UPLOAD',
        documentId: document.id,
        result: `Uploaded "${file.originalname}" in Case #${caseId} — FileHash: ${newFileHash.substring(0, 16)}..., ChainHash: ${chainHash.substring(0, 16)}...`,
      },
    });

    return {
      status: 'new',
      accepted: true,
      message: `Document "${file.originalname}" uploaded and chained successfully into Case #${caseId}.`,
      document,
    };
  }

  /**
   * GET /documents?caseId=... & optional q=...
   * GET /documents/search?caseId=... & optional q=...
   */
  async getDocuments(caseId: number, userId: number, role: string, searchQuery?: string) {
    if (!caseId) throw new BadRequestException('caseId query parameter is required.');

    // Enforce Case Access Security Check
    await this.casesService.validateCaseAccess(caseId, userId, role);

    const whereClause: any = { caseId };

    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.trim();
      whereClause.OR = [
        { originalName: { contains: q } },
        { extractedText: { contains: q } },
      ];
    }

    const docs = await this.prisma.document.findMany({
      where: whereClause,
      include: {
        uploader: {
          select: { username: true, role: true },
        },
        certificate: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    if (role !== 'ADMIN') {
      return docs.map(({ fileHash, chainHash, previousHash, ...rest }) => rest);
    }

    return docs;
  }

  /**
   * POST /documents/verify (Secondary Manual Check)
   */
  async verifyDocument(
    file: Express.Multer.File,
    caseId: number,
    userId: number,
    role: string,
  ) {
    if (!caseId) throw new BadRequestException('caseId is required for verification.');

    // Enforce Case Access Security Check
    await this.casesService.validateCaseAccess(caseId, userId, role);

    const recomputedFileHash = this.hashStringOrBuffer(file.buffer);

    // Use SAME Shared Helper
    const comparison = await this.compareAgainstStoredDocument(caseId, file.originalname, recomputedFileHash, true);

    if (comparison.status === 'NOT_FOUND') {
      const message = `🔍 No stored record found for "${file.originalname}" in Case #${caseId}. Upload the document first.`;
      
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'NOT_FOUND',
          result: message,
        },
      });

      return {
        status: 'not_found',
        verified: false,
        filename: file.originalname,
        message,
      };
    }

    if (comparison.status === 'DUPLICATE') {
      const message = `✅ Document "${file.originalname}" integrity verified`;

      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'VERIFY_OK',
          documentId: comparison.storedDoc.id,
          result: message,
        },
      });

      return {
        status: 'verified',
        verified: true,
        filename: file.originalname,
        message,
      };
    }

    // TAMPERED
    const message = `⚠️ Document "${file.originalname}" has been TAMPERED with!`;

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'TAMPERED',
        documentId: comparison.storedDoc.id,
        result: message,
      },
    });

    const result: any = {
      status: 'tampered',
      verified: false,
      filename: file.originalname,
      message,
    };

    if (role === 'ADMIN') {
      result.storedFileHash = comparison.storedDoc.fileHash;
      result.recomputedFileHash = recomputedFileHash;
      result.chainHash = comparison.storedDoc.chainHash;
      result.previousHash = comparison.storedDoc.previousHash;
      result.forensics = {
        uploaderUsername: comparison.storedDoc.uploader.username,
        uploadedAt: comparison.storedDoc.uploadedAt,
        verifiedAt: new Date(),
      };
    }

    return result;
  }
  async askQuestion(caseId: number, question: string, userId: number, role: string) {
    await this.casesService.validateCaseAccess(caseId, userId, role);

    const res = await fetch(`${getAiServiceUrl()}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, case_id: String(caseId) }),
    });

    const result: any = await res.json();

    // Find entities in this case mentioned in answer or source chunks
    const entitiesInCase = await this.prisma.entity.findMany({
      where: { caseId },
    });

    const combinedText = `${result.answer || ''} ${(result.sources || []).map((s: any) => s.text || '').join(' ')}`.toLowerCase();

    const matchingEntities = entitiesInCase
      .filter((entity) => entity.name && combinedText.includes(entity.name.toLowerCase()))
      .map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
      }));

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'AI_QUERY',
        result: `Asked: "${question}" on Case #${caseId}`,
      },
    });

    return {
      ...result,
      matchingEntities,
    };
  }

  private async processGraphExtraction(caseId: number, docName: string, graphData: any) {
    const { entities = [], relationships = [] } = graphData;
    const entityMap = new Map<string, number>();

    for (const ent of entities) {
      if (!ent.name || !ent.type) continue;
      const typeStr = String(ent.type).toUpperCase();
      let eventDate: Date | null = null;
      if (typeStr === 'EVENT' && ent.date) {
        const parsed = new Date(ent.date);
        if (!isNaN(parsed.getTime())) eventDate = parsed;
      }

      let dbEntity = await this.prisma.entity.findFirst({
        where: {
          caseId,
          name: ent.name,
          type: typeStr,
        },
      });

      if (!dbEntity) {
        dbEntity = await this.prisma.entity.create({
          data: {
            caseId,
            name: ent.name,
            type: typeStr,
            date: eventDate,
          },
        });
      }
      entityMap.set(ent.name.toLowerCase(), dbEntity.id);
    }

    for (const rel of relationships) {
      if (!rel.source_entity || !rel.target_entity || !rel.relationship_type) continue;
      const sourceId = entityMap.get(String(rel.source_entity).toLowerCase());
      const targetId = entityMap.get(String(rel.target_entity).toLowerCase());

      if (sourceId && targetId) {
        await this.prisma.relationship.create({
          data: {
            caseId,
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            relationshipType: String(rel.relationship_type).toUpperCase(),
            sourceDocument: docName,
          },
        });
      }
    }
  }
  async verifyAgainstBlockchain(caseId: number, userId: number, role: string) {
    await this.casesService.validateCaseAccess(caseId, userId, role);

    const latestDoc = await this.prisma.document.findFirst({
      where: { caseId },
      orderBy: { id: 'desc' },
    });

    if (!latestDoc) {
      return { status: 'no_documents', message: `No documents found in Case #${caseId} to verify.` };
    }

    const dbChainHash = latestDoc.chainHash;
    const onChainHash = await this.blockchainService.getOnChainAnchor(String(caseId));
    const match = dbChainHash === onChainHash;

    return {
      status: match ? 'verified' : 'mismatch',
      match,
      dbChainHash,
      onChainHash,
      message: match
        ? '✅ Database hash-chain matches the blockchain anchor — no tampering detected.'
        : '⚠️ Mismatch detected! The database record does not match the blockchain anchor.',
    };
  }

  /**
   * GET /documents/:id/file
   * Streams the document file from disk after verifying case access and logs audit entry.
   */
  async getDocumentFile(id: number, userId: number, role: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!doc) {
      throw new NotFoundException(`Document #${id} not found.`);
    }

    // Security access check
    await this.casesService.validateCaseAccess(doc.caseId, userId, role);

    const uploadsDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadsDir, doc.filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File content for "${doc.originalName}" not found on server storage.`);
    }

    // Write Audit Log entry for document file access
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'VIEW_DOCUMENT',
        documentId: doc.id,
        result: `Accessed file "${doc.originalName}" in Case #${doc.caseId}`,
      },
    });

    const mimeType = this.getMimeType(doc.originalName);
    const stream = fs.createReadStream(filePath);

    return { stream, originalName: doc.originalName, mimeType };
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * GET /documents/:id/text
   * Returns extracted OCR text for a document after verifying case access.
   */
  async getDocumentText(id: number, userId: number, role: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true, caseId: true, originalName: true, extractedText: true },
    });

    if (!doc) {
      throw new NotFoundException(`Document #${id} not found.`);
    }

    // Security access check
    await this.casesService.validateCaseAccess(doc.caseId, userId, role);

    return {
      id: doc.id,
      originalName: doc.originalName,
      extractedText: doc.extractedText || null,
    };
  }
}
