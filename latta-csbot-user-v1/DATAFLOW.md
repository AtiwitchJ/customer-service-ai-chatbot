# latta-csbot-user-v1 - Data Flow

## Overview

Complete data flows for user authentication, chat messaging, AI processing, and feedback handling.

## Flow Diagrams

### 1. User Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant N as Nginx
    participant B as Backend
    participant R as Redis (DB3)
    participant EA as External Auth

    U->>F: Enter CardID + Email
    F->>N: POST /auth/login
    N->>B: Proxy pass
    
    alt BYPASS_MODE = true
        B->>R: HSET sessionId (verified:true, mock user)
        B->>R: EXPIRE {REDIS_SESSION_TTL}
        B-->>F: Return success
        F-->>U: Show chat interface
    else Normal Mode
        B->>R: HGET sessionId blockedUntil
        
        alt Not Blocked
            B->>EA: POST verify credentials
            
            alt Success
                EA-->>B: User data
                B->>R: HSET sessionId (verified:true, user data)
                B->>R: EXPIRE {REDIS_SESSION_TTL}
                B-->>F: Return user data
                F-->>U: Show chat interface
            else Fail
                B->>R: HINCRBY sessionId limit 1
                
                alt limit >= MAX_LOGIN_ATTEMPTS
                    B->>R: HSET sessionId blockedUntil (now + BLOCK_DURATION_MS)
                end
                
                B-->>F: Return error
                F-->>U: Show error message
            end
        else Blocked
            B-->>F: Return blocked message + remaining time
            F-->>U: Show countdown timer
        end
    end
```

### 2. Chat Message Flow (Complete)

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant N as Nginx
    participant B as Backend
    participant M as MongoDB
    participant R as Redis (DB0)
    participant Q as BullMQ (DB1)
    participant W as AI Worker
    participant A as Agent Server
    participant LLM as Ollama
    participant DB as Supabase

    %% User sends message
    U->>F: Type message
    F->>N: POST /webhook/send
    N->>B: Proxy pass

    %% Backend processing (chatService.handleUserMessage)
    B->>B: Generate msgId
    B->>Q: Add job (AI_AGENT_QUEUE_NAME)
    B->>M: updateOne (upsert)
    B->>R: RPUSH chat_history:{sessionId}
    B->>R: EXPIRE {CHAT_TTL_SECONDS}
    B-->>F: Return accepted

    %% Async AI processing
    Q->>W: Process job (Main Worker)
    W->>A: POST /agent  (AGENT_WEBHOOK_URL)

    %% AI workflow (workflow_service.js)
    A->>R: LRANGE chat_history
    A->>A: Check Fast Track (fasttrack_service)
    
    alt Not Fast Track
        A->>DB: Vector search (RAG)
        DB-->>A: Return context
        A->>A: Build prompt (prompt.js)
        A->>LLM: Generate response (ai_service)
        LLM-->>A: AI response
        A->>A: Validate with Zod (models.js)
    else Fast Track: Reset Password
        A->>Q: Publish to reset_password queue
        A->>A: Generate quick response
    else Fast Track: MS Form
        A->>Q: Publish to ms_form queue
        A->>A: Generate quick response
    end

    %% Send reply
    A->>B: POST /webhook/receive_reply (webhook_service)
    
    %% Backend reply processing (chatService.handleBotReply)
    B->>B: Generate bot msgId
    B->>F: WebSocket broadcast (incl. image_urls)
    B->>M: updateOne (save bot message)
    B->>R: RPUSH chat_history:{sessionId}
    B->>R: EXPIRE {CHAT_TTL_SECONDS}
    F->>U: Display bot response
```

### 3. AI Agent Workflow Detail

