/**
 * Chat Model (Mongoose Schema)
 * =============================
 * MongoDB schema for chat sessions / Schema สำหรับเก็บข้อมูลแชทใน MongoDB
 *
 * NOTE: This model is kept for backward compatibility / โมเดลนี้เก็บไว้เพื่อความเข้ากันได้
 * Currently using JsonChatModel instead / ปัจจุบันใช้ JsonChatModel แทน
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessage {
  msgId?: string;
  sender: string;
  text: string;
  time?: Date;
  createdAt?: Date;
  feedback?: string;
}

export interface IChat extends Document {
  sessionId: string;
  messages: IChatMessage[];
  updatedAt: Date;
}

const ChatSchema = new Schema<IChat>(
  {
    sessionId: String,
    messages: [
      {
        msgId: String,
        sender: String,
        text: String,
        time: Date,
        createdAt: Date,
        feedback: String,
      },
    ],
    updatedAt: Date,
  },
  { collection: 'chats' }
);

const ChatModel = (mongoose.models.Chat as mongoose.Model<IChat>) || mongoose.model<IChat>('Chat', ChatSchema);

export default ChatModel;
