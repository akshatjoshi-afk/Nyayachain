# NyayaChain — Secure Document Management Prototype

This is a functional prototype demonstrating core security concepts for the NyayaChain legal/investigation case file management system.

## Architecture & Features

### 1. Multi-Tab Session Isolation (`sessionStorage`)
To prevent session leaking across browser tabs:
- Tokens and user info are stored in **`sessionStorage`** instead of `localStorage`.
- **Tab Isolation**: Opening Tab 1 as `admin` and Tab 2 as `investigator1` allows both tabs to maintain their respective roles independently without overwriting each other's credentials.
- **Reload Persistence**: Reloading (`F5`) within a tab preserves that tab's session seamlessly.
- **Independent Logout**: Logging out in Tab 1 clears `sessionStorage` for Tab 1 only and leaves Tab 2 logged in.

### 2. Case-Based Access Control (CBAC) & Live Access Checks
Every document belongs to a specific **Case** (e.g. `FIR-2026-045`).
- **Investigators**: Can view and access **ONLY** cases they are assigned to via `CaseAssignment`. Attempting to access an unassigned case returns an HTTP `403 Forbidden` error with a clear UI access denial banner.
- **Administrators**: Possess global privileges to create cases (`POST /api/cases`), assign investigators (`POST /api/cases/:id/assign`), **revoke investigator access** (`DELETE /api/cases/:id/assign/:userId`), view all cases, and access global audit logs.
- **Live Database Evaluation**: Case access permissions are evaluated live against the `CaseAssignment` database table on every incoming request. When an Admin revokes access, the investigator is blocked on their very next request immediately without needing to log out or re-authenticate.

### 3. Upload-Time Tamper Detection & Shared Helper
NyayaChain includes a shared, single source of truth helper `compareAgainstStoredDocument(caseId, filename, newFileHash)`:
- **`NEW`**: If no document with this filename exists in this case, the upload succeeds and binds the file into the case's hash chain (`UPLOAD`).
- **`DUPLICATE`**: If a document with this filename exists and its SHA-256 hash matches the new file, the upload is rejected as a duplicate (`DUPLICATE_UPLOAD`). No new record is created.
- **`TAMPERED`**: If a document with this filename exists but its SHA-256 hash differs, **tampering is intercepted immediately at upload time**. The upload is rejected (`TAMPERED_UPLOAD_ATTEMPT`), the original database record remains **100% intact**, and a red forensic alert banner is displayed.

### 4. Per-Case Hash-Chaining Ledger
Within each case, documents form a linear hash chain:
- `fileHash`: `SHA256(raw file bytes)`
- `previousHash`: `chainHash` of the previous document in **this specific case** (or 64 zero genesis string for document #1).
- `chainHash`: `SHA256(fileHash + previousHash)`.

An Admin-only tool (`GET /api/audit/verify-chain`) audits the entire ledger's linear chain integrity.

### 5. PaddleOCR Microservice & Document Content Search
NyayaChain integrates with a Python FastAPI microservice running PaddleOCR:
- **FastAPI OCR Endpoint**: Reads uploaded image/scanned document files at `http://localhost:8000/extract-text` and returns extracted text.
- **Upload Integration**: On successful document upload (`NEW` path), text is automatically extracted and saved in the `extractedText` database field.
- **Graceful Degradation**: If the OCR service is stopped or unreachable, text extraction times out after 15 seconds or fails gracefully, logging a warning and saving the document without text. Uploads **never fail** due to OCR errors.
- **Case-Scoped Document Search**: `GET /documents/search?caseId=...&q=...` allows searching documents by filename or OCR extracted text (case-insensitive) with debounced search and highlighted text snippets.


### 6. Section 63(4) BSA 2023 Certificate Generation & Evidence Classification
NyayaChain supports evidence classification and Section 63(4) statutory certificate generation under the Bharatiya Sakshya Adhiniyam, 2023 (BSA):
- **Evidence Classification**: Uploads require specifying **Primary** (original device) vs. **Secondary** (copy/extract/printout) evidence type.
- **Statutory Certificate**: Electronic records classified as **Secondary** evidence require a Section 63(4) certificate detailing device particulars, device operator/controller, record description, dual signatories, and cryptographic hash snapshot. Primary evidence does not require this certificate.
- **PDF Generation**: Certificates are compiled on demand into court-ready, official PDF documents via `pdfkit` (`GET /documents/:documentId/certificate/pdf`).
- **Prototype Note on Dual-Signatures**: For this prototype, both required statutory signatures are captured concurrently during form submission. A production deployment would require separate, authenticated sign-offs by each individual signatory.


---

## Database Migration & Setup Instructions

To reset the database with the schema and seed sample data:

1. Open a terminal in the `backend` folder:
   ```powershell
   cd backend
   ```
2. Reset database tables and push the Prisma schema:
   ```powershell
   npx prisma db push --force-reset
   ```
3. Generate the Prisma Client types:
   ```powershell
   npx prisma generate
   ```
4. Seed demo users, cases (`FIR-2026-045`, `FIR-2026-046`), and assignment:
   ```powershell
   npm run db:seed
   ```

---

## Running the Application

### 1. Backend Server (`port 3001`)
```powershell
cd backend
npm run start:dev
```

### 2. Frontend Server (`port 5173`)
```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Multi-Tab Verification & Test Script

### Multi-Tab Session Isolation Test:
1. Open **Tab 1** (`http://localhost:5173`) and log in as `admin` / `adminpass`.
2. Open **Tab 2** (`http://localhost:5173`) and log in as `investigator1` / `password123`.
3. Reload **Tab 1** (`F5`) -> Confirm Tab 1 stays logged in as `admin`.
4. Reload **Tab 2** (`F5`) -> Confirm Tab 2 stays logged in as `investigator1`.
5. Click **Logout** in **Tab 1** -> Confirm Tab 1 redirects to `/login` while **Tab 2** remains active as `investigator1`.
