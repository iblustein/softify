export interface FirestoreConfig {
  projectId: string;
  databaseId: string;
  storeConnectionsCollection: string;
  productSnapshotsCollection: string;
}

/**
 * Reads environment configuration variables for Google Cloud Firestore.
 */
export function getFirestoreConfig(): FirestoreConfig {
  const backend = process.env.REPOSITORY_BACKEND || "memory";
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
  const storeConnectionsCollection = process.env.FIRESTORE_STORE_CONNECTIONS_COLLECTION || "shopify_store_connections";
  const productSnapshotsCollection = process.env.FIRESTORE_PRODUCT_SNAPSHOTS_COLLECTION || "product_snapshots";

  if (backend.toLowerCase() === "firestore" && !projectId) {
    throw new Error(
      "Configuration Error: REPOSITORY_BACKEND is set to 'firestore', but GOOGLE_CLOUD_PROJECT environment variable is missing."
    );
  }

  return {
    projectId,
    databaseId,
    storeConnectionsCollection,
    productSnapshotsCollection
  };
}

/**
 * Checks whether the application is configured to use Firestore repository backend.
 */
export function isFirestoreConfigured(): boolean {
  const backend = process.env.REPOSITORY_BACKEND || "memory";
  return backend.toLowerCase() === "firestore";
}
