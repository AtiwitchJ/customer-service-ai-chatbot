# Latta CS-BOT - Complete System Architecture

## ภาพรวมระบบทั้งหมด (Complete System Overview)

ระบบ Latta CS-BOT แบ่งออกเป็น 4 โปรเจคหลักที่ทำงานร่วมกัน:

| โปรเจค | หน้าที่ | พอร์ตหลัก |
|--------|---------|----------|
| **latta-csbot-database** | ฐานข้อมูลกลาง (Supabase, MongoDB, Redis) | 5432, 27017, 6379 |
| **latta-csbot-llm** | LLM Service (Ollama) | 11434 |
| **latta-csbot-user-v1** | User Chat Services (Frontend + Backend + AI Agent) | 80, 3001, 8765 |
| **latta-csbot-admin** | Admin Panel + RAG Pipeline | 81, 3002, 8001 |

---

## System Architecture Diagram (Mermaid)

```mermaid
flowchart TB
    subgraph Client["🖥️ Client Layer"]
        User["User Browser"]
        Admin["Admin Browser"]
    end

    subgraph Network["🌐 Network Layer"]
        NginxUser["Nginx (User)"]
        NginxAdmin["Nginx (Admin)"]
    end

    subgraph UserServices["👤 latta-csbot-user-v1"]
        subgraph ChatService["Chat Service"]
            UserFrontend["Frontend<br/>(Port 80)"]
            UserBackend["Backend API<br/>(Port 3001)"]
            AuthRouter["/auth/*"]
            ChatRouter["/webhook/*"]
        end
        
        subgraph AIAgent["AI Agent Service"]
            AgentServer["Agent Server<br/>(Port 8765)"]
            AgentWorker["BullMQ Worker"]
            SubWorker["Sub-Workflow Worker"]
        end
    end

    subgraph AdminServices["⚙️ latta-csbot-admin"]
        subgraph AdminPanel["Admin Panel"]
            AdminFrontend["Angular Frontend<br/>(Port 81)"]
            AdminBackend["Node.js Backend<br/>(Port 3002)"]
            DashboardSvc["Dashboard Service"]
            ChatSvc["Chat Service"]
            RAGSvc["RAG Service"]
        end
        
        subgraph MultimodalRAG["Multimodal RAG"]
            RAGUpload["RAG Upload API<br/>(Port 8001)"]
            DocProcessor["Document Processor"]
            VisionModel["Vision Model"]
        end
    end

    subgraph DatabaseLayer["🗄️ latta-csbot-database"]
        subgraph Supabase["Supabase Stack"]
            PostgreSQL[("PostgreSQL<br/>(Port 5432)")]
            Kong["Kong API Gateway"]
            Auth["GoTrue Auth"]
            Storage["Storage API"]
            Vector["pgvector Extension"]
        end
        
        MongoDB[("MongoDB<br/>(Port 27017)")]
        Redis[("Redis<br/>(Port 6379)")]
    end

    subgraph LLMService["🤖 latta-csbot-llm"]
        Ollama["Ollama Server<br/>(Port 11434)"]
        ChatModel["Chat Model<br/>(qwen2.5)"]
        EmbedModel["Embedding Model"]
    end

    subgraph External["🔗 External Services"]
        ExternalAuth["External Auth API"]
        MSForm["Microsoft Forms"]
    end

    %% Client Connections
    User -->|"HTTP/WebSocket"| NginxUser
    Admin -->|"HTTP"| NginxAdmin

    %% User Service Connections
    NginxUser --> UserFrontend
    UserFrontend -->|"API Calls"| UserBackend
    UserBackend --> AuthRouter
    UserBackend --> ChatRouter
    
    ChatRouter -->|"Queue"| AgentWorker
    AgentWorker -->|"Process"| AgentServer
    AgentServer -->|"Sub-tasks"| SubWorker
    
    %% Admin Service Connections
    NginxAdmin --> AdminFrontend
    AdminFrontend -->|"API"| AdminBackend
    AdminBackend --> DashboardSvc
    AdminBackend --> ChatSvc
    AdminBackend --> RAGSvc
    
    RAGSvc -->|"Upload"| RAGUpload
    RAGUpload --> DocProcessor
    DocProcessor --> VisionModel

    %% Database Connections
    UserBackend -->|"Chat History"| MongoDB
    UserBackend -->|"Cache/Queue"| Redis
    AgentServer -->|"Vector Search"| PostgreSQL
    RAGSvc -->|"Knowledge Base"| PostgreSQL
    
    %% LLM Connections
    AgentServer -->|"Generate"| Ollama
    RAGUpload -->|"Embeddings"| Ollama
    Ollama --> ChatModel
    Ollama --> EmbedModel

    %% External Connections
    AuthRouter -->|"Verify"| ExternalAuth
    SubWorker -->|"Submit"| MSForm

    %% Styling
    classDef client fill:#e1f5fe
    classDef network fill:#fff3e0
    classDef user fill:#e8f5e9
    classDef admin fill:#fce4ec
    classDef database fill:#f3e5f5
    classDef llm fill:#fff8e1
    classDef external fill:#ffebee

    class User,Admin client
    class NginxUser,NginxAdmin network
    class UserFrontend,UserBackend,AgentServer,AgentWorker,SubWorker,AuthRouter,ChatRouter user
    class AdminFrontend,AdminBackend,DashboardSvc,ChatSvc,RAGSvc,RAGUpload,DocProcessor,VisionModel admin
    class PostgreSQL,MongoDB,Redis,Kong,Auth,Storage,Vector database
    class Ollama,ChatModel,EmbedModel llm
    class ExternalAuth,MSForm external
```

