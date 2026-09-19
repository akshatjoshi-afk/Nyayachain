import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CertificateService, CreateCertificateDto } from './certificate.service';

@Controller('documents')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class CertificateController {
  constructor(private certificateService: CertificateService) {}

  @Post(':documentId/certificate')
  async createCertificate(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: CreateCertificateDto,
    @Request() req: any,
  ) {
    return this.certificateService.createCertificate(
      documentId,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Get(':documentId/certificate')
  async getCertificate(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Request() req: any,
  ) {
    return this.certificateService.getCertificate(
      documentId,
      req.user.id,
      req.user.role,
    );
  }

  @Get(':documentId/certificate/pdf')
  async downloadCertificatePdf(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.certificateService.generateCertificatePdf(
      documentId,
      req.user.id,
      req.user.role,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Section_63_4_Certificate_Doc_${documentId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
