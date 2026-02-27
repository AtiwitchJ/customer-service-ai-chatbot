const axios = require('axios');

// ฟังก์ชันสำหรับส่งข้อความตอบกลับไปยัง LINE หรือ Frontend ผ่าน Webhook
// image_urls จะถูกแนบไปกับข้อความสุดท้าย
async function sendSequentialReplies(sessionId, messages, imageUrls = []) {
    console.log(`📤 [Webhook] Sending replies to ${sessionId}. Messages: ${messages?.length || 0}, Images: ${imageUrls?.length || 0}`);
    if (!messages || messages.length === 0) {
        console.warn(`⚠️ [Webhook] No messages to send for ${sessionId}. Skipping.`);
        return;
    }
    const REPLY_WEBHOOK_URL = process.env.REPLY_WEBHOOK_URL;

    if (!REPLY_WEBHOOK_URL) {
        console.warn("⚠️ No Reply Webhook URL configured. Messages will not be sent.");
        return;
    }

    // ส่งทีละข้อความ (Sequential)
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const isLastMessage = (i === messages.length - 1);

        try {
            const payload = {
                sessionId: sessionId,
                replyText: msg
            };

            // แนบ image_urls ไปกับข้อความสุดท้าย
            if (isLastMessage && imageUrls && imageUrls.length > 0) {
                payload.image_urls = imageUrls;
                console.log(`📸 [Webhook] Sending ${imageUrls.length} images with last message`);
            }

            await axios.post(REPLY_WEBHOOK_URL, payload);

            // หน่วงเวลาเล็กน้อยเพื่อให้ข้อความไม่สลับกัน (Optional)
            await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
            console.error(`❌ Failed to send reply: ${msg}`, error.message);
        }
    }
}

module.exports = { sendSequentialReplies };