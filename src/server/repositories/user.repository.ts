import { User } from "../domain/types.js";

// TODO: Replace this in-memory collection with a real database model (e.g. Prisma + PostgreSQL)
let users: User[] = [];

export async function getUserById(id: string): Promise<User | null> {
  const user = users.find(u => u.id === id);
  return user || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  return user || null;
}

export async function getAllUsers(): Promise<User[]> {
  return [...users];
}

export async function createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
  const newUser: User = {
    ...user,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  users.push(newUser);
  return newUser;
}

export async function updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | null> {
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  
  users[idx] = {
    ...users[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return users[idx];
}

export async function deleteUser(id: string): Promise<boolean> {
  const lengthBefore = users.length;
  users = users.filter(u => u.id !== id);
  return users.length < lengthBefore;
}

export async function clearUsers(): Promise<void> {
  users = [];
}
