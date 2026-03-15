import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import type { z } from 'zod';

const KEEP_ALIVE = process.env.AI_AGENT_KEEP_ALIVE || '30m';

const OLLAMA_HOST = process.env.OLLAMA_BASE_URL;
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL;
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL;

console.log(`📡 [LangChain] Connecting to Ollama at: ${OLLAMA_HOST}`);

const llm = new ChatOllama({
  model: CHAT_MODEL,
  baseUrl: OLLAMA_HOST,
  temperature: 0,
  numCtx: 60000,
  keepAlive: KEEP_ALIVE,
  seed: 42,
});

export const embedModel = new OllamaEmbeddings({
  model: EMBED_MODEL,
  baseUrl: OLLAMA_HOST,
  keepAlive: KEEP_ALIVE,
});

console.log(`🤖 AI Service (LangChain) initialized - Host: ${OLLAMA_HOST}`);
console.log(`   Chat Model: ${CHAT_MODEL}`);
console.log(`   Embed Model: ${EMBED_MODEL}`);

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const startTime = Date.now();
    const embedding = await embedModel.embedQuery(text);
    console.log(`⏱️ [LangChain] Embedding took ${Date.now() - startTime}ms`);
    return embedding;
  } catch (error) {
    console.error('❌ [LangChain] Embedding Error:', (error as Error).message);
    return null;
  }
}

interface ChatMessage {
  role: string;
  content: string;
}

export async function generateChatCompletion(messages: ChatMessage[]): Promise<{
  choices: Array<{ message: { role: string; content: string } }>;
}> {
  try {
    const startTime = Date.now();
    console.log(`🚀 [LangChain] Starting chat completion with ${CHAT_MODEL}...`);

    const langChainMessages = messages.map((msg) => {
      if (msg.role === 'system') return new SystemMessage(msg.content);
      if (msg.role === 'user') return new HumanMessage(msg.content);
      if (msg.role === 'assistant') return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    });

    const response = await llm.invoke(langChainMessages);

    console.log(`⏱️ [LangChain] Chat completion took ${Date.now() - startTime}ms`);

    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: typeof response.content === 'string' ? response.content : String(response.content),
          },
        },
      ],
    };
  } catch (error) {
    console.error('❌ [LangChain] AI Error:', (error as Error).message);
    throw error;
  }
}

function zodToJSONSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (!schema) return {};
  const def = (schema as { _def?: { typeName?: string; type?: z.ZodTypeAny; innerType?: z.ZodTypeAny }; shape?: Record<string, z.ZodTypeAny>; description?: string })._def;
  const typeName = def?.typeName;
  if (typeName === 'ZodObject') {
    const shape = (schema as { shape?: Record<string, z.ZodTypeAny> }).shape;
    if (!shape) return { type: 'object', properties: {}, required: [] };
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJSONSchema(value);
      const val = value as { isOptional?: () => boolean };
      if (!val.isOptional?.()) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  if (typeName === 'ZodArray') {
    return { type: 'array', items: zodToJSONSchema(def?.type ?? (schema as { _def: { type: z.ZodTypeAny } })._def?.type) };
  }
  if (typeName === 'ZodString') {
    return { type: 'string', description: (schema as { description?: string }).description };
  }
  if (typeName === 'ZodNumber') return { type: 'number' };
  if (typeName === 'ZodBoolean') return { type: 'boolean' };
  if (typeName === 'ZodDefault' || typeName === 'ZodOptional') {
    return zodToJSONSchema(def?.innerType ?? (schema as { _def: { innerType: z.ZodTypeAny } })._def?.innerType);
  }
  return { type: 'string' };
}

const parser = new JsonOutputParser();

export async function generateStructuredResponse<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>
): Promise<T> {
  try {
    const startTime = Date.now();
    console.log(`🚀 [LangChain] Starting structured completion with ${CHAT_MODEL}...`);

    const langChainMessages = messages.map((msg) => {
      if (msg.role === 'system') return new SystemMessage(msg.content);
      if (msg.role === 'user') return new HumanMessage(msg.content);
      if (msg.role === 'assistant') return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    });

    const formatInstructions = `
You must output valid JSON.
The output should be a single JSON object matching this schema:
${JSON.stringify(zodToJSONSchema(schema), null, 2)}

Return ONLY the JSON object, no other text.`;

    let systemFound = false;
    for (let i = langChainMessages.length - 1; i >= 0; i--) {
      const msg = langChainMessages[i];
      if (msg instanceof SystemMessage) {
        (msg as { content: string }).content += '\n\n' + formatInstructions;
        systemFound = true;
        break;
      }
    }

    if (!systemFound) {
      langChainMessages.unshift(new SystemMessage(formatInstructions));
    }

    const response = await llm.invoke(langChainMessages, {
      format: 'json',
    } as Record<string, string>);

    let jsonObject: unknown;
    if (typeof response.content === 'string') {
      const cleanedContent = response.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      jsonObject = JSON.parse(cleanedContent);
    } else {
      jsonObject = response.content;
    }

    console.log(`⏱️ [LangChain] Structured completion took ${Date.now() - startTime}ms`);

    return schema.parse(jsonObject) as T;
  } catch (error) {
    const err = error as Error & { invalid_content?: string };
    console.error('❌ [LangChain] Structured Generation Error:', err.message);

    const isJsonError = err instanceof SyntaxError || err.message.includes('JSON');
    if (isJsonError) {
      console.log('⚠️ [LangChain] Attempting Self-Correction for JSON Error...');
      try {
        const correctionPrompt = PromptTemplate.fromTemplate(
          'The following JSON is invalid: {invalid_json}\nError: {error_msg}\n\nPlease fix the JSON and return ONLY the corrected JSON object.'
        );
        const chain = correctionPrompt.pipe(llm).pipe(parser);
        const correctedJson = await chain.invoke({
          invalid_json: err.invalid_content || 'unknown',
          error_msg: err.message,
        });
        console.log('✅ [LangChain] Self-Correction Successful!');
        return schema.parse(correctedJson) as T;
      } catch (retryError) {
        console.error('❌ [LangChain] Self-Correction Failed:', (retryError as Error).message);
        throw error;
      }
    }
    throw error;
  }
}
