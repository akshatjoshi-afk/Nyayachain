import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from './audit.service';

/**
 * AuditController exposes:
 * GET /audit              — Full audit log (ADMIN only)
 * GET /audit/verify-chain — Validates full hash-chain integrity across all docs (ADMIN only)
 */
@Controller('audit')
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles('ADMIN')
  async getAuditLog() {
    return this.auditService.getAuditLog();
  }

  @Get('verify-chain')
  @Roles('ADMIN')
  async verifyChain() {
    return this.auditService.verifyChain();
  }
}
