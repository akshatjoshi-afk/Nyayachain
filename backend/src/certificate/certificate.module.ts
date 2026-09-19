import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CasesModule } from '../cases/cases.module';
import { CertificateService } from './certificate.service';
import { CertificateController } from './certificate.controller';

@Module({
  imports: [PrismaModule, CasesModule],
  providers: [CertificateService],
  controllers: [CertificateController],
  exports: [CertificateService],
})
export class CertificateModule {}
