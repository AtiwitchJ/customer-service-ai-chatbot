# LATTA-CSBOT

ระบบ AI Customer Service Chatbot สำหรับองค์กร ออกแบบแบบโมดูลาร์ รันทั้งหมดผ่าน Docker Compose ชุดเดียว
ผู้ใช้สนทนาผ่านหน้าเว็บแชท ระบบจะดึงความรู้จากฐานข้อมูลเอกสาร (RAG) มาประกอบกับ LLM แล้วตอบกลับแบบ real-time
ฝั่งผู้ดูแลมี Dashboard สำหรับจัดการเอกสาร อัปโหลดไฟล์ และดูสถิติ

---

## สถาปัตยกรรมภาพรวม

```mermaid
flowchart LR
    subgraph userSide [User Side]
        UF["User Frontend :80"]
        UB["User Backend :3001"]
        AI["AI Agent :8765"]
    end

    subgraph adminSide [Admin Side]
        AF["Admin Frontend :81"]
        AB["Admin Backend :3002"]
        RAG["RAG Upload :8001"]
    end

    subgraph dataLayer [Data Layer]
        K["Kong :8000"]
        PG[("PostgreSQL + pgvector")]
        M[("MongoDB")]
        R[("Redis")]
    end

    O["Ollama :11434"]

    UF --> UB
    UB -->|BullMQ| AI
    AI -->|webhook| UB
    UB -->|WebSocket| UF

    AF --> AB
    AB --> RAG

    UB --> M
    UB --> R
    AI --> K
    AB --> K
    RAG --> K
    K --> PG

    AI --> O
    RAG --> O
```

| โมดูล | โฟลเดอร์ | หน้าที่ |
|---|---|---|
| User Services | `latta-csbot-user-v1/` | หน้าแชทสำหรับผู้ใช้ทั่วไป, backend จัดการสนทนา, AI Agent ประมวลผลคำตอบ |
| Admin Services | `latta-csbot-admin/` | Dashboard สำหรับผู้ดูแล, backend จัดการข้อมูล, RAG upload อัปโหลดเอกสาร |
| Data Platform | `latta-csbot-database/` | Supabase stack (PostgreSQL + Kong + Auth + Storage), MongoDB, Redis |
| LLM Runtime | Ollama (service ใน compose) | รัน AI model สำหรับ chat, embedding, tagging, vision |

---

## แต่ละ Service ทำอะไร

**User Frontend** (port 80) -- หน้าเว็บแชทที่ผู้ใช้เห็น สร้างจาก HTML + Bootstrap + Vanilla JS เสิร์ฟผ่าน nginx ซึ่งทำหน้าที่เป็น reverse proxy ส่ง API request ไปหา User Backend โดยตรง

**User Backend** (port 3001) -- Express API ที่รับข้อความจากหน้าเว็บ บันทึกประวัติลง MongoDB ส่งงานเข้าคิว BullMQ ให้ AI Agent ประมวลผล และเมื่อได้คำตอบกลับมาทาง webhook จะ push ไปหาผู้ใช้ผ่าน WebSocket

**AI Agent** (port 8765) -- หัวใจของระบบ AI รับงานจาก BullMQ แล้วทำ 3 ขั้นตอน: ดึงเอกสารที่เกี่ยวข้องจาก pgvector (RAG), ประกอบ prompt ส่งให้ Ollama สร้างคำตอบ, แล้วส่งคำตอบกลับ User Backend ผ่าน webhook

**Admin Frontend** (port 81) -- Angular SPA สำหรับผู้ดูแลระบบ ใช้ดู dashboard สถิติ จัดการเอกสาร และอัปโหลดไฟล์

**Admin Backend** (port 3002) -- Express API สำหรับ Admin Frontend เชื่อมต่อ PostgreSQL ผ่าน Kong และ forward งานอัปโหลดไปยัง RAG Upload

**RAG Upload** (port 8001) -- Python FastAPI service ที่รับไฟล์ (PDF, DOCX, XLSX) แปลงเป็นข้อความ ตัดเป็น chunk สร้าง embedding vector แล้วเก็บลง PostgreSQL (pgvector) เพื่อให้ AI Agent ค้นหาได้

**PostgreSQL + pgvector** (port 5432) -- ฐานข้อมูลหลักเก็บข้อมูลผู้ใช้ เอกสาร และ embedding vector สำหรับ similarity search

**MongoDB** (port 27017) -- เก็บประวัติสนทนาและ session log

**Redis** (port 6379) -- ใช้เป็นทั้ง cache, session store และ message queue (BullMQ) สำหรับส่งงานระหว่าง User Backend กับ AI Agent

