import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { DocumentsModule } from './documents/documents.module';
import { AuditModule } from './audit/audit.module';
import { CertificateModule } from './certificate/certificate.module';
import { BlockchainModule } from './blockchain/blockchain.module';

@Module({
  imports: [
    /**
     * ThrottlerModule — IP-level rate limiting (second layer on top of per-account lockout).
     * Default: 10 requests per 60-second window per IP.
     * Values come from .env; defaults are conservative fallbacks.
     * Applied globally via APP_GUARD below; the login controller opts in via @Throttle().
     */
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT || '10', 10),
      },
    ]),
    PrismaModule,
    AuthModule,
    CasesModule,
    DocumentsModule,
    AuditModule,
    CertificateModule,
    BlockchainModule,
  ],
  providers: [
    {
      // Register ThrottlerGuard globally so it's available everywhere,
      // but individual controllers/routes choose when to apply @Throttle()
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
