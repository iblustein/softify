import { Conversation, ConversationMessage } from "../../domain/types.js";

// TODO: Replace with structured database storage. Message history needs strong pagination support.
// In the future, vector databases can be integrated here to query semantic historical context for the agents.
let conversations: Conversation[] = [];
let messages: ConversationMessage[] = [];

export async function getConversationById(id: string): Promise<Conversation | null> {
  const conv = conversations.find(c => c.id === id);
  return conv || null;
}

export async function getConversationsByOrganizationId(organizationId: string): Promise<Conversation[]> {
  return conversations.filter(c => c.organizationId === organizationId);
}

export async function createConversation(conv: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation> {
  const newConv: Conversation = {
    ...conv,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  conversations.push(newConv);
  return newConv;
}

export async function deleteConversation(id: string): Promise<boolean> {
  const len = conversations.length;
  conversations = conversations.filter(c => c.id !== id);
  messages = messages.filter(m => m.conversationId !== id);
  return conversations.length < len;
}

// Message Operations
export async function getMessagesByConversationId(conversationId: string): Promise<ConversationMessage[]> {
  return messages.filter(m => m.conversationId === conversationId);
}

export async function addConversationMessage(msg: ConversationMessage): Promise<ConversationMessage> {
  messages.push(msg);
  // Update the conversation's updatedAt timestamp
  const convIdx = conversations.findIndex(c => c.id === msg.conversationId);
  if (convIdx !== -1) {
    conversations[convIdx].updatedAt = new Date().toISOString();
  }
  return msg;
}

export async function clearConversations(): Promise<void> {
  conversations = [];
  messages = [];
}
