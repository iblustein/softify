import { Recommendation } from "../../domain/types.js";

export interface RecommendationRepository {
  getRecommendationById(id: string): Promise<Recommendation | null>;
  getRecommendationsByOrganizationId(organizationId: string): Promise<Recommendation[]>;
  createRecommendation(recommendation: Recommendation): Promise<Recommendation>;
  updateRecommendation(
    id: string,
    updates: Partial<Omit<Recommendation, "id" | "organizationId" | "storeConnectionId">>
  ): Promise<Recommendation | null>;
  deleteRecommendation(id: string): Promise<boolean>;
  clearRecommendations(): Promise<void>;
}
