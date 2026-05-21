import { User } from "../../domain/types.js";

export interface UserRepository {
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getAllUsers(): Promise<User[]>;
  createUser(user: Omit<User, "createdAt" | "updatedAt">): Promise<User>;
  updateUser(id: string, updates: Partial<Omit<User, "id" | "createdAt">>): Promise<User | null>;
  deleteUser(id: string): Promise<boolean>;
  clearUsers(): Promise<void>;
}
