/**
 * Workflow Service
 * ================
 * Core logic for AI Agent conversation flow.
 * Implements "Fast Paths" for quick actions (Reset Password, MS Form).
 * Integration with RAG (Supabase), AI Service (LLM), and BullMQ.
 */

import { generateStructuredResponse } from './ai_service';
import { searchKnowledgeBase } from './supabase_service';
import { getChatHistory, saveChatHistory } from './redis_service';
import { publishToQueue } from './bullmq_service';
import { sendSequentialReplies } from './webhook_service';
import { getSystemPrompt } from './prompt';
import { AgentResponseSchema } from '../models/models';
import { checkFastTrack } from './fasttrack_service';

export async function processChatWorkflow(sessionId: string, userText: string): Promise<void> {
  console.log(`[Background] Processing ${sessionId}`);

  try {
    const history = await getChatHistory(sessionId);

    interface WorkflowResponse {
      answers: string[];
      question: string;
      action: string;
      image_urls: string[];
    }
    let response: WorkflowResponse | null =
      checkFastTrack(userText, history);
    const shouldFastTrack = response !== null;

    let ragImages: string[] = [];

    if (!shouldFastTrack) {
      const { text: ragText, images: foundImages } = await searchKnowledgeBase(userText);
      ragImages = foundImages || [];

      let ragInfo = 'No relevant knowledge found.';
      if (ragText) {
        ragInfo = `[RETRIEVED KNOWLEDGE]:\n${ragText}`;
        console.log('[Background] RAG Found');
      }

      const systemPrompt = getSystemPrompt(userText, history, ragInfo);

      try {
        console.log('[LangChain] Generating Structured Response...');

        const structuredResponse = await generateStructuredResponse(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          AgentResponseSchema
        );

        console.log('[LangChain] Response Validated');

        response = {
          answers: structuredResponse.answers ?? [],
          question: structuredResponse.question ?? '',
          action: structuredResponse.action ?? 'none',
          image_urls: structuredResponse.image_urls ?? [],
        };
      } catch (err) {
        console.error('Structured Generation Failed:', (err as Error).message);

        response = {
          answers: ['ขออภัยค่ะ ระบบประมวลผลผิดพลาดเล็กน้อย กรุณาลองใหม่อีกครั้งค่ะ'],
          question: '',
          action: 'none',
          image_urls: [],
        };
      }
    }

    if (!response) {
      throw new Error('Response is null');
    }

    if (!response.answers || response.answers.length === 0) {
      console.warn('[workflow] AI returned empty answers. Injecting fallback message.');
      response.answers = [
        'ขออภัยค่ะ ฉันไม่พบข้อมูลที่เกี่ยวข้องในระบบ ต้องการให้ฉันช่วยติดต่อเจ้าหน้าที่หรือแจ้งปัญหาหรือไม่คะ?',
      ];
    }

    console.log('AI Response:', JSON.stringify(response, null, 2));

    if (response.action && response.action.toLowerCase() !== 'none') {
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
    console.error('[Background Error]:', error);
    await sendSequentialReplies(sessionId, ['ขออภัยค่ะ ระบบขัดข้องชั่วคราว']);
  }
}
