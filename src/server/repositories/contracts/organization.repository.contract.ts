import { Organization } from "../../domain/types.js";

export interface OrganizationRepository {
  getOrganizationById(id: string): Promise<Organization | null>;
  getAllOrganizations(): Promise<Organization[]>;
  createOrganization(org: Omit<Organization, "createdAt" | "updatedAt">): Promise<Organization>;
  updateOrganization(id: string, updates: Partial<Omit<Organization, "id" | "createdAt">>): Promise<Organization | null>;
  deleteOrganization(id: string): Promise<boolean>;
  clearOrganizations(): Promise<void>;
}
