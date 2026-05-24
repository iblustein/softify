# Deployment and Secrets

This document details the CI/CD deployment pipelines, runtime credential integration, Google Secret Manager configurations, and active service accounts of the **Softify** platform.

---

## 1. Deployment Pipeline
- **Engine**: GitHub Actions workflow (`.github/workflows/deploy-cloud-run.yml`).
- **Target**: Google Cloud Run.
- **Service Name**: `softify`
- **Region**: `europe-west1`
- **Project**: `softify-dev`
- **Custom Delimiter Env Vars**: Uses `^|^` custom delimiters in `gcloud --set-env-vars` flags to prevent commas in scopes (such as `read_products,read_orders`) from causing build-time syntax errors.

## 2. Secrets Management
Secrets are divided into pipeline-only variables and production runtime secrets injected via GCP Secret Manager.

### GitHub Actions Secrets
Verified and validated before executing builds/deploys:
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `SOFTIFY_TEST_SHOP`
- `SHOPIFY_API_KEY`
- `SHOPIFY_APP_URL`
- `SOFTIFY_AGENT_DEV_BYPASS_SECRET` (Also verified here because `smoke-test.mjs` requires it for diagnostic bypass headers)

### Google Secret Manager Secrets
Durable secrets loaded dynamically into the Cloud Run service container at startup via `--set-secrets`:
- `SHOPIFY_API_SECRET`
- `SHOPIFY_TOKEN_ENCRYPTION_KEY`
- `SOFTIFY_AGENT_DEV_BYPASS_SECRET`

> [!IMPORTANT]
> **SHOPIFY_TOKEN_ENCRYPTION_KEY Protection**: This key must never be rotated or changed. Modifying this key will break decryption compatibility for all existing Shopify merchant tokens stored inside the Firestore database, forcing full re-authentications.

## 3. Service Accounts
- **Runtime Service Account**:
  `595151907767-compute@developer.gserviceaccount.com`
  Runs the Cloud Run container and requires access to Google Secret Manager and Firestore databases.
- **GitHub Deploy Service Account**:
  `github-softify-deployer@softify-dev.iam.gserviceaccount.com`
  Authenticates the GitHub pipeline to build, push images, and deploy containers via Workload Identity Federation.
