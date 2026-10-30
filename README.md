# Software Architecture Drift Detector

An enterprise-grade developer tool for comparing a software project's intended architecture against its actual implementation to detect, visualize, and remediate architectural drift.

Built with real email authentication, cryptographic token verification, persistent database storage, AST-based static code analysis, interactive React Flow dependency graphs, and multi-format report exports.

---

## 1. Primary Objectives & Capabilities

- **Repository Analysis**: Upload source code ZIP archives or connect local/remote directories safely.
- **Intended Architecture Modeling**: Define or import architecture boundaries in JSON/YAML (or via visual builder) supporting components, layers, allowed/forbidden dependencies, and ADR rules.
- **Real Authentication & Cryptographic Email Verification**:
  - Unverified account creation on registration.
  - Argon2id modern password hashing.
  - Single-use, time-limited cryptographic email verification tokens (SHA-256 hashed in database).
  - Configurable SMTP transactional provider with automatic fallback to local development mailbox for test environments.
  - Strict enforcement: only verified accounts may sign in.
  - HttpOnly, SameSite, Secure cookie-based server sessions.
  - Password recovery workflow with single-use reset tokens and automatic session invalidation.
- **User Data Isolation & Security**:
  - Strict row-level ownership enforcement on all projects, architecture definitions, uploads, scans, findings, and reports.
  - Zip Slip path-traversal protection and zip-bomb extraction limits (50MB / 2,000 files).
  - Non-execution static guarantee: Python AST extracts code relationships without ever importing or executing user files.
  - CSV formula injection protection escaping formula triggers (`=`, `+`, `-`, `@`).
- **Static AST Extraction**: Language-aware AST analysis extracts modules, packages, classes, and imports without ever executing source code.
- **Directed Graph Construction**: NetworkX constructs directed dependency graphs of modules and components with cycle detection.
- **Drift Violation Detection**: Deterministic evaluation of:
  - Forbidden dependencies
  - Layer direction violations (e.g., Domain depending upward on Presentation)
  - Circular dependency cycles (both component and module cycles)
  - Whitelist/unexpected dependencies
  - Missing expected components & unmapped modules
  - Architecture Decision Record (ADR) violations
- **Traceable Evidence**: Every finding references the exact source file, line number, import statement, and remediation guidance.
- **Interactive Graph**: Interactive React Flow dependency graph (`@xyflow/react`) with component clustering and highlighted violation edges.
- **Scan History & Comparison**: Compare any two scans to analyze delta changes (new, resolved, and persistent findings).
- **Downloadable Reports**: Structured JSON and CSV exports with spreadsheet formula injection protection.
- **Audit Log Workflow**: Finding status lifecycle (`open`, `acknowledged`, `resolved`, `accepted_exception` with mandatory documented justification).
- **Enterprise Design**: Clean, modern white, navy, and slate theme (strictly non-neon, zero glowing borders, WCAG-conscious contrast).

---

## 2. Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router v7, Lucide Icons, React Flow (`@xyflow/react`), Recharts.
- **Backend**: Python 3.11+ / 3.14+, FastAPI, Pydantic v2 (ConfigDict), SQLAlchemy 2.0, Alembic, NetworkX, Argon2-cffi, PyYAML.
- **Database**: SQLite (default local development) with clean SQLAlchemy abstraction for PostgreSQL deployment.
- **Testing**: Pytest (backend), Vitest + React Testing Library + JSDOM (frontend), Oxlint (linter).

---

## 3. Quickstart & Local Development

### Prerequisites
- Python 3.11+ (Python 3.14 supported)
- Node.js 18+ (Node 20+ recommended) and npm

---

### Step 1: Backend Setup & Database Migrations

From the workspace root:

```powershell
# Create virtual environment (if not already created)
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
# Or directly:
pip install fastapi uvicorn[standard] pydantic sqlalchemy alembic networkx pyyaml python-multipart argon2-cffi pytest httpx

# Run database migrations to head
alembic upgrade head

# Start the FastAPI backend server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend starts at `http://127.0.0.1:8000`.
- API Health Check: `http://127.0.0.1:8000/api/v1/health`
- Swagger Interactive Documentation: `http://127.0.0.1:8000/docs`
- ReDoc Documentation: `http://127.0.0.1:8000/redoc`

---

### Step 2: Frontend Setup & Dev Server

In a new terminal:

