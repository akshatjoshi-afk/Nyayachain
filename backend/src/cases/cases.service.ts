import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CasesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Admin only: Create a new Case with caseNumber & title
   */
  async createCase(caseNumber: string, title: string) {
    const existing = await this.prisma.case.findUnique({
      where: { caseNumber },
    });

    if (existing) {
      throw new ConflictException(`Case with number "${caseNumber}" already exists.`);
    }

    return this.prisma.case.create({
      data: { caseNumber, title },
    });
  }

  /**
   * Admin only: Assign an investigator (userId) to a case (caseId)
   */
  async assignUserToCase(caseId: number, userId: number) {
    const caseItem = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseItem) throw new NotFoundException(`Case #${caseId} not found.`);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User #${userId} not found.`);

    return this.prisma.caseAssignment.upsert({
      where: {
        caseId_userId: { caseId, userId },
      },
      update: {},
      create: { caseId, userId },
      include: {
        user: { select: { username: true, role: true } },
        case: { select: { caseNumber: true, title: true } },
      },
    });
  }

  /**
   * Admin only: Revoke an investigator (userId) access from a case (caseId)
   * DELETE /cases/:caseId/assign/:userId
   */
  async revokeUserFromCase(caseId: number, userId: number) {
    const assignment = await this.prisma.caseAssignment.findUnique({
      where: {
        caseId_userId: { caseId, userId },
      },
    });

    if (!assignment) {
      throw new NotFoundException(`No assignment record found for User #${userId} on Case #${caseId}.`);
    }

    await this.prisma.caseAssignment.delete({
      where: {
        caseId_userId: { caseId, userId },
      },
    });

    return {
      message: `Successfully revoked access for user #${userId} from case #${caseId}.`,
      caseId,
      userId,
    };
  }

  /**
   * List accessible cases:
   * - ADMIN: sees all cases
   * - INVESTIGATOR: sees only assigned cases via CaseAssignment
   */
  async getCases(userId: number, role: string) {
    if (role === 'ADMIN') {
      return this.prisma.case.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          assignments: {
            include: {
              user: { select: { id: true, username: true, role: true } },
            },
          },
          _count: { select: { documents: true } },
        },
      });
    }

    // Investigator: Query cases assigned to userId live from DB
    return this.prisma.case.findMany({
      where: {
        assignments: {
          some: { userId },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, username: true, role: true } },
          },
        },
        _count: { select: { documents: true } },
      },
    });
  }

  /**
   * Get single case details:
   * Accessible ONLY if user is ADMIN or has a CaseAssignment for this caseId.
   * Throws 403 ForbiddenException if unauthorized.
   */
  async getCaseById(caseId: number, userId: number, role: string) {
    const caseItem = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, username: true, role: true } },
          },
        },
        _count: { select: { documents: true } },
      },
    });

    if (!caseItem) {
      throw new NotFoundException(`Case #${caseId} not found.`);
    }

    if (role !== 'ADMIN') {
      const isAssigned = caseItem.assignments.some((a) => a.userId === userId);
      if (!isAssigned) {
        throw new ForbiddenException(`You do not have permission to access Case #${caseId} (${caseItem.caseNumber}).`);
      }
    }

    return caseItem;
  }

  /**
   * Security Helper: Check if user has permission to access a caseId
   * Checks LIVE against CaseAssignment table in database on every request.
   */
  async validateCaseAccess(caseId: number, userId: number, role: string) {
    if (role === 'ADMIN') return true;

    const assignment = await this.prisma.caseAssignment.findUnique({
      where: {
        caseId_userId: { caseId, userId },
      },
    });

    if (!assignment) {
      throw new ForbiddenException(`Access Denied: You are not assigned to Case #${caseId}.`);
    }

    return true;
  }

  /**
   * GET /cases/:id/graph
   * Returns graph nodes (Entities) and edges (Relationships) formatted for ReactFlow.
   */
  async getCaseGraph(caseId: number, userId: number, role: string) {
    await this.validateCaseAccess(caseId, userId, role);

    const entities = await this.prisma.entity.findMany({
      where: { caseId },
    });

    const relationships = await this.prisma.relationship.findMany({
      where: { caseId },
    });

    const nodes = entities.map((e) => ({
      id: String(e.id),
      data: {
        label: e.name,
        type: e.type,
        date: e.date ? e.date.toISOString() : null,
      },
      position: { x: 0, y: 0 },
    }));

    const edges = relationships.map((r) => ({
      id: String(r.id),
      source: String(r.sourceEntityId),
      target: String(r.targetEntityId),
      label: r.relationshipType,
      sourceDocument: r.sourceDocument,
    }));

    return { nodes, edges };
  }

  /**
   * GET /cases/:id/timeline
   * Returns all EVENT entities for this case ordered by date ascending.
   */
  async getCaseTimeline(caseId: number, userId: number, role: string) {
    await this.validateCaseAccess(caseId, userId, role);

    const events = await this.prisma.entity.findMany({
      where: {
        caseId,
        type: 'EVENT',
      },
      include: {
        sourceRelationships: true,
        targetRelationships: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    return events.map((event) => {
      const sourceDoc =
        event.sourceRelationships[0]?.sourceDocument ||
        event.targetRelationships[0]?.sourceDocument ||
        'Case Evidence';

      return {
        id: event.id,
        name: event.name,
        type: event.type,
        date: event.date ? event.date.toISOString() : null,
        sourceDocument: sourceDoc,
      };
    });
  }
}
