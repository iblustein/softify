export type AiProviderName = 'mock' | 'gemini';

export type AiToolCallRequest = {
  type: 'tool_call';
  toolName: string;
  arguments: Record<string, unknown>;
};

export type AiFinalAnswer = {
  type: 'final';
  message: string;
};

export type AiProviderResponse = AiToolCallRequest | AiFinalAnswer;

export type AiProviderInput = {
  agentId: string;
  shop: string;
  message: string;
  allowedTools: string[];
  toolResults?: Array<{
    toolName: string;
    result: unknown;
  }>;
};

export interface AiProvider {
  name: AiProviderName;
  generate(input: AiProviderInput): Promise<AiProviderResponse>;
}