```mermaid
flowchart TB
    subgraph Input["Input"]
        A[User Message]
        B[Session ID]
    end
    
    subgraph Processing["Processing (workflow_service.js)"]
        C[Get Chat History<br/>redis_service.js]
        D{Fast Track?<br/>fasttrack_service.js}
        E[Reset Password]
        F[MS Form]
        G[RAG Search<br/>supabase_service.js]
        H[Build Prompt<br/>prompt.js]
        I[Call LLM<br/>ai_service.js]
        J{Valid Response?<br/>models.js}
        K[Fallback]
    end
    
    subgraph Output["Output"]
        L{Has Action?}
        M[Queue Sub-Workflow<br/>bullmq_service.js]
        N[Send Webhook<br/>webhook_service.js]
        O[Save History]
    end
    
    A --> C
    B --> C
    C --> D
    
    D -->|Reset| E
    D -->|Form| F
    D -->|Normal| G
    
    G --> H
    H --> I
    I --> J
    J -->|Yes| L
    J -->|No| K
    K --> N
    
    L -->|Yes| M
    L -->|No| N
    M --> N
    E --> N
    F --> N
    
    N --> O
```

### 4. AI Agent - All-in-One Flow (ai-agent.js)

```mermaid
sequenceDiagram
    participant Backend as User Backend
    participant Queue as BullMQ (DB1)
    participant Agent as AI Agent (ai-agent.js)
    participant Worker as Main Worker
    participant Webhook as Webhook Service
    participant LLM as Ollama

    %% Job Creation
    Backend->>Queue: Add job

    %% Agent Startup
    Note over Agent: Startup Sequence
    Agent->>Agent: Load environment
    Agent->>Agent: Start MS Form Worker (subflow/)
    Agent->>Agent: Start Reset Worker (subflow/)
    Agent->>Agent: Start Main Worker
    Agent->>Agent: Start Express Server :8765

    %% Job Processing
    Queue->>Worker: Pick up job
    Worker->>Worker: Validate job data

    alt Success
        Worker->>Agent: POST AGENT_WEBHOOK_URL
        Agent->>Agent: processChatWorkflow()
        Agent->>LLM: Generate response
        LLM-->>Agent: AI response
        Agent->>Backend: POST /webhook/receive_reply
        Worker->>Queue: Mark completed
    else Fail
        Worker->>Worker: Catch error
        Worker->>Backend: POST /api/worker-error
        Worker->>Queue: Mark failed (retry up to 3x)
    end
```

### 5. Feedback Submission Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant M as MongoDB
    participant R as Redis (DB0)

    U->>F: Click like/dislike
    F->>B: POST /chat/feedback
    Note over B: sessionId, msgId, action

    %% Update MongoDB
    B->>M: updateOne (messages.$.feedback)

    %% Update Redis
    B->>R: LRANGE chat_history:{sessionId} 0 -1
    R-->>B: messages[]
    
    loop Find matching msgId
        B->>B: JSON.parse(msg)
        B->>B: if msg.msgId === msgId
        B->>B: msg.feedback = action
        B->>R: LSET key index updatedMsg
    end

    B->>R: EXPIRE chat_history:{sessionId} {CHAT_TTL_SECONDS}
    B-->>F: Success
    F-->>U: Update UI (highlight feedback)
```

### 6. WebSocket Connection Flow

```mermaid
sequenceDiagram
    participant F as Frontend
    participant N as Nginx
    participant WS as WebSocket Server
    participant B as Backend

    F->>N: Upgrade to WebSocket
    N->>WS: Proxy WebSocket
    WS-->>F: Connection established
    
    F->>WS: Init message {type: "init", sessionId}
    WS->>WS: ws.sessionId = sessionId
    
    Note over F,WS: Connection ready
    
    %% Bot reply message flow
    B->>WS: Broadcast to sessionId
    WS->>WS: Find ws by sessionId
    WS->>F: Send {text, msgId, image_urls, isError}
    
    %% AFK / Disconnection
    F->>WS: Close/Disconnect
    WS->>WS: Cleanup connection
