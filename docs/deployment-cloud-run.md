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

## 4. Production Security Hardening

- **Access Token Safety**: Access tokens are encrypted using AES-256-GCM immediately upon exchange before being persisted to the storage layer. Raw tokens are never logged.
- **State Nonce Validation**: Nonces are stored in memory and validated timing-safely to prevent replay attacks during installation.
- **KMS Roadmap**: In high-security multi-tenant production architectures, replace `token-crypto.service.ts` encryption logic with a direct call to **Google Cloud KMS (Key Management Service)**.
