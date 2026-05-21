import { Organization } from "../../domain/types.js";

// TODO: Replace this in-memory collection with a database system (e.g., PostgreSQL)
// In production, multi-tenant databases will handle querying and foreign key cascade deletions.
let organizations: Organization[] = [];

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const org = organizations.find(o => o.id === id);
  return org || null;
}

export async function getAllOrganizations(): Promise<Organization[]> {
  return [...organizations];
}

export async function createOrganization(org: Omit<Organization, 'createdAt' | 'updatedAt'>): Promise<Organization> {
  const newOrg: Organization = {
    ...org,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  organizations.push(newOrg);
  return newOrg;
}

export async function updateOrganization(id: string, updates: Partial<Omit<Organization, 'id' | 'createdAt'>>): Promise<Organization | null> {
  const idx = organizations.findIndex(o => o.id === id);
  if (idx === -1) return null;

  organizations[idx] = {
    ...organizations[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return organizations[idx];
}

export async function deleteOrganization(id: string): Promise<boolean> {
  const len = organizations.length;
  organizations = organizations.filter(o => o.id !== id);
  return organizations.length < len;
}

export async function clearOrganizations(): Promise<void> {
  organizations = [];
}
