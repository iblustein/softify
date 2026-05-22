import { Firestore } from "@google-cloud/firestore";
import { getFirestoreConfig } from "../config/firestore.config";

let firestoreInstance: Firestore | null = null;

/**
 * Returns a singleton Google Cloud Firestore client instance initialized
 * using Application Default Credentials (ADC).
 * 
 * Comments on Credentials and IAM:
 * 1. In Google Cloud Run (production):
 *    - The Cloud Run service automatically leverages the runtime service account.
 *    - Ensure the runtime service account is granted the 'Cloud Datastore User' (roles/datastore.user) IAM role.
 *    - No service account JSON credentials need to be configured or committed to the codebase.
 * 
 * 2. In Local Development:
 *    - Execute `gcloud auth application-default login` to set up Application Default Credentials on your local system.
 *    - The Google Cloud SDK will automatically capture credentials, and the Firestore client will resolve them.
 */
export function getFirestoreClient(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const config = getFirestoreConfig();

  firestoreInstance = new Firestore({
    projectId: config.projectId,
    databaseId: config.databaseId,
  });

  return firestoreInstance;
}