**Kong** (port 8000) -- API Gateway ของ Supabase ใช้สำหรับการเชื่อมต่อจาก backend ไปยัง PostgreSQL เท่านั้น (frontend ไม่ผ่าน Kong)

**Ollama** (port 11434) -- LLM inference server รัน AI model ทุกตัวในระบบ ทั้ง chat, embedding, tagging และ vision

---

## เส้นทางข้อมูล (Chat Flow)

```mermaid
sequenceDiagram
    participant U as User Browser
    participant UB as User Backend
    participant Q as BullMQ / Redis
    participant AI as AI Agent
    participant DB as pgvector
    participant LLM as Ollama

    U->>UB: POST /webhook/send
    UB->>UB: บันทึกลง MongoDB
    UB->>Q: ส่งงานเข้าคิว
    Q->>AI: Worker หยิบงาน
    AI->>DB: ค้นหาเอกสารที่เกี่ยวข้อง (RAG)
    AI->>LLM: ส่ง prompt + context
    LLM-->>AI: คำตอบ (structured JSON)
    AI->>UB: POST /webhook/receive_reply
    UB-->>U: WebSocket push
```

1. **ผู้ใช้ส่งข้อความ** → `POST /webhook/send` ไปที่ User Backend
2. **User Backend บันทึก + ส่งคิว** → เก็บประวัติลง MongoDB แล้วส่งงานเข้า BullMQ (Redis) เพื่อให้ AI ประมวลผลแบบ async โดยไม่ block การตอบ HTTP
3. **AI Agent ดึงบริบท + สร้างคำตอบ** → ค้นเอกสารจาก pgvector (RAG) ได้สูงสุด 15 ชิ้น แล้วประกอบ prompt ส่ง Ollama ให้สร้างคำตอบเป็น structured JSON
4. **AI Agent ส่งคำตอบกลับ** → `POST /webhook/receive_reply` กลับไปที่ User Backend ผ่าน HTTP webhook
5. **User Backend push ให้ผู้ใช้** → ส่งคำตอบผ่าน WebSocket แบบ real-time

ทำไมออกแบบแบบนี้: ใช้ async queue เพราะ LLM ใช้เวลาคิดนาน (2-30 วินาที) ถ้ารอแบบ synchronous จะ timeout, ใช้ webhook กลับเพราะ AI Agent อาจทำงานหลาย worker พร้อมกัน, ใช้ WebSocket เพื่อให้ผู้ใช้ได้รับคำตอบทันทีโดยไม่ต้อง polling

---

## AI Model Configuration

ระบบใช้ Ollama รัน AI model 4 บทบาท แต่ละบทบาทมีความต้องการต่างกัน:

| ตัวแปรใน `.env` | บทบาท | ลักษณะงาน | ความต้องการ context |
|---|---|---|---|
| `OLLAMA_CHAT_MODEL` | ตอบแชท | รับ system prompt ยาว + RAG 15 เอกสาร + ประวัติสนทนา + JSON schema → สร้างคำตอบ | สูงมาก (>= 60,000 tokens) |
| `OLLAMA_EMBED_MODEL` | สร้าง vector | แปลงข้อความสั้นเป็น embedding vector สำหรับค้นหา | ต่ำ |
| `OLLAMA_TAGGING_MODEL` | จัดหมวดหมู่ | วิเคราะห์เนื้อหาเอกสารสั้น ๆ เพื่อติด tag | ต่ำ |
| `OLLAMA_VISION_MODEL` | อ่านรูปภาพ | วิเคราะห์รูปในเอกสาร เช่น ตาราง แผนผัง | ต่ำ |

### ทำไม Chat Model ต้อง context ใหญ่

โค้ดใน `ai_service.js` ตั้งค่า `numCtx: 60000` เพราะทุกครั้งที่ตอบแชท prompt ประกอบจาก 4 ส่วน:

| ส่วนของ prompt | ขนาดโดยประมาณ |
|---|---|
| System prompt (กฎ, ตัวอย่าง, รูปแบบ JSON) | ~2,000-3,000 tokens |
| RAG context (15 เอกสารที่เกี่ยวข้อง) | ~5,000-20,000 tokens |
| ประวัติสนทนาของ session | สะสมเพิ่มทุกข้อความ |
| JSON schema instructions | ~500-1,000 tokens |

รวมแล้วอาจถึง 30,000-60,000 tokens ต่อ request

### ทำไม `gemma3:4b-cloud` ใช้เป็น Chat Model ไม่ได้

