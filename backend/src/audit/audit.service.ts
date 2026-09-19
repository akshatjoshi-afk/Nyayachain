import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns all audit log entries, newest first.
   */
  async getAuditLog() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { username: true, role: true },
        },
        document: {
          select: { originalName: true, fileHash: true, chainHash: true },
        },
      },
    });
  }

  /**
   * Verifies the entire Hash-Chain integrity across all uploaded documents.
   * Walks through documents ordered by ID (asc) and verifies:
   * 1. previousHash matches previous document's chainHash
   * 2. chainHash === SHA256(fileHash + previousHash)
   */
  async verifyChain() {
    const documents = await this.prisma.document.findMany({
      orderBy: { id: 'asc' },
    });

    if (documents.length === 0) {
      return {
        intact: true,
        totalDocs: 0,
        message: 'Chain intact ✅ (No documents in ledger yet)',
      };
    }

    let expectedPreviousHash = GENESIS_HASH;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      // Check 1: Validate previousHash link
      if (doc.previousHash !== expectedPreviousHash) {
        return {
          intact: false,
          brokenDocId: doc.id,
          filename: doc.originalName,
          reason: `Previous hash mismatch at Document #${doc.id} ("${doc.originalName}"). Expected ${expectedPreviousHash.substring(0, 10)}... but found ${doc.previousHash?.substring(0, 10)}...`,
          message: `⚠️ Hash Chain Broken at Document #${doc.id}!`,
        };
      }

      // Check 2: Recompute chainHash from fileHash + previousHash
      const computedChainHash = crypto
        .createHash('sha256')
        .update(doc.fileHash + doc.previousHash)
        .digest('hex');

      if (computedChainHash !== doc.chainHash) {
        return {
          intact: false,
          brokenDocId: doc.id,
          filename: doc.originalName,
          reason: `Chain hash mismatch at Document #${doc.id} ("${doc.originalName}"). Stored ${doc.chainHash.substring(0, 10)}... vs computed ${computedChainHash.substring(0, 10)}...`,
          message: `⚠️ Hash Chain Broken at Document #${doc.id}!`,
        };
      }

      expectedPreviousHash = doc.chainHash;
    }

    return {
      intact: true,
      totalDocs: documents.length,
      message: `Chain intact ✅ (${documents.length} document${documents.length === 1 ? '' : 's'} verified in linear chain)`,
    };
  }
}
