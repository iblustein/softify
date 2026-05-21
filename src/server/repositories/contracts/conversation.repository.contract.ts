import { Conversation, ConversationMessage } from "../../domain/types.js";

export interface ConversationRepository {
  getConversationById(id: string): Promise<Conversation | null>;
  getConversationsByOrganizationId(organizationId: string): Promise<Conversation[]>;
  createConversation(conv: Omit<Conversation, "createdAt" | "updatedAt">): Promise<Conversation>;
  deleteConversation(id: string): Promise<boolean>;
  getMessagesByConversationId(conversationId: string): Promise<ConversationMessage[]>;
  addConversationMessage(msg: ConversationMessage): Promise<ConversationMessage>;
  clearConversations(): Promise<void>;
}
