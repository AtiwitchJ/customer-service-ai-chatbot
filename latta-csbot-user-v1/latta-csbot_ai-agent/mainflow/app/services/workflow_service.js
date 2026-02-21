/**
 * Workflow Service
 * ================
 * Responsibilities:
 * - Core logic for AI Agent conversation flow.
 * - Implements "Fast Paths" for quick actions (Reset Password, MS Form).
 * - Integration with RAG (Supabase), AI Service (LLM), and BullMQ.
 * - Manages chat history and sends responses back via Webhook.
 *
 * หน้าที่หลัก:
 * - Logic หลักสำหรับการทำงานตอบโต้ของ AI Agent
 * - ระบบ "Fast Paths" สำหรับการตอบสนองด่วน (รีเซ็ตรหัสผ่าน, ขอฟอร์ม)
 * - เชื่อมต่อกับ RAG, LLM, และ BullMQ
 * - จัดการประวัติแชทและส่งคำตอบกลับผ่าน Webhook
 */

const { generateStructuredResponse } = require('./ai_service');
const { searchKnowledgeBase } = require('./supabase_service');
const { getChatHistory, saveChatHistory } = require('./redis_service');
const { publishToQueue } = require('./bullmq_service');
const { sendSequentialReplies } = require('./webhook_service');
const { getSystemPrompt } = require('./prompt');
const { AgentResponseSchema } = require('../models/models');
const { checkFastTrack } = require('./fasttrack_service');


async function processChatWorkflow(sessionId, userText) {
    console.log(`[Background] Processing ${sessionId}`);

    try {
        const history = await getChatHistory(sessionId);
        const userTextLower = userText.toLowerCase();

        // ========== FAST TRACK CHECK ==========
        // ตรวจสอบคำสั่งด่วนที่ไม่ต้องผ่าน AI
        let response = checkFastTrack(userText, history);
        let shouldFastTrack = response !== null;

        let ragImages = [];

        if (!shouldFastTrack) {
            const { text: ragText, images: foundImages } = await searchKnowledgeBase(userText);
            ragImages = foundImages || [];

            let ragInfo = "No relevant knowledge found.";
            if (ragText) {
                ragInfo = `[RETRIEVED KNOWLEDGE]:\n${ragText}`;
                console.log("[Background] RAG Found");
            }

            const systemPrompt = getSystemPrompt(userText, history, ragInfo);

            try {
                console.log("[LangChain] Generating Structured Response...");

                response = await generateStructuredResponse([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userText }
                ], AgentResponseSchema);

                console.log("[LangChain] Response Validated");

                response.image_urls = [];

            } catch (err) {
                console.error("Structured Generation Failed:", err.message);

                response = {
                    thinking_process: "Fallback due to AI Error",
                    answers: ["ขออภัยค่ะ ระบบประมวลผลผิดพลาดเล็กน้อย กรุณาลองใหม่อีกครั้งค่ะ"],
                    question: "",
                    action: "none",
                    image_urls: []
                };
            }
        }

        if (!response.answers || response.answers.length === 0) {
            console.warn("[workflow] AI returned empty answers. Injecting fallback message.");
            response.answers = ["ขออภัยค่ะ ฉันไม่พบข้อมูลที่เกี่ยวข้องในระบบ ต้องการให้ฉันช่วยติดต่อเจ้าหน้าที่หรือแจ้งปัญหาหรือไม่คะ?"];
        }

        console.log("AI Response:", JSON.stringify(response, null, 2));

        if (!response) throw new Error("Response is null");

        if (response.action && response.action.toLowerCase() !== "none") {
            console.log(`[Background] Action Triggered: ${response.action}`);
            await publishToQueue(sessionId, response.action);
        }

        const messagesToSend = [...(response.answers || [])];
        if (response.question) messagesToSend.push(response.question);

        const fullTextLog = messagesToSend.join('\n');
        await saveChatHistory(sessionId, userText, fullTextLog);

        await sendSequentialReplies(sessionId, response.answers || [], response.image_urls || []);

        if (response.question) {
            await sendSequentialReplies(sessionId, [response.question], []);
        }

        console.log(`[Background] Finished: ${sessionId}`);

    } catch (error) {
        console.error(`[Background Error]:`, error);
        await sendSequentialReplies(sessionId, ["ขออภัยค่ะ ระบบขัดข้องชั่วคราว"]);
    }
}

module.exports = { processChatWorkflow };
