# Google Cloud Run Deployment Guide - Shopify OAuth Setup

This document describes the steps and environment configurations required to deploy the **Softify AI Agent platform** to Google Cloud Run as a secure SaaS dashboard using Shopify OAuth.

---

## 1. Google Cloud Run Setup Requirements

1. **Port Binding**: Google Cloud Run automatically routes web requests to the container on the port defined by the `PORT` environment variable. The server (`src/server/index.ts`) must run using `process.env.PORT` or default to `3000`/`8080`.
2. **Secrets Configuration**: Private credentials (such as `SHOPIFY_API_SECRET` and `SHOPIFY_TOKEN_ENCRYPTION_KEY`) must **NEVER** be committed to source control. They should be configured via **GCP Secret Manager** and mounted as environment variables in the Cloud Run service definition.

---

## 2. Required Environment Variables

Configure the following environment variables on your Google Cloud Run instance:

| Variable Name | Required | Description |
| :--- | :--- | :--- |
| `APP_URL` | Yes | The fully qualified public service URL (e.g. `https://softify-xyz-uc.a.run.app`) |
| `SHOPIFY_APP_URL` | Yes | The public URL of the Cloud Run app, identical to `APP_URL` |
| `SHOPIFY_API_KEY` | Yes | The API client key from the Shopify Partner Dashboard |
| `SHOPIFY_API_SECRET` | Yes | The API client secret (Retrieve from Secret Manager) |
| `SHOPIFY_SCOPES` | No | Comma-separated access scopes. Defaults to `read_products,read_orders,read_customers,read_themes,read_content` (Read-only) |
| `SHOPIFY_OAUTH_CALLBACK_PATH` | No | Redirect callback route path. Defaults to `/api/shopify/oauth/callback` |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY` | Yes | A cryptographically random 32-byte key used for AES-256-GCM token storage. |
| `SHOPIFY_ADMIN_API_VERSION` | No | Target Shopify Admin API version. Defaults to `2025-10`. |

---

## 3. Shopify Partner Dashboard Configuration

In your Shopify App setup inside the **Shopify Partners Dashboard**, navigate to the **App Setup** section and configure the following parameters:

1. **App URL**:
   Set this to the public address of your Cloud Run deployment:
   ```
   https://YOUR_CLOUD_RUN_URL/
   ```

2. **Allowed Redirection URL**:
   Set this to the callback URL endpoint defined on the router:
   ```
   https://YOUR_CLOUD_RUN_URL/api/shopify/oauth/callback
   ```

---

## 4. Firestore Database Persistence (Durable Storage)

To prevent Shopify store connections from being lost when Cloud Run containers restart or scale down, enable durable persistence in **Google Cloud Firestore**.

### 4.1. Required Environment Variables for Firestore

| Variable Name | Required | Description |
| :--- | :--- | :--- |
| `REPOSITORY_BACKEND` | Yes | Set to `firestore` to activate the Firestore persistence adapter. |
| `GOOGLE_CLOUD_PROJECT` | Yes | Your Google Cloud project ID (e.g. `my-softify-project-123`). |
| `FIRESTORE_DATABASE_ID` | No | Firestore database ID. Defaults to `(default)`. |
| `FIRESTORE_STORE_CONNECTIONS_COLLECTION` | No | Firestore collection name. Defaults to `shopify_store_connections`. |

### 4.2. Google Cloud IAM Permissions & Security

1. **Firestore Database Creation**:
   Ensure that a Firestore database is created inside your Google Cloud project (either in Native mode or Datastore mode). 
2. **Cloud Run Service Account Roles**:
   - The runtime service account assigned to the Cloud Run service must be granted the **Cloud Datastore User** (`roles/datastore.user`) IAM role.
   - This role allows full read, write, update, and delete access to the Firestore collections.
3. **No Private Keys Committed**:
   - **NEVER** create, download, or commit service account JSON credential files to your repository.
   - The `@google-cloud/firestore` library uses Google **Application Default Credentials (ADC)** automatically at runtime under Google Cloud environments.

### 4.3. Local Development Credentials

To test Firestore persistence locally without committing service account keys:
1. Install the [Google Cloud SDK](https://cloud.google.com/sdk).
2. Authenticate using Application Default Credentials:
   ```bash
   gcloud auth application-default login
   ```
3. Ensure your local command shell has `REPOSITORY_BACKEND=firestore` and `GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID` environment variables loaded. The SDK client will automatically discover the ADC credentials and connect directly.

---

## 5. Production Security Hardening

- **Access Token Safety**: Access tokens are encrypted using AES-256-GCM immediately upon exchange before being persisted to the storage layer. Raw tokens are never logged.
- **Encrypted Token Persistence**: Only the encrypted token (`accessTokenEncrypted`) is saved to Google Cloud Firestore.
- **State Nonce Validation**: Nonces are stored in memory and validated timing-safely to prevent replay attacks during installation.
- **KMS Roadmap**: In high-security multi-tenant production architectures, replace `token-crypto.service.ts` encryption logic with a direct call to **Google Cloud KMS (Key Management Service)**.
