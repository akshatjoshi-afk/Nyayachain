import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Query,
  Body,
  Param,
  ParseIntPipe,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';

@Controller('documents')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get(':id/file')
  async getDocumentFile(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { stream, originalName, mimeType } = await this.documentsService.getDocumentFile(
      id,
      req.user.id,
      req.user.role,
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(originalName)}"`,
    });
    stream.pipe(res);
  }

  @Get(':id/text')
  async getDocumentText(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.documentsService.getDocumentText(id, req.user.id, req.user.role);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('caseId') caseIdStr: string,
    @Body('evidenceType') evidenceType: string,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!evidenceType || !['PRIMARY', 'SECONDARY'].includes(evidenceType.toUpperCase())) {
      throw new BadRequestException('evidenceType is required and must be either "PRIMARY" or "SECONDARY".');
    }
    const caseId = parseInt(caseIdStr, 10);
    return this.documentsService.uploadDocument(file, caseId, req.user.id, req.user.role, evidenceType.toUpperCase());
  }

  @Get()
  async getDocuments(
    @Query('caseId') caseIdStr: string,
    @Query('q') searchQuery: string,
    @Request() req: any,
  ) {
    if (!caseIdStr) throw new BadRequestException('caseId query parameter is required.');
    const caseId = parseInt(caseIdStr, 10);
    return this.documentsService.getDocuments(caseId, req.user.id, req.user.role, searchQuery);
  }

  @Get('search')
  async searchDocuments(
    @Query('caseId') caseIdStr: string,
    @Query('q') searchQuery: string,
    @Request() req: any,
  ) {
    if (!caseIdStr) throw new BadRequestException('caseId query parameter is required.');
    const caseId = parseInt(caseIdStr, 10);
    return this.documentsService.getDocuments(caseId, req.user.id, req.user.role, searchQuery);
  }

  @Post('verify')
  @UseInterceptors(FileInterceptor('file'))
  async verifyDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('caseId') caseIdStr: string,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const caseId = parseInt(caseIdStr, 10);
    return this.documentsService.verifyDocument(file, caseId, req.user.id, req.user.role);
  }
  @Post('ask')
async askQuestion(
  @Body('caseId') caseIdStr: string,
  @Body('question') question: string,
  @Request() req: any,
) {
  const caseId = parseInt(caseIdStr, 10);
  return this.documentsService.askQuestion(
    caseId,
    question,
    req.user.id,
    req.user.role,
  );
}
  @Get('cases/:caseId/verify-blockchain')
   async verifyBlockchain(@Param('caseId') caseIdStr: string, @Request() req: any) {
     const caseId = parseInt(caseIdStr, 10);
     return this.documentsService.verifyAgainstBlockchain(caseId, req.user.id, req.user.role);
   }
}
