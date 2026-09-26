import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const PRESERVED_DOCUMENTS = [
  {
    filename: '1790352745648-FIR.jpeg',
    originalName: 'FIR.jpeg',
    fileHash: '0dc49060c6716fd76093c862135bfcaf91719a8cd963ebf3a3499fcdaa6cdd2a',
    chainHash: '3160b03dd25efe3932ef00cbfce5b6e58fbb862a476ac05059a61d6544d40e56',
    previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
    extractedText: `Camp1+\n90\nDR. NO. 188/PS\nN\n2013/18\nN.C.R.B (..)\nL.I.F.4 ( 1)\nFIRST INFORMATION REPORT\noc\n(Under Section 154 Cr.P.C.)\n(T 154 ¿ dan afan g).\n1. District (Ma): SUNDARGARH\nP.S. (I):RAIBOGA\nYear (ard): 2018\nFIR NO. (U.g f. a. ): 0010\nDate and Time of FIR (0..R.  f2= af ): 10/03/2016 16:10 hrs\n2. S.No. (m. Acts ()\nSections (())\n1\nIPC 1860\n279\n2\nIPC 1860\n304-A\n3. (a)Occurrence of oence ( ):\n1. Day (fa): Sunday\nDate From ():04/03/2018Date To( ): 04/03/2018\nTime Period ( r): Pahar 6 Time From (): 18:00 hrs Tim To ( ): 18:30 h\n(b)Information received at P.S. (    §): Date (): 19/03/2018 Tme (): 16:10\n(c) General Diary Reference ( ): Entry No. (uf .):009 Date & Time: 20/03/2018 09:32 s\n4. Typ of Information ( T ): Written\n5. Place of Occurrence ():\n1. (a) Direction and distance from P.S.(ra à  a f2I ): SOUTH-EAST, 15 Km(s)Beat No.:\n(b) Address (): Jharbeda\n(c) In case, outside the limit of this Police Station, then (f a-n n ag ? an):\nN o ..(): RIOGA\nDistrict(State) (faaT (TTz)): SUNDARGARH\n6. Complainant / Informant (fraf/):\n(a) Name (): Erick Ekka\n(b Father's Name (fan):\nFransis Ekka\n(c) Date/Year of Birth ( /): 1983\n(d) Nationality (Tgraa): INDIA\n(e) UID No. (qam5St .):\n(f) Passport No.(urutć.):\nDate of Issue (f a):\nPlace of Issue ():\n(g) Id details (Ration Card,Voter ID Card,Passport,UID No.,Driving License,PAN)\nS.No.(..)  T ()\n( m ( )\n1\n(h) Address (ua):\nS.N.(..) Addr T () Addre ()\n1\nPresent Address\nJharbeda, hetposh ,RAIBOGA,SUNDARGARH.ODISHA,INDIA\n2\nPermanent Address\nJharDeda, hetposh,RAIBOGA,SUNDARGARH,ODISHA,INDIA\n1\nAttesited\ntlicer in Charge\nRAIROGA P.S.\nMat. Sundargarh,`,
    evidenceType: 'PRIMARY',
    blockchainTxHash: '0x8d6e9d15d0ac6ef437d043d45dd787aeee844c03c0f62d56c9593124e75a0388',
  },
  {
    filename: '1790352919153-Witness.png',
    originalName: 'Witness.png',
    fileHash: '0ce25c19980677d688937910ff1902c9db6ae906150a5633610e8a63e65a9145',
    chainHash: 'f84eaa4b9f9b1ca1cc22291cf5d832c053bed5aa2428238237e0a117df60fe43',
    previousHash: '3160b03dd25efe3932ef00cbfce5b6e58fbb862a476ac05059a61d6544d40e56',
    extractedText: `Witness Statement\nOn the night of March 3rd, 2026, witness Ramesh Kumar stated that he saw two men\nnear Patel Electronics shop at approximately 9 PM. He identified one of them as Anil\nSharma, a former emplovee of the shop who was terminated by the owner Suresh Patel\ntwo months earlier. Ramesh Kumar told investigators that Anil Sharma appeared to be\narguing with a woman later identified as Priva Verma before both men entered a white\nvan registered to Sharma Logistics, a transport company owned by Anil Sharma's\nbrother, Vikas Sharma. The shop's CCTV camera, seized as evidence, recorded the\nincident.\nForensic Report\nForensic analysis conducted on March 5th, 2026 recovered fingerprints from the cash\ncounter at Patel Electronics matching records on file for Anil Sharma. A crowbar found\nnear the rear entrance. logged as Evidence Item EV-2026-014. was confirmed to have\nbeen used to force open the back door. Traces of the same fingerprints were found on\nthe crowbar. The forensic team also noted tire marks outside the shop consistent with a\ncommercial van, supporting the witness statement linking a vehicle from Sharma\nLogistics to the scene.\nFIR Filing\nSuresh Patel filed FIR-2026-045 on the morning of March 4th, 2026 at the local police\nstation, reporting theft of cash and electronics from Patel Electronics. He named Anil\nSharma as a suspect, citing his recent termination and knowledge of the shop's security\nlayout. The investigating officer, Inspector Meena Rao, was assigned to the case on the\nsame day and requested CCTV footage and forensic analysis of the scene.`,
    evidenceType: 'SECONDARY',
    blockchainTxHash: '0xaedf801923b11fb89fc0cf66423e7e0a967e39aadf035a752c1d96b59b3fcdb5',
  },
];

