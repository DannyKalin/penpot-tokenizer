import type { MatrixRow } from '../types';

export type AiProviderId = 'gemini';

export interface AiModelOption {
  id: string;
  label: string;
  hint: string;
}

export interface AiProviderDefinition {
  id: AiProviderId;
  label: string;
  keyPlaceholder: string;
  models: AiModelOption[];
}

export interface AiSettings {
  provider: AiProviderId;
  model: string;
  apiKey: string;
}

export const AI_PROVIDERS: AiProviderDefinition[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyPlaceholder: 'Enter your Gemini API key...',
    models: [
      {
        id: 'gemini-3.5-flash-lite',
        label: 'Gemini 3.5 Flash-Lite (Recommended)',
        hint: 'Fastest & lowest cost for concise token descriptions and AI usage instructions.',
      },
      {
        id: 'gemini-3.6-flash',
        label: 'Gemini 3.6 Flash',
        hint: 'Stronger semantic reasoning for complex multi-mode or component tokens.',
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        hint: 'Stable general-purpose model for design token documentation.',
      },
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro (Preview)',
        hint: 'Highest reasoning quality for nuanced design system guidelines.',
      },
    ],
  },
];

const STORAGE_KEY = 'penpot-tokenizer:ai-settings';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  apiKey: '',
};

export function getProviderDefinition(providerId: AiProviderId): AiProviderDefinition {
  return AI_PROVIDERS.find((p) => p.id === providerId) ?? AI_PROVIDERS[0];
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const provider = parsed.provider === 'gemini' ? 'gemini' : 'gemini';
    const def = getProviderDefinition(provider);
    const validModel = def.models.some((m) => m.id === parsed.model)
      ? (parsed.model as string)
      : def.models[0].id;
    return {
      provider,
      model: validModel,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / sandbox restrictions
  }
}

function buildModeSummary(token: MatrixRow, allRows: MatrixRow[]): string {
  const entries = Object.entries(token.valuesByMode).filter(([, v]) => v.trim() !== '');
  if (entries.length === 0) return '(no mode values set yet)';

  return entries
    .map(([mode, val]) => {
      const trimmed = val.trim();
      const aliasMatch = /^\{(.+)\}$/.exec(trimmed);
      if (aliasMatch) {
        const target = allRows.find((r) => r.name === aliasMatch[1].trim());
        const resolved = target?.valuesByMode[mode] ?? Object.values(target?.valuesByMode ?? {})[0];
        if (resolved) {
          return `- ${mode}: ${trimmed} (resolves to ${resolved})`;
        }
      }
      return `- ${mode}: ${trimmed}`;
    })
    .join('\n');
}

function buildTokenPrompt(
  token: MatrixRow,
  userDraftDescription: string,
  allRows: MatrixRow[],
): string {
  const trimmedDraft = userDraftDescription.trim();
  const modeSummary = buildModeSummary(token, allRows);

  return [
    'You are a design systems architect writing AI-ready design token documentation.',
    '',
    'Strict rules:',
    '1. Base your output strictly on the provided user description/notes (if present) and the token metadata below. Do NOT guess or invent unrelated components, states, or behaviors that are not supported by the input.',
    '2. Analyze the scenario, component, and behavior described, and produce concise, best-practice guidance tailored specifically to that exact scenario.',
    '3. Output plain text in this exact two-part structure:',
    'Description: <1 concise sentence describing what this token represents for the scenario>',
    'AI Instructions: <2-3 concise, actionable best-practice rules for AI/developers covering exact component/scenario usage, state/surface pairing, and what to avoid>',
    '',
    `Token Name: ${token.name || '(unnamed)'}`,
    `Token Type: ${token.type}`,
    'Mode Values:',
    modeSummary,
    trimmedDraft
      ? `User Description / Scenario Notes:\n${trimmedDraft}`
      : 'User Description / Scenario Notes: (none provided — derive strictly from the token name, type, and mode values without guessing unsupported components)',
  ].join('\n');
}

export async function generateTokenDescription(params: {
  settings: AiSettings;
  token: MatrixRow;
  userDraftDescription: string;
  allRows: MatrixRow[];
}): Promise<string> {
  const { settings, token, userDraftDescription, allRows } = params;
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new Error('No API key configured. Open Settings to add your API key.');
  }

  const prompt = buildTokenPrompt(token, userDraftDescription, allRows);

  if (settings.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      settings.model,
    )}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } };
        if (errJson.error?.message) {
          detail = errJson.error.message;
        }
      } catch {
        // Keep HTTP status fallback
      }
      throw new Error(`Gemini API error: ${detail}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? '';

    if (!text) {
      throw new Error('Model returned an empty response.');
    }

    return text;
  }

  throw new Error(`Unsupported AI provider: ${settings.provider}`);
}

export async function validateAiApiKey(
  settings: AiSettings,
): Promise<{ valid: boolean; message: string }> {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    return { valid: false, message: 'Enter an API key first.' };
  }

  if (settings.provider === 'gemini') {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        settings.model,
      )}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      });

      if (response.ok) {
        return { valid: true, message: 'API key is valid and ready.' };
      }

      let detail = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } };
        if (errJson.error?.message) {
          detail = errJson.error.message;
        }
      } catch {
        // Keep HTTP status fallback
      }
      return { valid: false, message: detail };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Network error validating key.',
      };
    }
  }

  return { valid: false, message: `Unsupported provider: ${settings.provider}` };
}
