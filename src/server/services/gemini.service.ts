import { GoogleGenAI } from "@google/genai";

// Initialize GoogleGenAI lazy loader safely
let ai: GoogleGenAI | null = null;

// TODO: Implement encrypted token storage to securely save and load API keys
export function getGeminiSDK(): GoogleGenAI | null {
  if (!ai && process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}
