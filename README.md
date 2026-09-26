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
- **Upload Integration**: On successful document upload (`NEW` path), text is automatically extracted and saved in the `extractedText` database field, regardless of Evidence Type (Primary or Secondary).
- **Graceful Degradation**: If the OCR service is stopped or unreachable, text extraction times out after 15 seconds or fails gracefully, logging a warning and saving the document without text. Uploads **never fail** due to OCR errors.
- **Case-Scoped Document Search**: `GET /documents/search?caseId=...&q=...` allows searching documents by filename or OCR extracted text (case-insensitive) with debounced search and highlighted text snippets.

### 6. Section 63(4) BSA 2023 Certificate Generation & Evidence Classification
NyayaChain supports evidence classification and Section 63(4) statutory certificate generation under the Bharatiya Sakshya Adhiniyam, 2023 (BSA):
- **Evidence Classification**: Uploads require specifying **Primary** (original device) vs. **Secondary** (copy/extract/printout) evidence type.
- **Statutory Certificate**: Electronic records classified as **Secondary** evidence require a Section 63(4) certificate detailing device particulars, device operator/controller, record description, dual signatories, and cryptographic hash snapshot. Primary evidence does not require this certificate.
- **PDF Generation**: Certificates are compiled on demand into court-ready, official PDF documents via `pdfkit` (`GET /documents/:documentId/certificate/pdf`).
- **Prototype Note on Dual-Signatures**: For this prototype, both required statutory signatures are captured concurrently during form submission. A production deployment would require separate, authenticated sign-offs by each individual signatory.

### 7. Case Intelligence — Entity Extraction, Relationship Graph & RAG
Building on the OCR pipeline, NyayaChain extracts structured intelligence from case documents:
- **Entity Extraction**: OCR-extracted text is processed by an LLM to identify People, Events, and Places mentioned in each document, along with the relationships between them (e.g., "met", "at", "on"), each linked back to its source document.
- **Relationship Graph**: Extracted entities and relationships are rendered as an interactive node-graph per case (`Relationship Graph` tab), letting investigators visually trace connections between people, locations, and events, and click through to the underlying source document for each link.
- **Ask AI About This Case (RAG)**: A retrieval-augmented question-answering interface lets investigators ask natural-language questions about a case (e.g., "What evidence connects Rahul Sharma to Amit?"). Answers are generated from indexed case documents and cite the source document(s) they were drawn from — no answer is presented without a traceable citation.
- **Event Timeline**: Extracted event entities with associated dates are rendered chronologically per case.

### 8. Blockchain Root-Hash Anchoring (Local Hardhat Network)
As a public-verifiability layer on top of the internal per-case hash-chain (Section 4), NyayaChain includes a `CaseAnchor` Solidity smart contract:
- **Local Development Network**: For reliable offline demo purposes, the contract is deployed to a local Hardhat blockchain network (`npx hardhat node`) rather than a public testnet, removing dependency on internet connectivity, faucets, or third-party RPC providers during a live demonstration.
- **Anchoring Concept**: Periodically, a case's current hash-chain root (`chainHash` of its latest document) is committed to the smart contract, providing an independent, tamper-evident record outside the application's own database — protecting against a scenario where the database itself is directly compromised or rewritten.
- **Production Note**: For real deployment, this contract would instead be deployed to a public network (e.g., Polygon), giving courts/auditors genuine third-party verifiability. The local Hardhat setup here demonstrates the same mechanism without that infrastructure dependency.

---

## Prerequisites

- **Node.js** (v18+) and npm
- **Python** (3.8–3.11, required for PaddleOCR compatibility) and pip
- An LLM API key (for entity extraction and the RAG "Ask AI" feature) configured in `backend/.env`

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

## AI / OCR Service Setup (PaddleOCR + FastAPI)

The OCR and entity-extraction pipeline runs as a **separate Python microservice**, required for text extraction, search, relationship-graph, and RAG features.

1. Navigate to the OCR service folder and create a virtual environment (first-time setup only):
```powershell
   cd ocr-service
   python -m venv venv
```
2. Activate the virtual environment:
```powershell
   .\venv\Scripts\activate
```
3. Install dependencies (first-time setup only):
```powershell
   pip install paddlepaddle paddleocr fastapi uvicorn python-multipart
```
4. Run the service:
```powershell
   uvicorn main:app --reload --port 8000
```
   > **Note:** On first run, PaddleOCR downloads its pre-trained models (several hundred MB) — this is expected and only happens once; subsequent runs start immediately from cache.

The service exposes `POST /extract-text` (multipart file upload → returns `{ "text": "..." }`), used internally by the backend during document upload. If this service is not running, document uploads still succeed, but without OCR text extraction (see Graceful Degradation above), and search/graph/RAG features will have no content to work from for affected documents.

---

## Blockchain Setup (Local Hardhat Network)

1. Navigate to the `blockchain` folder and install dependencies (first-time setup only):
```powershell
   cd blockchain
   npm install
```
2. Start the local Hardhat blockchain node (keep this terminal running):
```powershell
   npx hardhat node
```
3. In a **separate terminal**, deploy the `CaseAnchor` contract to the local network:
```powershell
   npx hardhat run scripts/deploy.js --network localhost
```
   This prints the deployed contract address — confirm this is set correctly wherever the backend references it (e.g., `backend/.env`).

---

## Running the Application

The full system requires **four services running simultaneously**, each in its own terminal:

### 1. Hardhat Local Blockchain Node
```powershell
cd blockchain
npx hardhat node
```

### 2. AI / OCR Service (`port 8000`)
```powershell
cd ocr-service
.\venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

### 3. Backend Server (`port 3001`)
```powershell
cd backend
npm run start:dev
```

### 4. Frontend Server (`port 5173`)
```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

> **Note:** The application remains functional even if the OCR service or blockchain node are not running — uploads, tamper detection, and access control (the core security layer) degrade gracefully and continue to work independently. OCR-dependent features (search, relationship graph, RAG) and blockchain anchoring simply won't have data/functionality until those services are started.

---

## Seeded Demo Users

| Username | Password | Role |
|---|---|---|
| `investigator1` | `password123` | INVESTIGATOR |
| `admin` | `adminpass` | ADMIN |

Sample cases: `FIR-2026-045` (investigator1 assigned), `FIR-2026-046` (investigator1 NOT assigned — used to demonstrate access control).

---

## Multi-Tab Verification & Test Script

### Multi-Tab Session Isolation Test:
1. Open **Tab 1** (`http://localhost:5173`) and log in as `admin` / `adminpass`.
2. Open **Tab 2** (`http://localhost:5173`) and log in as `investigator1` / `password123`.
3. Reload **Tab 1** (`F5`) -> Confirm Tab 1 stays logged in as `admin`.
4. Reload **Tab 2** (`F5`) -> Confirm Tab 2 stays logged in as `investigator1`.
5. Click **Logout** in **Tab 1** -> Confirm Tab 1 redirects to `/login` while **Tab 2** remains active as `investigator1`.

---

## Planned / Not Yet Implemented

The following are part of the target production architecture (see project PPT) but are **not built** in this prototype:
- Public blockchain anchoring (Polygon mainnet/testnet) — currently simulated via local Hardhat network only
- Neo4j graph database (current Relationship Graph uses relational tables, not a dedicated graph DB)
- MinIO/S3 object storage (files currently stored on local disk)
- AES-256 encryption at rest
- Multi-Factor Authentication (MFA), Keycloak integration