---

## Data Flow Diagrams

### 1. User Authentication Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant F as Frontend
    participant B as User Backend
    participant R as Redis
    participant EA as External Auth

    U->>F: 1. Enter CardID + Email
    F->>B: 2. POST /auth/login
    
    alt BYPASS_MODE = true
        B->>R: 3a. Save mock user data
        B->>F: 4a. Return success (mock)
    else Normal Mode
        B->>R: 3b. Check blockedUntil
        R-->>B: Return status
        
        alt Not Blocked
            B->>EA: 4b. Verify CardID + Email
            EA-->>B: Return user data
            
            alt Auth Success
                B->>R: 5b. Save verified:{sessionId}
                B->>F: 6b. Return success
            else Auth Fail
                B->>R: 5c. Increment limit
                alt limit >= 5
                    B->>R: 6c. Set blockedUntil
                end
                B->>F: 7c. Return fail
            end
        else Blocked
            B->>F: Return blocked message
        end
    end
    
    F->>U: Show result
```

### 2. Chat Message Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant F as Frontend
    participant UB as User Backend
    participant M as MongoDB
    participant R as Redis
    participant BQ as BullMQ
    participant AW as AI Worker
    participant AS as Agent Server
    participant SUP as Supabase
    participant OLL as Ollama

    U->>F: 1. Type message
    F->>UB: 2. POST /webhook/send
    
    UB->>BQ: 3. Add to queue
    UB->>M: 4. Save to MongoDB
    UB->>R: 5. Cache in Redis
    UB->>F: 6. Return accepted
    
    par Async Processing
        BQ->>AW: 7. Process message
        AW->>AS: 8. Call /agent
        
        AS->>R: 9. Get chat history
        AS->>SUP: 10. Search RAG
        SUP-->>AS: Return context
        
        AS->>OLL: 11. Generate response
        OLL-->>AS: Return AI response
        
        AS->>UB: 12. POST /webhook/receive_reply
        UB->>M: 13. Save bot message
        UB->>R: 14. Update cache
        UB->>F: 15. WebSocket broadcast
    end
    
    F->>U: 16. Display response
```

### 3. AI Agent Workflow

