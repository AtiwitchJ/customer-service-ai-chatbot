import axios from 'axios';

export async function sendSequentialReplies(
  sessionId: string,
  messages: string[],
  imageUrls: string[] = []
): Promise<void> {
  console.log(
    `📤 [Webhook] Sending replies to ${sessionId}. Messages: ${messages?.length || 0}, Images: ${imageUrls?.length || 0}`
  );
  if (!messages || messages.length === 0) {
    console.warn(`⚠️ [Webhook] No messages to send for ${sessionId}. Skipping.`);
    return;
  }
  const REPLY_WEBHOOK_URL = process.env.REPLY_WEBHOOK_URL;

  if (!REPLY_WEBHOOK_URL) {
    console.warn('⚠️ No Reply Webhook URL configured. Messages will not be sent.');
    return;
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLastMessage = i === messages.length - 1;

    try {
      const payload: {
        sessionId: string;
        replyText: string;
        image_urls?: string[];
      } = {
        sessionId,
        replyText: msg,
      };

      if (isLastMessage && imageUrls && imageUrls.length > 0) {
        payload.image_urls = imageUrls;
        console.log(`📸 [Webhook] Sending ${imageUrls.length} images with last message`);
      }

      await axios.post(REPLY_WEBHOOK_URL, payload);

      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`❌ Failed to send reply: ${msg}`, (error as Error).message);
    }
  }
}
