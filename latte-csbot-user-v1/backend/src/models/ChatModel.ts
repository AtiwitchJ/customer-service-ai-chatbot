import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessage {
  msgId?: string;
  sender?: string;
  text?: string;
  image_urls?: string[];
  time?: string;
  feedback?: string;
  createdAt?: Date;
}

export interface IChat extends Document {
  sessionId: string;
  messages: IChatMessage[];
  updatedAt: Date;
}

const chatSchema = new Schema<IChat>(
  {
    sessionId: { type: String, required: true, index: true },
    messages: [
      {
        msgId: String,
        sender: String,
        text: String,
        image_urls: [String],
        time: String,
        feedback: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'chats' }
);

export default mongoose.models.Chat || mongoose.model<IChat>('Chat', chatSchema);