`gemma3:4b-cloud` เป็นโมเดลขนาด 4B parameters ที่มี context window เล็ก (~8K-32K tokens) เมื่อ prompt รวมแล้วเกินขีดจำกัด จะได้ error ทันที:

```
"prompt too long; exceeded max context length by 2922 tokens"
```

และยิ่งสนทนาต่อ history จะยาวขึ้น error จะรุนแรงขึ้น:

```
"prompt too long; exceeded max context length by 18930 tokens"
```

แต่ `gemma3:4b-cloud` **ใช้เป็น Tagging/Vision ได้ปกติ** เพราะงานเหล่านั้น prompt สั้นมาก ไม่มี RAG context ไม่มี chat history

### โมเดลที่ใช้เป็น Chat Model ได้

โมเดลเหล่านี้มี context window >= 60,000 tokens, เก่ง structured JSON output, และรองรับภาษาไทย:

| โมเดล | ขนาด | จุดเด่น |
|---|---|---|
| `gpt-oss:20b-cloud` | 20B | context ใหญ่พอ, เก่ง JSON, สมดุลระหว่างความเร็วกับความแม่นยำ |
| `qwen3-next:80b-cloud` | 80B | แม่นยำที่สุด, เก่งภาษาไทยมาก แต่ช้ากว่าและใช้ทรัพยากรสูง |
| `deepseek-v3.5:14b` | 14B | context >= 64K, ดีกับ code/JSON, ตอบเร็ว |
| `nemotron-3-nano:30b-cloud` | 30B | เก่งในการทำตามคำสั่งซับซ้อน |
| `ministral-3:3b-cloud` | 3B | เบาที่สุด, cloud version มี context พอสำหรับงานนี้ |

### ตั้งค่าใน `.env`

```env
OLLAMA_CHAT_MODEL=gpt-oss:20b-cloud        # ต้อง context >= 60K
OLLAMA_EMBED_MODEL=qwen3-embedding:0.6b     # สร้าง vector 1024 มิติ
OLLAMA_TAGGING_MODEL=gemma3:4b-cloud        # งานสั้น ใช้โมเดลเล็กได้
OLLAMA_VISION_MODEL=gemma3:4b-cloud         # อ่านรูป ใช้โมเดลเล็กได้
```

---

## Tech Stack

| Layer | เทคโนโลยี | เหตุผล |
|---|---|---|
| User Frontend | HTML + Bootstrap + Vanilla JS + nginx | เบา โหลดเร็ว ไม่ต้อง build framework |
| Admin Frontend | Angular | SPA ที่เหมาะกับ dashboard ซับซ้อน |
| Backend | Node.js + Express | ecosystem ใหญ่, async I/O ดี, ทีมคุ้นเคย |
| AI / RAG Pipeline | Python + FastAPI | library ML/NLP พร้อมใช้ (LangChain, Docling, PyMuPDF) |
| LLM Runtime | Ollama | รัน model ใน local ได้, รองรับ GPU, API เรียบง่าย |
| Queue / Cache | Redis + BullMQ | queue ที่เสถียร, รองรับ retry และ concurrency |
| Vector Database | PostgreSQL + pgvector | similarity search ในตัว ไม่ต้องเพิ่ม service |
| Document Database | MongoDB | schema ยืดหยุ่นสำหรับ chat history ที่โครงสร้างไม่แน่นอน |
| API Gateway | Kong | มาพร้อม Supabase, จัดการ auth และ routing |
| Container | Docker + Docker Compose | ทุก service รันเหมือนกันทุกเครื่อง |

---

## Ports

| Service | Port | หมายเหตุ |
|---|---|---|
| User Frontend | 80 | nginx reverse proxy |
| User Backend | 3001 | Express API + WebSocket |
| AI Agent | 8765 | รับงานจาก BullMQ |
| Admin Frontend | 81 | Angular via nginx |
| Admin Backend | 3002 | Express API |
| RAG Upload API | 8001 | FastAPI |
| Kong (Supabase API) | 8000 | backend ↔ PostgreSQL |
| Supabase Studio | 3000 | UI จัดการฐานข้อมูล |
| PostgreSQL | 5432 | |
| MongoDB | 27017 | |
| Redis | 6379 | |
| Redis Insight | 8002 | UI จัดการ Redis |
| Ollama | 11434 | LLM inference |

---

## Quick Start

```bash
# 1. สร้าง .env จากตัวอย่าง
cp .env.example .env

# 2. แก้ค่า secrets ให้ตรงกันทั้งระบบ
#    POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
#    REDIS_PASSWORD, MONGO_ROOT_PASSWORD

# 3. รันทั้งระบบ (compose จะสร้าง network และ volume ให้อัตโนมัติ)
docker compose up -d

# 4. ตรวจสถานะ (ทุก service ต้องเป็น healthy)
docker compose ps
```