```mermaid
flowchart TD
    A[User Message] --> B{Fast Track?}
    
    B -->|Yes - Reset Password| C[Reset Password Flow]
    B -->|Yes - MS Form| D[MS Form Flow]
    B -->|No| E[RAG Search]
    
    E --> F[Supabase Vector Search]
    F --> G[Get Context + Images]
    
    G --> H[Build System Prompt]
    H --> I[Call Ollama LLM]
    
    I --> J{Valid Response?}
    J -->|Yes| K[Parse Structured Output]
    J -->|No| L[Fallback Message]
    
    K --> M{Has Action?}
    M -->|Yes| N[Publish to Sub-Queue]
    M -->|No| O[Send Reply]
    N --> O
    L --> O
    
    O --> P[POST /webhook/receive_reply]
    P --> Q[Save to Redis]
    P --> R[Save to MongoDB]
    P --> S[WebSocket Broadcast]
    
    C --> O
    D --> O
```

### 4. RAG Document Upload Flow

```mermaid
sequenceDiagram
    autonumber
    participant A as Admin
    participant AF as Admin Frontend
    participant AB as Admin Backend
    participant RAG as RAG Upload API
    participant DP as Doc Processor
    participant VM as Vision Model
    participant OLL as Ollama
    participant SUP as Supabase
    participant S3 as Storage

    A->>AF: 1. Upload document
    AF->>AB: 2. POST /api/rag/upload
    AB->>RAG: 3. Forward to RAG service
    
    RAG->>DP: 4. Process document
    
    alt Has Images
        DP->>VM: 5a. Extract image descriptions
        VM->>OLL: 6a. Generate captions
        OLL-->>VM: Return descriptions
    end
    
    DP->>DP: 7. Chunk text
    DP->>OLL: 8. Generate embeddings
    OLL-->>DP: Return vectors
    
    DP->>SUP: 9. Store vectors in pgvector
    DP->>S3: 10. Store images
    
    RAG-->>AB: 11. Return success
    AB-->>AF: 12. Show confirmation
    AF->>A: 13. Upload complete
```

### 5. Admin Dashboard Data Flow

```mermaid
flowchart LR
    subgraph Import["Data Import"]
        MongoExport[MongoDB Export]
        Convert[convert-mongodb-chats.js]
        ImportSessions[import-sessions.js]
        JSONData[JSON Files]
    end
    
    subgraph Storage["Data Storage"]
        Sessions[/sessions/*.json/]
        Index[/sessions_index.json/]
    end
    
    subgraph Services["Admin Services"]
        Dashboard[Dashboard Service]
        Chat[Chat Service]
        Analytics[Analytics Service]
    end
    
    subgraph UI["Admin UI"]
        ChatsPage[Chats Page]
        StatsPage[Statistics Page]
        Upload[Upload JSON]
    end
    
    MongoExport --> Convert
    Convert --> ImportSessions
    ImportSessions --> JSONData
    JSONData --> Sessions
    JSONData --> Index
    
    Sessions --> Dashboard
    Sessions --> Chat
    Index --> Analytics
    
    Dashboard --> StatsPage
    Chat --> ChatsPage
    Upload --> Convert
```

---

## Component Architecture

### latta-csbot-user-v1 Components

```mermaid
graph TB
    subgraph Frontend["Frontend (Vanilla JS)"]
        UI[index.html]
        Style[style.css]
        Logic[script.js]
        
        subgraph Features["Features"]
            ChatUI[Chat Interface]
            AuthUI[Login Form]
            WSClient[WebSocket Client]
            AFK[AFK Detection]
        end
    end
    
    subgraph Backend["Backend (Express.js)"]
        Server[server.js]
        
        subgraph Routes["Routes"]
            Auth[authRouter.js]
            Chat[chatRouter.js]
        end
        
        subgraph Services["Services"]
            AuthSvc[authService.js]
            ChatSvc[chatService.js]
        end
        
        subgraph Models["Models"]
            ChatModel[ChatModel.js]
        end
        
        subgraph Middleware["Middleware"]
            RateLimit[rateLimit.js]
            InputVal[inputValidator.js]
            Session[sessionMiddleware.js]
        end
    end
    
    subgraph AIAgent["AI Agent"]
        AgentMain[ai-agent-mainflow.js]
        Worker[bullmq-worker.js]
        SubWorker[bullmq-subflow-worker.js]
    end
    
    subgraph AgentServices["Agent Services"]
        Workflow[workflow_service.js]
        AISvc[ai_service.js]
        RAG[supabase_service.js]
        RedisSvc[redis_service.js]
        Webhook[webhook_service.js]
    end
    
    UI --> Logic
    Logic --> ChatUI
    Logic --> AuthUI
    Logic --> WSClient
    Logic --> AFK
    
    Server --> Routes
    Routes --> Services
    Services --> Models
    Server --> Middleware
    
    AgentMain --> Workflow
    Workflow --> AISvc
    Workflow --> RAG
    Workflow --> RedisSvc
    Workflow --> Webhook
    Worker --> Workflow
    SubWorker --> Workflow
```

