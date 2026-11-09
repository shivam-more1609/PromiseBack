/**
 * PromiseBack Resilient Gemini API Client
 * Provides robust, low-latency, structured LLM inference using Google Gemini REST APIs.
 * Supports automatic fallback across fast flash models and deterministic engines.
 */

export interface GeminiResponse<T> {
  success: boolean;
  data: T | null;
  modelName: string;
  isLive: boolean;
  error?: string;
  latencyMs: number;
}

const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash'];

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return !!(key && key.trim().length > 10 && !key.includes('your_'));
}

export function getPreferredModelName(): string {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel && !envModel.includes('your_')) {
    return envModel;
  }
  return 'gemini-3.5-flash-lite';
}

/**
 * Executes a call to Google Gemini with JSON output format.
 * Tries the preferred model first, then known fast fallback models if timeout or 404/unavailable.
 */
export async function callGeminiStructured<T>(
  prompt: string,
  options: {
    systemPrompt?: string;
    temperature?: number;
    timeoutMs?: number;
    schemaDescription?: string;
  } = {}
): Promise<GeminiResponse<T>> {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || apiKey.length <= 10 || apiKey.includes('your_')) {
    return {
      success: false,
      data: null,
      modelName: 'none',
      isLive: false,
      error: 'GEMINI_NOT_CONFIGURED: Missing valid GEMINI_API_KEY in environment.',
      latencyMs: 0
    };
  }

  const preferred = getPreferredModelName();
  // Unique list of models to try
  const modelsToAttempt = Array.from(new Set([preferred, ...FALLBACK_MODELS]));
  const timeoutMs = options.timeoutMs || 10000;
  const temperature = options.temperature ?? 0.1;

  let lastError = '';

  for (const model of modelsToAttempt) {
    const modelStart = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents: any[] = [];
      if (options.systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: `[SYSTEM INSTRUCTION & COMPLIANCE GUARDRAIL]\n${options.systemPrompt}` }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Understood. I will strictly follow these instructions and compliance rules.' }]
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature
          }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        const errText = await response.text();
        lastError = `Model ${model} returned HTTP ${response.status}: ${errText.substring(0, 200)}`;
        // If 404 or deprecated or 429, continue to next candidate model
        if (response.status === 404 || response.status === 429 || response.status === 400) {
          continue;
        }
        continue;
      }

      const jsonResult = await response.json();
      const rawText = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        lastError = `Model ${model} returned empty candidate text.`;
        continue;
      }

      // Parse and clean JSON (stripping markdown code blocks if present)
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed: T = JSON.parse(cleaned);

      return {
        success: true,
        data: parsed,
        modelName: model,
        isLive: true,
        latencyMs: Date.now() - startTime
      };
    } catch (err: any) {
      lastError = `Model ${model} error: ${err.message}`;
      // On timeout or abort, try next candidate
      continue;
    }
  }

  return {
    success: false,
    data: null,
    modelName: preferred,
    isLive: false,
    error: lastError || 'All Gemini model candidates failed or timed out.',
    latencyMs: Date.now() - startTime
  };
}

/**
 * Text generation for conversational Studio Agent queries.
 */
export async function callGeminiText(
  prompt: string,
  options: {
    systemPrompt?: string;
    temperature?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ text: string; modelName: string; isLive: boolean; latencyMs: number; error?: string }> {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || apiKey.length <= 10 || apiKey.includes('your_')) {
    return {
      text: '',
      modelName: 'none',
      isLive: false,
      latencyMs: 0,
      error: 'GEMINI_NOT_CONFIGURED: Missing valid GEMINI_API_KEY.'
    };
  }

  const preferred = getPreferredModelName();
  const modelsToAttempt = Array.from(new Set([preferred, ...FALLBACK_MODELS]));
  const timeoutMs = options.timeoutMs || 10000;

  let lastError = '';

  for (const model of modelsToAttempt) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents: any[] = [];
      if (options.systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: `[SYSTEM INSTRUCTION]\n${options.systemPrompt}` }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Understood. I will strictly follow your instructions.' }]
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.2
          }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const jsonResult = await response.json();
      const rawText = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;

      if (rawText) {
        return {
          text: rawText.trim(),
          modelName: model,
          isLive: true,
          latencyMs: Date.now() - startTime
        };
      }
    } catch (err: any) {
      lastError = err.message;
      continue;
    }
  }

  return {
    text: '',
    modelName: preferred,
    isLive: false,
    latencyMs: Date.now() - startTime,
    error: lastError || 'All models failed.'
  };
}
