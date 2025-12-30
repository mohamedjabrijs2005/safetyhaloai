
import { GoogleGenAI, Type } from "@google/genai";
import { RoomContext, GeminiSafetyReport, SafetyStatus } from "../types.ts";

const SYSTEM_INSTRUCTION = `
You are an AI Context-Aware Safety Assistant for hostel rooms, homes, and PGs.
You receive structured JSON about a room’s current state from sensors and an ML model.
Your job is to:
1. Understand the context from the JSON.
2. Decide if the situation is SAFE, WARNING, or DANGER.
3. Explain in very simple language what is happening.
4. Give 1–3 clear action steps for the user and, if needed, the warden/owner.
Keep answers short (3–6 sentences) and non-technical.
`;

export async function analyzeSafetyContext(context: RoomContext): Promise<GeminiSafetyReport> {
  // Initialize AI client per-request to ensure the latest API key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: JSON.stringify(context),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, description: "One word: SAFE, WARNING, or DANGER" },
            summary: { type: Type.STRING, description: "1-2 sentence explanation" },
            actions_for_user: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Bullet list of 1-3 actions"
            },
            actions_for_warden: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Bullet list of actions or 'None needed.'"
            }
          },
          required: ["status", "summary", "actions_for_user", "actions_for_warden"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      status: data.status as SafetyStatus || SafetyStatus.SAFE,
      summary: data.summary || "No analysis available.",
      actions_for_user: data.actions_for_user || [],
      actions_for_warden: data.actions_for_warden || ["None needed."]
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      status: SafetyStatus.SAFE,
      summary: "Communication error with AI. Falling back to local heuristics.",
      actions_for_user: ["Check sensors manually."],
      actions_for_warden: ["None needed."]
    };
  }
}