### latta-csbot-admin Components

```mermaid
graph TB
    subgraph AdminFrontend["Admin Frontend (Angular)"]
        App[App Component]
        
        subgraph Pages["Pages"]
            Overview[Overview]
            Chats[Chats]
            Upload[Upload]
            Analytics[Analytics]
        end
        
        subgraph Shared["Shared"]
            Nav[Navigation]
            Charts[Charts]
            Tables[Data Tables]
        end
    end
    
    subgraph AdminBackend["Admin Backend (Node.js)"]
        Server[server_combined.js]
        
        subgraph AdminServices["Services"]
            Dashboard[Dashboard Service]
            Chat[Chat Service]
            RAG[RAG Service]
        end
        
        subgraph Controllers["Controllers"]
            UploadCtrl[uploadController.js]
            ChatCtrl[chatController.js]
            StatsCtrl[statsController.js]
        end
        
        subgraph Models["Models"]
            JsonChat[JsonChatModel.js]
        end
        
        subgraph Utils["Utils"]
            JsonStore[jsonDataStore.js]
            Analytics[analyticsService.js]
        end
    end
    
    subgraph RAGPipeline["Multimodal RAG (Python)"]
        API[FastAPI Server]
        
        subgraph Pipeline["Pipeline"]
            OCR[OCR Processor]
            Chunk[Text Chunker]
            Embed[Embedding Generator]
            Vision[Vision Analyzer]
        end
        
        subgraph Storage["Storage"]
            VectorDB[(pgvector)]
            ImageStore[(S3/Local)]
        end
    end
    
    App --> Pages
    Pages --> Shared
    
    Server --> AdminServices
    AdminServices --> Controllers
    Controllers --> Models
    Models --> Utils
    
    API --> Pipeline
    Pipeline --> Storage
```

### latta-csbot-database Components

```mermaid
graph TB
    subgraph Supabase["Supabase Stack"]
        Kong[Kong API Gateway]
        Auth[GoTrue Auth]
        Rest[PostgREST]
        Realtime[Realtime]
        Storage[Storage API]
        
        subgraph Database["PostgreSQL"]
            Postgres[(PostgreSQL 15)]
            Vector[pgvector Extension]
            
            subgraph Schemas["Schemas"]
                Public[public]
                Auth[auth]
                Storage[storage]
            end
        end
        
        Studio[Supabase Studio]
    end
    
    subgraph DocumentDB["Document Database"]
        MongoDB[(MongoDB)]
        
        subgraph Collections["Collections"]
            Chats[chats]
            Sessions[sessions]
        end
    end
    
    subgraph Cache["Cache & Queue"]
        Redis[(Redis Stack)]
        
        subgraph RedisDBs["Databases"]
            DB0[DB 0: Chat Cache]
            DB1[DB 1: Auth]
            DB2[DB 2: Queue]
            DB3[DB 3: Session]
        end
    end
    
    Kong --> Auth
    Kong --> Rest
    Kong --> Realtime
    Kong --> Storage
    
    Rest --> Postgres
    Auth --> Postgres
    Storage --> Postgres
    
    Postgres --> Vector
    Postgres --> Schemas
    
    Redis --> RedisDBs
```

