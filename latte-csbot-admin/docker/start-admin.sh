#!/bin/bash
# ===========================================
# ADMIN BACKEND STARTUP SCRIPT
# ===========================================
# Enhanced startup script for simplified dashboard service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting latte CSBot Admin Backend...${NC}"

# Environment info
echo -e "${YELLOW}📋 Environment: ${NODE_ENV:-production}${NC}"
echo -e "${YELLOW}🔧 Port: ${PORT:-3002}${NC}"
echo -e "${YELLOW}⏰ Cache Update Interval: ${CACHE_UPDATE_INTERVAL:-86400000}ms${NC}"
echo -e "${YELLOW}⏳ Cache Startup Delay: ${CACHE_STARTUP_DELAY:-5000}ms${NC}"

# Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p /app/cache
mkdir -p /app/src/dashboard_service/utils
mkdir -p /app/storage

# Set permissions
chmod 755 /app/cache
chmod 755 /app/src/dashboard_service/utils
chmod 755 /app/storage

# Wait for dependencies
echo -e "${YELLOW}⏳ Waiting for dependencies...${NC}"

# Wait for MongoDB
echo -e "${YELLOW}🗄️  Waiting for MongoDB...${NC}"
while ! nc -z mongodb 27017; do
  echo -e "${YELLOW}   MongoDB not ready, waiting...${NC}"
  sleep 2
done
echo -e "${GREEN}✅ MongoDB is ready${NC}"

# Wait for Redis
echo -e "${YELLOW}🔴 Waiting for Redis...${NC}"
while ! nc -z redis 6379; do
  echo -e "${YELLOW}   Redis not ready, waiting...${NC}"
  sleep 2
done
echo -e "${GREEN}✅ Redis is ready${NC}"

# Wait for Ollama (optional)
if [ "${OLLAMA_ENABLED:-true}" = "true" ]; then
  echo -e "${YELLOW}🤖 Waiting for Ollama...${NC}"
  while ! nc -z ollama 11434; do
    echo -e "${YELLOW}   Ollama not ready, waiting...${NC}"
    sleep 2
  done
  echo -e "${GREEN}✅ Ollama is ready${NC}"
fi

# Initialize cache files if they don't exist
echo -e "${YELLOW}💾 Initializing cache files...${NC}"

DASHBOARD_CACHE_FILE="/app/src/dashboard_service/utils/dashboard_cache.json"
WORDFREQ_CACHE_FILE="/app/src/dashboard_service/utils/wordfreq_cache.json"

if [ ! -f "$DASHBOARD_CACHE_FILE" ]; then
  echo -e "${YELLOW}📊 Creating initial dashboard cache...${NC}"
  cat > "$DASHBOARD_CACHE_FILE" << 'EOF'
{
  "last_day": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {
      "totalMessages": 0,
      "avgResponseTime": "0.00",
      "avgSessionDuration": "0.00s",
      "totalLikes": 0,
      "totalDislikes": 0,
      "happiness": {
        "score": 0,
        "status": "ไม่มีข้อมูล",
        "emoji": "😐"
      }
    }
  },
  "7days": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {
      "totalMessages": 0,
      "avgResponseTime": "0.00",
      "avgSessionDuration": "0.00s",
      "totalLikes": 0,
      "totalDislikes": 0,
      "happiness": {
        "score": 0,
        "status": "ไม่มีข้อมูล",
        "emoji": "😐"
      }
    }
  },
  "30days": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {
      "totalMessages": 0,
      "avgResponseTime": "0.00",
      "avgSessionDuration": "0.00s",
      "totalLikes": 0,
      "totalDislikes": 0,
      "happiness": {
        "score": 0,
        "status": "ไม่มีข้อมูล",
        "emoji": "😐"
      }
    }
  },
  "1year": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {
      "totalMessages": 0,
      "avgResponseTime": "0.00",
      "avgSessionDuration": "0.00s",
      "totalLikes": 0,
      "totalDislikes": 0,
      "happiness": {
        "score": 0,
        "status": "ไม่มีข้อมูล",
        "emoji": "😐"
      }
    }
  },
  "all": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {
      "totalMessages": 0,
      "avgResponseTime": "0.00",
      "avgSessionDuration": "0.00s",
      "totalLikes": 0,
      "totalDislikes": 0,
      "happiness": {
        "score": 0,
        "status": "ไม่มีข้อมูล",
        "emoji": "😐"
      }
    }
  }
}
EOF
  echo -e "${GREEN}✅ Dashboard cache initialized${NC}"
fi

if [ ! -f "$WORDFREQ_CACHE_FILE" ]; then
  echo -e "${YELLOW}🔤 Creating initial word frequency cache...${NC}"
  cat > "$WORDFREQ_CACHE_FILE" << 'EOF'
{
  "last_day": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {}
  },
  "7days": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {}
  },
  "30days": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {}
  },
  "1year": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {}
  },
  "all": {
    "date": "1970-01-01",
    "timestamp": 0,
    "data": {}
  }
}
EOF
  echo -e "${GREEN}✅ Word frequency cache initialized${NC}"
fi

echo -e "${GREEN}🎉 All initialization complete!${NC}"
echo -e "${BLUE}🚀 Starting Node.js application...${NC}"

# Start the application
exec "$@"