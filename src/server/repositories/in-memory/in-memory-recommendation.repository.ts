import { Recommendation } from "../../domain/types.js";

let recommendations: Recommendation[] = [];

export async function getRecommendationById(id: string): Promise<Recommendation | null> {
  const rec = recommendations.find(r => r.id === id);
  return rec || null;
}

export async function getRecommendationsByOrganizationId(organizationId: string): Promise<Recommendation[]> {
  return recommendations.filter(r => r.organizationId === organizationId);
}

export async function createRecommendation(rec: Recommendation): Promise<Recommendation> {
  recommendations.unshift(rec);
  return rec;
}

export async function updateRecommendation(
  id: string,
  updates: Partial<Omit<Recommendation, "id" | "organizationId" | "storeConnectionId">>
): Promise<Recommendation | null> {
  const idx = recommendations.findIndex(r => r.id === id);
  if (idx === -1) return null;

  recommendations[idx] = {
    ...recommendations[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return recommendations[idx];
}

export async function deleteRecommendation(id: string): Promise<boolean> {
  const len = recommendations.length;
  recommendations = recommendations.filter(r => r.id !== id);
  return recommendations.length < len;
}

export async function clearRecommendations(): Promise<void> {
  recommendations = [];
}
