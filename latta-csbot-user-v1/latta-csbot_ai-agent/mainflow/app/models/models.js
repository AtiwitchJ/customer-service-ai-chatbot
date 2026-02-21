const { z } = require('zod');

const WebhookRequestSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    text: z.string().min(1, "Text input cannot be empty")
});

const AgentResponseSchema = z.object({
    answers: z.array(z.string()).default([]).describe("List of answers separated by question topics"),
    question: z.string().default("").describe("Closing question (if any)"),
    action: z.string().default("none").describe("Action to take: none, reset_password, or ms_form"),
    thinking_process: z.string().nullable().default(null).describe("Reasoning process for the response"),
    image_urls: z.array(z.string()).default([]).describe("List of image URLs")
});

module.exports = { WebhookRequestSchema, AgentResponseSchema };
