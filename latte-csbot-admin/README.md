# latte-csbot-admin

Admin Panel and Multimodal RAG Pipeline for CP ALL Customer Service AI Chatbot.

## Overview

`latte-csbot-admin` is the administrative interface and document processing system for the CP ALL Customer Service AI Chatbot. It provides:

- **Dashboard**: Real-time chat analytics and statistics
- **Chat Management**: View, search, and manage chat sessions
- **RAG Pipeline**: Upload and process documents for knowledge base

## Tech Stack

### Frontend
- **Angular 17+** - UI framework
- **Tailwind CSS 3.x** - Styling
- **Nginx** - Static file server
- **TypeScript 5.x** - Type safety

### Backend
- **Node.js 20.x** - JavaScript runtime
- **Express.js 4.x** - API framework
- **npm** - Package manager

### RAG Pipeline
- **Python 3.11+** - ML pipeline runtime
- **FastAPI** - Async API framework
- **Ollama** - LLM, Embeddings, Vision models

### Database & Storage
- **Supabase** (PostgreSQL) - Auth, Vector storage
- **Redis** - Caching
- **Supabase Storage** - File storage
- **JSON Files** - Local chat session backup

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Orchestration
- **Nginx** - Reverse proxy

## Project Structure

```
latte-csbot-admin/
├── backend/                   # Node.js API
│   ├── src/
│   │   ├── dashboard_service/    # Analytics
│   │   ├── chat_service/         # Chat management
│   │   ├── rag_service/          # RAG pipeline
│   │   └── utils/                # Utilities
│   └── tools/                    # Data import tools
├── frontend/                    # Angular app
├── docker/                      # Docker configurations
├── upload_file/                 # Python RAG service
├── .env                         # Environment variables
├── .env.example                 # Example env
├── ARCHITECTURE.md             # Architecture docs
├── DATAFLOW.md                 # Data flow docs
├── DESIGN.md                   # Design docs
└── docker-compose.yml           # Docker services
```

## Quick Start

### Prerequisites

1. **Docker** and **Docker Compose**
2. **latte-csbot-database** running (Supabase, Redis)
3. **Ollama** server (external or from latte-csbot-user)

### Installation

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Configure environment variables
# Edit .env with your settings

# 3. Start services
docker compose up -d

# 4. Check status
docker compose ps
```

### Access

| Service | URL |
|---------|-----|
| Admin Frontend | http://localhost:81 |
| Admin API | http://localhost:3002 |
| RAG API | http://localhost:8001 |
| Health Check | http://localhost:3002/api/overview |

## Services

### Admin Frontend (Port 81)
Angular-based admin dashboard with:
- Dashboard analytics
- Chat logs viewer
- RAG file management

### Admin Backend (Port 3002)
Node.js Express API providing:
- Dashboard statistics API
- Chat session management
- RAG upload proxy

### RAG Upload Service (Port 8001)
Python FastAPI service for:
- Document upload and processing
- Text extraction
- Vision analysis
- Embedding generation

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_PORT` | Backend port | 3002 |
| `ADMIN_FRONTEND_PORT` | Frontend port | 81 |
| `RAG_UPLOAD_PORT` | RAG API port | 8001 |
| `SUPABASE_URL` | Supabase API URL | - |
| `SUPABASE_KEY` | Supabase API key | - |
| `OLLAMA_BASE_URL` | Ollama server URL | - |
| `OLLAMA_EMBED_MODEL` | Embedding model | qwen3-embedding:0.6b |
| `CACHE_UPDATE_INTERVAL` | Cache TTL (ms) | 86400000 |

See `.env.example` for all configuration options.

## Data Management

### Chat Data Import

```bash
# Convert MongoDB BSON to JSON
docker compose exec admin-backend node /app/tools/convert-mongodb-json.js /app/import/chats.json /app/data/chats/

# Import sessions
docker compose exec admin-backend node /app/tools/import-sessions.js /app/data/chats/
```

### RAG Document Upload

Documents can be uploaded through:
1. Admin Frontend: http://localhost:81/files
2. API: POST /api/rag/upload

Supported formats: PDF, PNG, JPG, DOCX

## API Documentation

### Dashboard Endpoints

```bash
GET /api/overview          # Overview statistics
GET /api/stats/daily       # Daily stats
GET /api/stats/feedback    # Feedback stats
GET /api/stats/hourly      # Hourly distribution
```

### Chat Endpoints

```bash
GET /api/chats             # List chats
GET /api/chats/:id         # Get chat
POST /api/dashboard/upload # Upload chat
DELETE /api/chats/:id      # Delete chat
```

### RAG Endpoints

```bash
POST /api/rag/upload      # Upload document
GET /api/rag/search       # Search knowledge base
GET /api/rag/files        # List files
```

## Troubleshooting

### Services not starting
```bash
# Check logs
docker compose logs admin-backend
docker compose logs admin-frontend
docker compose logs multimodal-rag-upload
```

### RAG upload failing
```bash
# Check Ollama connectivity
curl http://192.168.1.201:11434/api/version

# Check RAG service health
curl http://localhost:8001/health
```

### Dashboard not loading
```bash
# Check backend health
curl http://localhost:3002/api/overview

# Check cache permissions
docker compose exec admin-backend ls -la /app/cache/
```

## Dependencies

This project requires these external services:

1. **latte-csbot-database**
   - Supabase (PostgreSQL, Auth, Storage)
   - Redis

2. **latte-csbot-llm** (or external Ollama)
   - LLM inference
   - Embedding generation
   - Vision models

## License

Internal CP ALL project.