---

## Network Architecture

```mermaid
graph TB
    subgraph DockerNetworks["Docker Networks"]
        subgraph DatabaseNet["latta-database-network"]
            direction TB
            DB1[Supabase]
            DB2[MongoDB]
            DB3[Redis]
        end
        
        subgraph UserNet["latta_v1-network"]
            direction TB
            U1[User Frontend]
            U2[User Backend]
            U3[AI Agent]
        end
        
        subgraph AdminNet["latta-admin-network"]
            direction TB
            A1[Admin Frontend]
            A2[Admin Backend]
            A3[RAG Upload]
        end
        
        subgraph LLMNet["latta-llm-network"]
            direction TB
            L1[Ollama]
        end
    end
    
    subgraph ExternalNet["External"]
        EXT1[External Auth API]
        EXT2[Microsoft Forms]
    end
    
    %% Cross-network connections
    U2 -->|Read/Write| DB2
    U2 -->|Cache/Queue| DB3
    U3 -->|Vector Search| DB1
    
    A2 -->|Read| DB1
    A3 -->|Embeddings| DB1
    
    U3 -->|Generate| L1
    A3 -->|Embeddings| L1
    
    U2 -->|Verify| EXT1
    U3 -->|Submit| EXT2
    
    %% Styling
    classDef db fill:#f3e5f5
    classDef user fill:#e8f5e9
    classDef admin fill:#fce4ec
    classDef llm fill:#fff8e1
    classDef ext fill:#ffebee
    
    class DB1,DB2,DB3 db
    class U1,U2,U3 user
    class A1,A2,A3 admin
    class L1 llm
    class EXT1,EXT2 ext
```

---

## API Integration Map

```mermaid
flowchart LR
    subgraph UserAPIs["User Service APIs"]
        U1[GET /config]
        U2[POST /auth/login]
        U3[POST /auth/check-status]
        U4[POST /webhook/send]
        U5[POST /webhook/receive_reply]
        U6[GET /chat/history]
        U7[POST /chat/feedback]
        U8[WS /]
    end
    
    subgraph AgentAPIs["AI Agent APIs"]
        A1[GET /health]
        A2[POST /agent]
    end
    
    subgraph AdminAPIs["Admin APIs"]
        B1[GET /api/overview]
        B2[GET /api/chats]
        B3[POST /api/dashboard/upload]
        B4[GET /api/dashboard/stats]
        B5[GET /api/rag/search]
        B6[POST /api/rag/upload]
    end
    
    subgraph DatabaseAPIs["Database APIs"]
        D1[Kong:8000]
        D2[MongoDB:27017]
        D3[Redis:6379]
    end
    
    subgraph LLMAPIs["LLM APIs"]
        L1[Ollama:11434/api/generate]
        L2[Ollama:11434/api/embeddings]
    end
    
    %% Connections
    U4 --> A2
    A2 --> U5
    U2 -.->|External| EXT
    
    B6 --> RAG
    RAG --> L2
    A2 --> L1
    A2 --> D1
```

---

## Deployment Architecture

```mermaid
graph TB
    subgraph Production["Production Environment"]
        subgraph DockerHost["Docker Host"]
            subgraph ComposeDB["docker-compose.yml<br/>latta-csbot-database"]
                DB_SERVICES[Supabase + MongoDB + Redis]
            end
            
            subgraph ComposeLLM["docker-compose.yml<br/>latta-csbot-llm"]
                LLM_SERVICE[Ollama]
            end
            
            subgraph ComposeUser["docker-compose.yml<br/>latta-csbot-user-v1"]
                USER_SERVICES[Frontend + Backend + AI Agent]
            end
            
            subgraph ComposeAdmin["docker-compose.yml<br/>latta-csbot-admin"]
                ADMIN_SERVICES[Admin Panel + RAG]
            end
        end
        
        subgraph Volumes["Persistent Volumes"]
            V1[postgres_data]
            V2[mongo_data]
            V3[redis_data]
            V4[ollama_data]
            V5[admin-json-data]
        end
        
        subgraph Networks["Docker Networks"]
            N1[latta-database-network]
            N2[latta_v1-network]
            N3[latta-admin-network]
            N4[latta-llm-network]
        end
    end
    
    DB_SERVICES --> V1
    DB_SERVICES --> V2
    DB_SERVICES --> V3
    LLM_SERVICE --> V4
    ADMIN_SERVICES --> V5
    
    DB_SERVICES --> N1
    USER_SERVICES --> N2
    ADMIN_SERVICES --> N3
    LLM_SERVICE --> N4
    
    USER_SERVICES -.->|Connect| N1
    ADMIN_SERVICES -.->|Connect| N1
```

