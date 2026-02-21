const { ChatOllama, OllamaEmbeddings } = require('@langchain/ollama');
const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');
const { JsonOutputParser } = require('@langchain/core/output_parsers');
const { PromptTemplate } = require('@langchain/core/prompts');

// Timeout configuration (in milliseconds)
const KEEP_ALIVE = process.env.AI_AGENT_KEEP_ALIVE || "30m";

// Configure Environment Variables
const OLLAMA_HOST = process.env.OLLAMA_BASE_URL;
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL;
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL;

console.log(`📡 [LangChain] Connecting to Ollama at: ${OLLAMA_HOST}`);

// Initialize LangChain ChatOllama
const llm = new ChatOllama({
    model: CHAT_MODEL,
    baseUrl: OLLAMA_HOST,
    temperature: 0,
    numCtx: 60000,
    keepAlive: KEEP_ALIVE,
    seed: 42,
});

// Initialize LangChain OllamaEmbeddings
const embedModel = new OllamaEmbeddings({
    model: EMBED_MODEL,
    baseUrl: OLLAMA_HOST,
    keepAlive: KEEP_ALIVE,
});

console.log(`🤖 AI Service (LangChain) initialized - Host: ${OLLAMA_HOST}`);
console.log(`   Chat Model: ${CHAT_MODEL}`);
console.log(`   Embed Model: ${EMBED_MODEL}`);

/**
 * ฟังก์ชันสร้าง Embedding Vector จากข้อความ (LangChain)
 */
async function getEmbedding(text) {
    try {
        const startTime = Date.now();
        const embedding = await embedModel.embedQuery(text);
        console.log(`⏱️ [LangChain] Embedding took ${Date.now() - startTime}ms`);
        return embedding;
    } catch (error) {
        console.error("❌ [LangChain] Embedding Error:", error.message);
        return null;
    }
}

/**
 * ฟังก์ชันสร้าง Chat Completion (LangChain)
 */
async function generateChatCompletion(messages) {
    try {
        const startTime = Date.now();
        console.log(`🚀 [LangChain] Starting chat completion with ${CHAT_MODEL}...`);

        // Convert generic messages to LangChain messages
        const langChainMessages = messages.map(msg => {
            if (msg.role === 'system') return new SystemMessage(msg.content);
            if (msg.role === 'user') return new HumanMessage(msg.content);
            if (msg.role === 'assistant') return new AIMessage(msg.content);
            return new HumanMessage(msg.content);
        });

        const response = await llm.invoke(langChainMessages);

        console.log(`⏱️ [LangChain] Chat completion took ${Date.now() - startTime}ms`);

        return {
            choices: [{
                message: {
                    role: "assistant",
                    content: response.content
                }
            }]
        };
    } catch (error) {
        console.error("❌ [LangChain] AI Error:", error.message);
        throw error;
    }
}

/**
 * Generate Structured Response using LangChain and Zod Schema
 * @param {Array} messages - Chat messages
 * @param {ZodSchema} schema - Zod schema to enforce
 * @returns {object} - Validated object matching schema
 */
async function generateStructuredResponse(messages, schema) {
    try {
        const startTime = Date.now();
        console.log(`🚀 [LangChain] Starting structured completion with ${CHAT_MODEL}...`);

        // 1. Setup Parser and Prompt
        const parser = new JsonOutputParser();
        
        // 2. Convert messages to LangChain format
        const langChainMessages = messages.map(msg => {
            if (msg.role === 'system') return new SystemMessage(msg.content);
            if (msg.role === 'user') return new HumanMessage(msg.content);
            if (msg.role === 'assistant') return new AIMessage(msg.content);
            return new HumanMessage(msg.content);
        });

        // 3. Add format instructions to the last system message or add a new one
        const formatInstructions = `
You must output valid JSON.
The output should be a single JSON object matching this schema:
${JSON.stringify(zodToJSONSchema(schema), null, 2)}

Return ONLY the JSON object, no other text.`;

        // Find last system message to append instructions
        let systemFound = false;
        for (let i = langChainMessages.length - 1; i >= 0; i--) {
            if (langChainMessages[i] instanceof SystemMessage) {
                langChainMessages[i].content += "\n\n" + formatInstructions;
                systemFound = true;
                break;
            }
        }

        if (!systemFound) {
            langChainMessages.unshift(new SystemMessage(formatInstructions));
        }

        // 4. Invoke LLM with JSON format option
        const response = await llm.invoke(langChainMessages, {
            format: "json"
        });

        // 5. Parse and Validate
        let jsonObject;
        if (typeof response.content === 'string') {
            const cleanedContent = response.content.replace(/```json/g, "").replace(/```/g, "").trim();
            jsonObject = JSON.parse(cleanedContent);
        } else {
            jsonObject = response.content;
        }

        console.log(`⏱️ [LangChain] Structured completion took ${Date.now() - startTime}ms`);

        // 6. Zod Parse (Validation + Transformation)
        return schema.parse(jsonObject);

    } catch (error) {
        console.error("❌ [LangChain] Structured Generation Error:", error.message);
        
        // --- SELF-CORRECTION LOGIC ---
        const isJsonError = error instanceof SyntaxError || error.message.includes("JSON");
        if (isJsonError) {
            console.log("⚠️ [LangChain] Attempting Self-Correction for JSON Error...");
            try {
                const correctionPrompt = PromptTemplate.fromTemplate(
                    "The following JSON is invalid: {invalid_json}\nError: {error_msg}\n\nPlease fix the JSON and return ONLY the corrected JSON object."
                );
                const chain = correctionPrompt.pipe(llm).pipe(parser);
                const correctedJson = await chain.invoke({
                    invalid_json: error.invalid_content || "unknown",
                    error_msg: error.message
                });
                console.log("✅ [LangChain] Self-Correction Successful!");
                return schema.parse(correctedJson);
            } catch (retryError) {
                console.error("❌ [LangChain] Self-Correction Failed:", retryError.message);
                throw error;
            }
        }
        throw error;
    }
}

/**
 * Simple Zod to JSON Schema converter
 */
function zodToJSONSchema(schema) {
    if (!schema) return {};
    if (schema._def.typeName === 'ZodObject') {
        const properties = {};
        const required = [];
        for (const [key, value] of Object.entries(schema.shape)) {
            properties[key] = zodToJSONSchema(value);
            if (!value.isOptional()) required.push(key);
        }
        return { type: "object", properties, required };
    }
    if (schema._def.typeName === 'ZodArray') {
        return { type: "array", items: zodToJSONSchema(schema._def.type) };
    }
    if (schema._def.typeName === 'ZodString') {
        return { type: "string", description: schema.description };
    }
    if (schema._def.typeName === 'ZodNumber') return { type: "number" };
    if (schema._def.typeName === 'ZodBoolean') return { type: "boolean" };
    if (schema._def.typeName === 'ZodDefault' || schema._def.typeName === 'ZodOptional') {
        return zodToJSONSchema(schema._def.innerType);
    }
    return { type: "string" };
}

module.exports = {
    getEmbedding,
    generateChatCompletion,
    generateStructuredResponse,
    embedModel // Export embedModel for use in vector stores
};