หลังรันเสร็จ:
- เปิดหน้าแชท: `http://localhost`
- เปิด Admin: `http://localhost:81`
- เปิด Supabase Studio: `http://localhost:3000`

---

## Environment Variables สำคัญ

### Secrets (ต้องตรงกันทั้งระบบ)

```env
POSTGRES_PASSWORD=...          # รหัสผ่าน PostgreSQL
JWT_SECRET=...                 # ใช้ sign JWT token ของ Supabase
ANON_KEY=...                   # public key สำหรับ Supabase client
SERVICE_ROLE_KEY=...           # key สิทธิ์สูงสำหรับ backend → Supabase
MONGO_ROOT_PASSWORD=...        # รหัสผ่าน MongoDB
REDIS_PASSWORD=...             # รหัสผ่าน Redis
```

### การเชื่อมต่อระหว่าง container

```env
API_BASE=http://user-backend:3001                              # AI Agent → User Backend
REPLY_WEBHOOK_URL=http://user-backend:3001/webhook/receive_reply  # webhook ส่งคำตอบกลับ
SUPABASE_URL=http://kong:8000                                  # backend → Supabase ผ่าน Kong
```

### Ollama

```env
OLLAMA_BASE_URL=http://ollama:11434    # URL ของ Ollama server
OLLAMA_CHAT_MODEL=gpt-oss:20b-cloud   # โมเดลตอบแชท (ต้อง context >= 60K)
OLLAMA_EMBED_MODEL=qwen3-embedding:0.6b  # โมเดลสร้าง embedding vector
OLLAMA_TAGGING_MODEL=gemma3:4b-cloud  # โมเดลจัดหมวดหมู่เอกสาร
OLLAMA_VISION_MODEL=gemma3:4b-cloud   # โมเดลอ่านรูปภาพ
OLLAMA_TIMEOUT_MS=300000               # timeout 5 นาที (LLM อาจตอบช้า)
```

---

## คำสั่งที่ใช้บ่อย

```bash
docker compose up -d              # เปิดทั้งหมด
docker compose down               # ปิดทั้งหมด
docker compose logs -f ai-agent   # ดู log เฉพาะ service

# rebuild เฉพาะ service
docker compose build --no-cache user-backend
docker compose up -d user-backend
```

---

## โครงสร้างโฟลเดอร์

```
.
├── docker-compose.yml          # compose หลัก
├── docker-compose.dev.yml      # override สำหรับ dev
├── .env.example                # ตัวอย่าง environment
├── latta-csbot-user-v1/        # User frontend + backend + AI agent
├── latta-csbot-admin/          # Admin frontend + backend + RAG upload
├── latta-csbot-database/       # Supabase stack + MongoDB
├── sa.md                       # System Analysis
├── sd.md                       # System Design
└── ARCHITECTURE.md             # Architecture เชิงลึก
```

---

## Troubleshooting

**nginx: host not found in upstream**
→ ตรวจว่า `nginx.conf` ใช้ชื่อ service ตรงกับ compose เช่น `user-backend:3001`

**Subflow ไม่ตอบกลับหน้าแชท**
→ ตรวจ `.env` ว่า `API_BASE=http://user-backend:3001`

**prompt too long; exceeded max context length**
→ โมเดลที่ตั้งเป็น `OLLAMA_CHAT_MODEL` มี context window เล็กเกินไป เปลี่ยนเป็นโมเดลที่รองรับ >= 60K tokens (ดูตารางในหัวข้อ AI Model Configuration)

**Port ชนกัน**
→ แก้ค่า port ใน `.env` แล้วรัน `docker compose down && docker compose up -d`

**Kong resolve ไม่ได้**
→ ตรวจว่า service อยู่ใน network `latta-database-network`

**Database connection refused**
→ รอ healthcheck ผ่านก่อน และตรวจ credentials ให้ตรงกัน

---

## Backup

```bash
# PostgreSQL
docker exec latta-supabase-db pg_dump -U postgres postgres > backup.sql

# MongoDB
docker exec latta-mongodb mongodump --out /backup

# Redis
docker exec latta-redis redis-cli BGSAVE
```

---

## เอกสารอ้างอิง

- [System Analysis](sa.md) -- วิเคราะห์ความต้องการระบบ
- [System Design](sd.md) -- ออกแบบระบบเชิงเทคนิค
- [Architecture](ARCHITECTURE.md) -- สถาปัตยกรรมเชิงลึก พร้อม sequence diagram

---

MIT License