---

## Environment Variable Dependencies

```mermaid
flowchart TB
    subgraph EnvDB["latta-csbot-database .env"]
        POSTGRES[POSTGRES_PASSWORD]
        JWT[JWT_SECRET]
        ANON[ANON_KEY]
        SERVICE[SERVICE_ROLE_KEY]
        MONGO_USER[MONGO_ROOT_USER]
        MONGO_PASS[MONGO_ROOT_PASSWORD]
    end
    
    subgraph EnvUser["latta-csbot-user-v1 .env"]
        U_MONGO["MONGO_URL<br/>(uses MONGO_ROOT_*)"]
        U_SUPABASE["SUPABASE_URL<br/>(uses ANON_KEY)"]
        U_REDIS["REDIS_HOST/PORT<br/>REDIS_PASSWORD"]
        U_EXTERNAL["EXTERNAL_AUTH_API"]
    end
    
    subgraph EnvAdmin["latta-csbot-admin .env"]
        A_SUPABASE["SUPABASE_URL<br/>(uses SERVICE_ROLE_KEY)"]
        A_OLLAMA["OLLAMA_BASE_URL"]
    end
    
    subgraph EnvLLM["latta-csbot-llm .env"]
        L_PORT["OLLAMA_PORT"]
    end
    
    MONGO_USER --> U_MONGO
    MONGO_PASS --> U_MONGO
    ANON --> U_SUPABASE
    
    SERVICE --> A_SUPABASE
    POSTGRES --> A_SUPABASE
    
    L_PORT --> A_OLLAMA
    L_PORT --> U_SUPABASE
```

---

## Service Startup Order

```mermaid
graph LR
    %% Level 1: Database
    DB[(latta-csbot-database)]
    
    %% Level 2: LLM
    LLM[Ollama]
    
    %% Level 3: User Services
    UB[User Backend]
    
    %% Level 4: AI Agent
    AS[AI Agent Server]
    AW[AI Agent Worker]
    SW[Sub-Worker]
    
    %% Level 5: User Frontend
    UF[User Frontend]
    
    %% Level 6: Admin Services
    RAG[Multimodal RAG]
    AB[Admin Backend]
    AF[Admin Frontend]
    
    %% Dependencies
    DB --> UB
    DB --> AS
    DB --> RAG
    
    LLM --> AS
    LLM --> RAG
    
    UB --> UF
    UB --> AW
    UB --> SW
    
    AS --> AW
    AS --> SW
    
    RAG --> AB
    AB --> AF
    
    %% Styling
    classDef db fill:#f3e5f5
    classDef llm fill:#fff8e1
    classDef user fill:#e8f5e9
    classDef ai fill:#e3f2fd
    classDef admin fill:#fce4ec
    
    class DB db
    class LLM llm
    class UB,UF user
    class AS,AW,SW ai
    class RAG,AB,AF admin
```

---

## Port Mapping Reference