```powershell
# Navigate to frontend
cd frontend

# Install dependencies
npm.cmd install
# On Linux/macOS:
# npm install

# Start Vite development server
npm.cmd run dev
# On Linux/macOS:
# npm run dev
```

The frontend starts at `http://localhost:5173/` and proxies all `/api` requests to `http://127.0.0.1:8000`.

---

## 4. Running Automated Tests & Quality Checks

### Run Backend Tests (Pytest)
```powershell
.venv\Scripts\pytest backend/tests/ -v
```
*Status: 23 passed, 0 failed (100% pass rate).*

### Run Frontend Unit Tests (Vitest)
```powershell
cd frontend
npm.cmd test -- --run
# Or on Linux/macOS: npm test
```
*Status: 7 passed, 0 failed (100% pass rate).*

### Run Frontend Production Build & Typecheck
```powershell
cd frontend
npm.cmd run build
```
*Status: 2,642 modules transformed, built with 0 errors.*

### Run Frontend Linter
```powershell
cd frontend
npm.cmd run lint
```
*Status: 0 errors.*

### Run Complete Live Integration Audit Script
With the backend server running on `http://127.0.0.1:8000`:
```powershell
.venv\Scripts\python.exe scripts/verify_workflow.py
```
*Status: All 14/14 integration workflow checks passed.*

---

## 5. Deliberate Violation Verification (Sample Project)

The workspace includes a demonstration project in `sample-project/` (packaged as `sample-project.zip`) implementing an enterprise 4-layer architecture:
- Presentation (`app/presentation/routes.py`) -> calls Application
- Application (`app/application/order_service.py`) -> calls Domain
- Domain (`app/domain/order.py`) -> **Deliberate Architectural Drift**:
  ```python
  # DELIBERATE ARCHITECTURAL DRIFT VIOLATION INTRODUCED FOR VERIFICATION:
  from app.presentation.routes import format_currency_response
  ```
- Infrastructure (`app/infrastructure/database.py`) -> implements persistence

When scanned against the Layered architecture definition (`architecture-examples/layered.json`), the engine deterministically reports:
1. **Layer Violation**: Domain (Layer 3) depends upward on Presentation (Layer 1) at `app/domain/order.py:11`.
2. **Forbidden Dependency**: Rule `FORBIDDEN-DOMAIN-TO-PRESENTATION` triggered with full source evidence.
3. **Circular Coupling**: `domain -> presentation -> application -> domain` cycle detected.

---

## 6. Architecture Compliance Formula

Compliance percentage is deterministically calculated as:

$$\text{Compliance Percentage} = 100 \times \left(1 - \frac{\text{Violated Applicable Rules}}{\text{Total Applicable Rules}}\right)$$

- Handled explicitly: When zero applicable rules exist, compliance defaults to 100.0%.
- Note: This measures compliance against approved architecture rules, not complete architectural correctness.

---

## 7. Security & Sandboxing Guarantees

- **Zip Slip Prevention**: All archive entries are strictly validated against `os.path.commonpath`. Any entry attempting path traversal (`../`, absolute drive paths) is rejected with HTTP 400.
- **Resource Limits**: Max archive upload size capped at 50MB; max extracted files capped at 2,000 files to prevent zip bombs.
- **Non-Execution Static Guarantee**: Static AST parsing is used exclusively. Uploaded user code is never imported, invoked, or executed.
- **CSV Formula Injection Prevention**: All exported CSV text cells starting with `=`, `+`, `-`, `@`, `\t` are escaped with a prepended single quote (`'`).
- **Secret Isolation**: Secrets and tokens are kept in environment variables and never sent to browser clients or leaked in reports.
- **Argon2id Password Protection**: User passwords are saved exclusively as salted Argon2id hashes. Plaintext passwords are never stored or logged.
- **Single-Use Hashed Tokens**: Verification and password-reset tokens are stored as SHA-256 hashes with expiration timestamps and single-use invalidation.

---

## 8. Email Provider & Testing Modes

Configuration via `.env`:
- **Production SMTP**: Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `EMAIL_TEST_MODE=false`.
- **Local Development / Test Mode**: When `EMAIL_TEST_MODE=true` (default in dev), outbound verification emails are captured to `backend/data/mailbox/` in JSON and HTML format. The registration and forgot-password interfaces provide direct links to the captured tokens for streamlined local testing.
