import type { CrusoeInferenceClient, ChatMessage } from '../inference/index';
import type { Intent } from './index';

const VALID_INTENTS: Intent[] = ['summarize', 'classify', 'extract', 'format', 'reasoning', 'code', 'other'];

const CLASSIFIER_PROMPT = `Classify the user's last message as exactly one of these labels: summarize, classify, extract, format, reasoning, code, other. Reply with exactly one lowercase word from the list. No explanation, no punctuation.`;

const CLASSIFIER_MODEL_ID = 'nano-30b-a3b'; // Nano = ~10ms per call

export async function classifyIntent(
  messages: ChatMessage[],
  inference: CrusoeInferenceClient
): Promise<Intent> {
  // Find last user message
  const lastUser = messages.filter((m) => m.role === 'user').pop();
  const userText = lastUser?.content ?? '';

  const classifierMessages: ChatMessage[] = [
    { role: 'system', content: CLASSIFIER_PROMPT },
    { role: 'user', content: userText },
  ];

  const result = await inference.chat({
    modelId: CLASSIFIER_MODEL_ID,
    messages: classifierMessages,
    temperature: 0,
    maxTokens: 5,
  });

  // Sanitize: lowercase, trim punctuation, take first word
  const raw = result.content.trim().toLowerCase().replace(/[^a-z]/g, '');
  if ((VALID_INTENTS as string[]).includes(raw)) {
    return raw as Intent;
  }
  return 'other';
}
