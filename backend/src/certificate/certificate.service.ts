import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CasesService } from '../cases/cases.service';
import PDFDocument = require('pdfkit');

export interface CreateCertificateDto {
  deviceDescription: string;
  deviceOperator: string;
  recordDescription: string;
  signatory1Name: string;
  signatory1Designation: string;
  signatory2Name: string;
  signatory2Designation: string;
}

@Injectable()
export class CertificateService {
  constructor(
    private prisma: PrismaService,
    private casesService: CasesService,
  ) {}

  /**
   * Generates a Section 63(4) BSA 2023 Certificate for a SECONDARY evidence document.
   */
  async createCertificate(
    documentId: number,
    dto: CreateCertificateDto,
    userId: number,
    role: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { case: true },
    });

    if (!doc) {
      throw new NotFoundException(`Document #${documentId} not found.`);
    }

    // Access check
    await this.casesService.validateCaseAccess(doc.caseId, userId, role);

    // Statutory Check: Only SECONDARY evidence requires a Section 63(4) Certificate
    if (doc.evidenceType !== 'SECONDARY') {
      throw new BadRequestException('Section 63(4) certificate is not required for primary evidence.');
    }

    // Check if certificate already exists
    const existingCert = await this.prisma.certificate.findUnique({
      where: { documentId },
    });
    if (existingCert) {
      throw new BadRequestException(`Certificate already generated for document #${documentId}.`);
    }

    // Auto-generate declaration text
    const declarationText = `I/We certify that the electronic record described herein, namely '${dto.recordDescription}', was produced by a computer/device regularly used to store or process information for the activities carried out by '${dto.deviceOperator}' in the ordinary course of the said activities, during the period the record was created, and that the device was operating properly at the material time. The record's integrity is further evidenced by its cryptographic hash: ${doc.fileHash}, recorded in the case's tamper-evident hash-chain ledger.`;

    const now = new Date();

    const certificate = await this.prisma.certificate.create({
      data: {
        documentId,
        deviceDescription: dto.deviceDescription,
        deviceOperator: dto.deviceOperator,
        recordDescription: dto.recordDescription,
        fileHashAtCertification: doc.fileHash,
        declarationText,
        signatory1Name: dto.signatory1Name,
        signatory1Designation: dto.signatory1Designation,
        signatory1SignedAt: now,
        signatory2Name: dto.signatory2Name,
        signatory2Designation: dto.signatory2Designation,
        signatory2SignedAt: now,
        generatedById: userId,
      },
    });

    // Mark document as certificate generated
    await this.prisma.document.update({
      where: { id: documentId },
      data: { certificateGenerated: true },
    });

    // Write AuditLog
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CERTIFICATE_GENERATED',
        documentId,
        result: `Generated Section 63(4) Certificate for "${doc.originalName}" in Case #${doc.case.caseNumber}`,
      },
    });

    return certificate;
  }

  /**
   * Retrieves certificate details for a document.
   */
  async getCertificate(documentId: number, userId: number, role: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Document #${documentId} not found.`);
    }

    await this.casesService.validateCaseAccess(doc.caseId, userId, role);

    const certificate = await this.prisma.certificate.findUnique({
      where: { documentId },
      include: {
        document: {
          include: {
            case: true,
            uploader: { select: { username: true, role: true } },
          },
        },
        generatedBy: { select: { username: true, role: true } },
      },
    });

    if (!certificate) {
      throw new NotFoundException(`No certificate found for document #${documentId}.`);
    }

    return certificate;
  }

  /**
   * Generates PDF stream of Section 63(4) BSA 2023 Certificate.
   */
  async generateCertificatePdf(documentId: number, userId: number, role: string): Promise<Buffer> {
    const cert = await this.getCertificate(documentId, userId, role);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header Banner
      doc.fillColor('#1e3a8a')
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('CERTIFICATE UNDER SECTION 63(4)', { align: 'center' });
      
      doc.fontSize(14)
         .text('BHARATIYA SAKSHYA ADHINIYAM, 2023 (BSA)', { align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(10)
         .font('Helvetica-Oblique')
         .fillColor('#4b5563')
         .text('Admissibility of Electronic Records as Secondary Evidence in Court Proceedings', { align: 'center' });

      doc.moveDown(1);
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Document & Case Particulars
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('1. CASE & ELECTRONIC RECORD PARTICULARS');
      doc.moveDown(0.5);

      doc.font('Helvetica').fontSize(10).fillColor('#374151');
      doc.text(`Case Number: ${cert.document.case.caseNumber} - ${cert.document.case.title}`);
      doc.text(`Document Name: ${cert.document.originalName}`);
      doc.text(`Evidence Classification: ${cert.document.evidenceType}`);
      doc.text(`Recorded Hash (SHA-256): ${cert.fileHashAtCertification}`);
      doc.text(`Hash Chain Ledger ID: ${cert.document.chainHash}`);

      doc.moveDown(1);
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Device & Control Particulars
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('2. DEVICE & OPERATOR DETAILS');
      doc.moveDown(0.5);

      doc.font('Helvetica').fontSize(10).fillColor('#374151');
      doc.text(`Device Description: ${cert.deviceDescription}`);
      doc.text(`Device Operator / Controller: ${cert.deviceOperator}`);
      doc.text(`Record Description: ${cert.recordDescription}`);

      doc.moveDown(1);
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Statutory Declaration
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('3. STATUTORY DECLARATION UNDER SECTION 63(4)');
      doc.moveDown(0.5);

      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#1e293b').text(cert.declarationText, {
        align: 'justify',
        lineGap: 3,
      });

      doc.moveDown(1.5);
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1.5);

      // Dual Signatory Section
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('4. DUAL SIGNATORY AUTHENTICATION');
      doc.moveDown(1);

      const sigY = doc.y;

      // Signatory 1 (Left Box)
      doc.fontSize(9.5).font('Helvetica-Bold').text('PRIMARY SIGNATORY (Device Operator)', 50, sigY);
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(`Name: ${cert.signatory1Name}`, 50, sigY + 15);
      doc.text(`Designation: ${cert.signatory1Designation}`, 50, sigY + 28);
      doc.text(`Signed At: ${new Date(cert.signatory1SignedAt).toLocaleString()}`, 50, sigY + 41);
      doc.text('Signature: [DIGITALLY SIGNED / SEALED]', 50, sigY + 54);

      // Signatory 2 (Right Box)
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#111827').text('SECONDARY SIGNATORY (In-Charge/Officer)', 300, sigY);
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(`Name: ${cert.signatory2Name}`, 300, sigY + 15);
      doc.text(`Designation: ${cert.signatory2Designation}`, 300, sigY + 28);
      doc.text(`Signed At: ${new Date(cert.signatory2SignedAt).toLocaleString()}`, 300, sigY + 41);
      doc.text('Signature: [DIGITALLY SIGNED / SEALED]', 300, sigY + 54);

      // Footer Notes
      const footerY = 750;
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, footerY).lineTo(545, footerY).stroke();
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#6b7280')
         .text(
           `System Generated by NyayaChain Blockchain Cryptographic Ledger | Certificate ID: #${cert.id} | Generated: ${new Date(cert.generatedAt).toLocaleString()}`,
           50,
           footerY + 10,
           { align: 'center' },
         );

      doc.end();
    });
  }
}