async function restoreDemoData() {
  console.log('🔄 Starting Demo Case & Preserved Documents Restoration...');

  const uploadsDir = path.join(__dirname, '../uploads');

  // 1. Verify physical files exist on disk
  for (const doc of PRESERVED_DOCUMENTS) {
    const filePath = path.join(uploadsDir, doc.filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`❌ Missing preserved physical file on disk: ${filePath}`);
    }
  }
  console.log('✅ Physical file presence verified in backend/uploads/');

  // 2. Find target user (investigator1) by username
  const investigatorUsername = process.env.SEED_INVESTIGATOR_USERNAME || 'investigator1';
  const uploader = await prisma.user.findUnique({
    where: { username: investigatorUsername },
  });

  if (!uploader) {
    throw new Error(
      `❌ User "${investigatorUsername}" not found. Please run "npm run db:seed" first before restoring demo data.`,
    );
  }
  console.log(`✅ Located uploader user "${uploader.username}" (ID: ${uploader.id})`);

  // 3. Find or Create target case by caseNumber
  const targetCaseNumber = 'FIR-2026-045';
  let targetCase = await prisma.case.findUnique({
    where: { caseNumber: targetCaseNumber },
  });

  if (!targetCase) {
    targetCase = await prisma.case.create({
      data: {
        caseNumber: targetCaseNumber,
        title: 'Cyber Heist Investigation',
      },
    });
    console.log(`✅ Created Case "${targetCase.caseNumber}" (ID: ${targetCase.id})`);
  } else {
    console.log(`✅ Located existing Case "${targetCase.caseNumber}" (ID: ${targetCase.id})`);
  }

  // Ensure case assignment exists for investigator
  await prisma.caseAssignment.upsert({
    where: {
      caseId_userId: {
        caseId: targetCase.id,
        userId: uploader.id,
      },
    },
    update: {},
    create: {
      caseId: targetCase.id,
      userId: uploader.id,
    },
  });

  // 4. Idempotently create document records
  for (const doc of PRESERVED_DOCUMENTS) {
    const existingDoc = await prisma.document.findFirst({
      where: {
        caseId: targetCase.id,
        filename: doc.filename,
      },
    });

    if (existingDoc) {
      console.log(`ℹ️  Document "${doc.originalName}" (${doc.filename}) already restored — skipping.`);
      continue;
    }

    const createdDoc = await prisma.document.create({
      data: {
        caseId: targetCase.id,
        filename: doc.filename,
        originalName: doc.originalName,
        fileHash: doc.fileHash,
        chainHash: doc.chainHash,
        previousHash: doc.previousHash,
        extractedText: doc.extractedText,
        evidenceType: doc.evidenceType,
        blockchainTxHash: doc.blockchainTxHash,
        uploaderId: uploader.id,
      },
    });

    console.log(
      `✅ Restored Document #${createdDoc.id}: "${createdDoc.originalName}" in Case #${targetCase.id}`,
    );
  }

  console.log('🎉 Demo Case & Document Restoration Complete!');
}

restoreDemoData()
  .catch((e) => {
    console.error('❌ Restore failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
