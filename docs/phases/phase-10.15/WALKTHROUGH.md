# Technical Walkthrough — Phase 10.15: Production Deployment & Pilot Readiness Checklist

This document details the architectural audits, pipeline configurations, and environment validations conducted during **Phase 10.15** to prepare **Softify** for a production pilot release.

---

## 1. Cloud Run Source-Based Deployment Workflow

Softify employs Google Cloud's serverless **source-based deployment workflow**. This replaces manual Docker image creation and pushing, leveraging **Google Cloud Build** to package, compile, and run the container serverless-side.

- **GitHub Actions Trigger**: Commits or pull requests to the target deployment branches execute the deployment step.
- **Deployment Command Configuration**:
  ```bash
  # Dynamically resolved using GitHub Actions workspace environment variables:
  gcloud run deploy "${CLOUD_RUN_SERVICE}" \
    --source . \
    --region "${GCP_REGION}" \
    --allow-unauthenticated \
    --set-env-vars=^|^REPOSITORY_BACKEND=firestore|GOOGLE_CLOUD_PROJECT="${GCP_PROJECT_ID}"|FIRESTORE_DATABASE_ID=softify|AI_PROVIDER=mock|NODE_ENV=production \
    --set-secrets=SHOPIFY_API_SECRET=SHOPIFY_API_SECRET:latest,SHOPIFY_TOKEN_ENCRYPTION_KEY=SHOPIFY_TOKEN_ENCRYPTION_KEY:latest,SOFTIFY_AGENT_DEV_BYPASS_SECRET=SOFTIFY_AGENT_DEV_BYPASS_SECRET:latest
  ```
- **Real Configured Environment (GCP Pilot Sandbox)**:
  - **Service Name (`CLOUD_RUN_SERVICE`)**: `softify`
  - **Deployment Region (`GCP_REGION`)**: `europe-west1`
  - **Target Project ID (`GCP_PROJECT_ID`)**: `softify-dev`
- **Cloud Build Packaging**: The source code is securely uploaded, and Google Cloud Build builds the optimized container serverless-side, deploying it seamlessly to Google Cloud Run as a fresh revision.

---

## 2. GitHub Actions Authentication via Workload Identity Federation

To enforce a zero-trust model and eliminate high-risk, long-lived credentials, Softify uses **Workload Identity Federation (WIF)** via OIDC (OpenID Connect) rather than long-lived Service Account JSON keys (`GCP_SA_KEY`).

- **Federation Exchange**:
  1. The GitHub Actions runner requests a federated JWT from GitHub's OIDC Provider.
  2. The runner exchanges the GitHub JWT with Google's Security Token Service (STS) for a short-lived Google OAuth 2.0 access token.
  3. The runner impersonates the designated IAM service account to execute commands securely.
- **GitHub Workflow Integration**:
  ```yaml
  - name: Authenticate to Google Cloud
    uses: google-github-actions/auth@v3
    with:
      project_id: ${{ secrets.GCP_PROJECT_ID }}
      workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
      service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
  ```

---

## 3. Environment Variables and Secrets Audit

We audited the environment layout to guarantee strict separation between public configuration parameters and production secret keys:

### A. Non-Secret Public Environment Variables
Configured as regular public variables inside Google Cloud Run console or build parameters:
- `NODE_ENV`: Must be strictly set to `"production"`.
- `REPOSITORY_BACKEND`: Must be strictly set to `"firestore"`.
- `SHOPIFY_API_KEY`: The public Client ID for the Shopify App integration (moved out of GCP Secret Manager).
- `SOFTIFY_ALLOW_AGENT_DEV_BYPASS`: The current CI/CD deployment workflow sets `SOFTIFY_ALLOW_AGENT_DEV_BYPASS="true"` solely to facilitate controlled deployed smoke validation targeting the freshly revisioned container. This bypass is acceptable only while strictly protected by a cryptographically strong `SOFTIFY_AGENT_DEV_BYPASS_SECRET` dynamically resolved from Secret Manager. It must not be described as the default merchant pilot behavior: prior to exposing the merchant pilot environment, the team must explicitly review whether the dev bypass should be disabled or completely isolated from any merchant-facing access.
- `FIRESTORE_DATABASE_ID`: Identifies the target Firestore instance (`(default)` or dedicated instance such as `softify`).
- `SHOPIFY_APP_URL`: The fully qualified public domain of the running Cloud Run service.

### B. Secret Manager Integrations
Durable keys mapped securely at runtime to Cloud Run environment injections via GCP Secret Manager:
- `SHOPIFY_API_SECRET` (`secrets/SHOPIFY_API_SECRET:latest`): Used for OAuth exchange handshakes.
- `SHOPIFY_TOKEN_ENCRYPTION_KEY` (`secrets/SHOPIFY_TOKEN_ENCRYPTION_KEY:latest`): A cryptographically strong 32-byte AES-256-GCM key used to encrypt access tokens stored in Firestore.
  - *Note*: Rotation is strictly forbidden during active pilot operations to prevent breaking existing tokens.
- `SOFTIFY_AGENT_DEV_BYPASS_SECRET` (`secrets/SOFTIFY_AGENT_DEV_BYPASS_SECRET:latest`): Dev bypass token used strictly during the dynamic smoke-testing deployment step.

---

## 4. Operational Release Gates & Verification

- **Operational Release Approval Gate**: Release approval is strictly withheld if `REPOSITORY_BACKEND` is set to `memory` or if Firestore database checks return unhealthy diagnostics.
- **Test 58 Static Verification**: Pre-deployment verification structurally enforces the complete absence of test backdoor routes (such as `/proposed-actions/simulate`), test-only strings, or simulated fixtures inside production files (`index.ts` and route directories).
- **Smoke-Test Teardown**: Integration tests running against the server must spawn on ephemeral ports (`app.listen(0)`) or write to sandboxed Firestore tables with unique IDs, strictly cleaning up all fixtures inside a `finally` block to protect live databases from pollution.