| Service | Container | Internal Port | External Port | Environment Variable |
|---------|-----------|---------------|---------------|---------------------|
| **Database Layer** |
| Supabase Kong | latta-supabase-kong | 8000 | `${KONG_HTTP_PORT}` | 8000 |
| Supabase Studio | latta-supabase-studio | 3000 | 3000 | - |
| PostgreSQL | latta-supabase-db | 5432 | `${POSTGRES_PORT}` | 5432 |
| MongoDB | latta-mongodb | 27017 | `${MONGO_PORT}` | 27017 |
| Redis | latta-redis | 6379 | `${REDIS_PORT}` | 6379 |
| Redis Insight | - | 8001 | `${REDIS_INSIGHT_PORT}` | 8001 |
| **LLM Layer** |
| Ollama | latta-ollama | 11434 | `${OLLAMA_PORT}` | 11434 |
| **User Services** |
| User Frontend | latta_v1-user-frontend | 80 | `${USER_FRONTEND_PORT}` | 8080 |
| User Backend | latta_v1-user-backend | 3001 | `${USER_BACKEND_PORT}` | 3001 |
| AI Agent Server | latta_v1-ai-agent-server | 8765 | `${AI_AGENT_PORT}` | 8765 |
| **Admin Services** |
| Admin Frontend | latta-admin-frontend | 81 | `${ADMIN_FRONTEND_PORT}` | 81 |
| Admin Backend | latta-admin-backend | 3002 | `${ADMIN_PORT}` | 3002 |
| RAG Upload | latta-multimodal-rag | 8001 | `${RAG_UPLOAD_PORT}` | 8001 |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02 | Initial architecture with 4-project separation |

---

## Authors

- Development Team - Latta CS-BOT Project

## WebSocket: Pros and Cons

### ข้อดี (Pros)

| ข้อดี | รายละเอียด |
|-------|-----------|
| **Real-time** | ส่งข้อความทันทีโดยไม่ต้องรอ request/response |
| **Bidirectional** | สื่อสารสองทิศทางบน connection เดียว |
| **Low Latency** | ไม่ต้องสร้าง connection ใหม่ทุกครั้ง |
| **Efficient** | Header เล็กกว่า HTTP polling |
| **Server Push** | Server ส่งข้อมูลให้ Client ได้โดยตรง |

### ข้อเสีย (Cons)

| ข้อเสีย | รายละเอียด |
|---------|-----------|
| **Complexity** | ต้องจัดการ connection state |
| **Firewall** | บาง firewall บล็อก WebSocket |
| **Proxy Issues** | Nginx/Load balancer ต้อง config พิเศษ |
| **No Caching** | ไม่มี HTTP caching |
| **Debugging** | ยากกว่า HTTP request/response |

### การใช้งานในระบบ

```mermaid
flowchart TB
    subgraph WebSocketFlow["WebSocket Message Flow"]
        A[AI Agent] -->|"POST /webhook/receive_reply"| B[Backend]
        B -->|"ws.send()"| C[WebSocket Server]
        C -->|"Broadcast"| D[Client]
    end
    
    subgraph Alternative["HTTP Polling Alternative"]
        E[Client] -->|"GET /chat/history"| F[Backend]
        F -->|"Query DB"| G[Database]
        G -->|"Return"| F
        F -->|"Response"| E
        E -->|"Every 2 seconds"| F
    end
```

### เปรียบเทียบ

| เกณฑ์ | WebSocket | HTTP Polling | SSE |
|-------|-----------|--------------|-----|
| Latency | ต่ำมาก | สูง (depends on interval) | ต่ำ |
| Server Push | ✅ | ❌ | ✅ |
| Bidirectional | ✅ | ❌ | ❌ |
| Complexity | สูง | ต่ำ | ปานกลาง |
| Browser Support | ดี | ดีมาก | ดี |
| Reconnection | ต้องจัดการเอง | อัตโนมัติ | ต้องจัดการเอง |

### Best Practices

1. **Reconnection Strategy**
```javascript
// Exponential backoff
let reconnectDelay = 1000;
ws.onclose = () => {
    setTimeout(() => connect(), reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
};
```

2. **Heartbeat**
```javascript
// Keep connection alive
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'ping'}));
    }
}, 30000);
```

3. **Graceful Degradation**
```javascript
// Fallback to polling if WebSocket fails
if (!window.WebSocket || wsFailed) {
    startLongPolling();
}
```

---

## License

Internal Use Only