```

### 7. Graceful Shutdown Flow

```mermaid
flowchart TB
    A[SIGTERM/SIGINT] --> B[Shutdown Handler]
    
    subgraph Shutdown["Graceful Shutdown (ai-agent.js)"]
        B --> C[Close Main Worker]
        C --> D[Close MS Form Worker]
        D --> E[Close Reset Worker]
        E --> F[Close Redis Connection]
        F --> G[Exit Process]
    end
    
    subgraph ActiveJobs["Active Jobs Handling"]
        H{Active Jobs?}
        H -->|Yes| I[Wait for completion]
        H -->|No| J[Proceed]
        I --> F
        J --> F
    end
    
    B --> H
```

## Data Storage Flow

### Write Path
```
User Message
    ↓
Backend API (chatService.handleUserMessage)
    ↓
├─→ BullMQ Queue (async AI processing)
├─→ MongoDB (persistent, upsert)
└─→ Redis Cache (RPUSH, TTL: CHAT_TTL_SECONDS)
```

### Read Path
```
Chat History Request (chatService.getChatHistory)
    ↓
Check Redis Cache (LRANGE)
    ↓
├─→ Hit: Return from Redis (parsed JSON)
└─→ Miss: Query MongoDB → Return messages
```

## Queue Processing Flow

### Job Lifecycle
```mermaid
flowchart LR
    A[Producer<br/>chatService] -->|"add()"| B[Queue<br/>AI_AGENT_QUEUE_NAME]
    B -->|"process()"| C[Worker<br/>ai-agent.js]
    C -->|"completed"| D[Remove<br/>count: 100]
    C -->|"failed"| E[Retry]
    E -->|"< 3 attempts"| C
    E -->|">= 3 attempts"| F[Dead Letter<br/>count: 200]
```

### Sub-Workflow Queue
```mermaid
sequenceDiagram
    participant A as AI Agent (workflow_service)
    participant Q as BullMQ
    participant SW as Sub-Worker (subflow/)
    participant Ext as External

    A->>A: Detect action (fasttrack_service)
    A->>Q: Publish job to sub-queue
    
    alt MS Form (ms_form queue)
        Q->>SW: msform-worker processes
        SW->>Ext: Submit to Microsoft Forms
        Ext-->>SW: Success
    else Reset Password (reset_password queue)
        Q->>SW: reset-worker processes
        SW->>Ext: Call reset API
        Ext-->>SW: Success
    end
    
    SW->>Q: Mark completed
```

## Error Recovery Flow

### AI Service Failure
```mermaid
flowchart TD
    A[Call LLM] --> B{Success?}
    B -->|Yes| C[Parse Response]
    B -->|No| D[Retry 3x]
    D --> E{Success?}
    E -->|Yes| C
    E -->|No| F[Fallback Message]
    C --> G{Valid Zod Schema?}
    G -->|Yes| H[Continue]
    G -->|No| F
    F --> H
```

### Worker Error Flow
```mermaid
flowchart TD
    A[Worker Process Job] --> B{Success?}
    B -->|Yes| C[Mark Completed]
    B -->|No| D[Catch Error]
    D --> E[POST /api/worker-error]
    E --> F{Retries < 3?}
    F -->|Yes| G[Retry with Backoff]
    F -->|No| H[Move to Failed]
    G --> A
```

## Data Retention

| Data | Storage | TTL/Retention | Key Pattern | Cleanup |
|------|---------|---------------|-------------|---------|
| Chat messages | MongoDB | Permanent | Collection: chats | Manual archive |
| Chat cache | Redis DB0 | CHAT_TTL_SECONDS | `chat_history:{sessionId}` | TTL auto-expire |
| Auth sessions | Redis DB3 | REDIS_SESSION_TTL | `{sessionId}` hash | TTL auto-expire |
| Queue jobs (success) | Redis DB1 | Auto-remove | BullMQ internal | removeOnComplete: 100 |
| Queue jobs (failed) | Redis DB1 | Auto-remove | BullMQ internal | removeOnFail: 200 |
| AI memory | Redis DB2 | Configurable | Agent memory keys | TTL |
| Cooldown tracking | Redis DB4 | Short-lived | Cooldown keys | TTL |
