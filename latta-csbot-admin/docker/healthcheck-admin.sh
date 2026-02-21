#!/bin/bash
# ===========================================
# ADMIN BACKEND HEALTH CHECK SCRIPT
# ===========================================
# Enhanced health check for simplified dashboard service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Starting Admin Backend Health Check...${NC}"

# Check if server is responding
echo -e "${YELLOW}📡 Checking server response...${NC}"
if curl -f -s http://localhost:3002/api/overview > /dev/null; then
    echo -e "${GREEN}✅ Server is responding${NC}"
else
    echo -e "${RED}❌ Server is not responding${NC}"
    exit 1
fi

# Check dashboard service endpoints
echo -e "${YELLOW}📊 Checking dashboard endpoints...${NC}"

# Test overview endpoint
if curl -f -s "http://localhost:3002/api/overview?period=7days" | grep -q "totalMessages"; then
    echo -e "${GREEN}✅ Dashboard overview endpoint working${NC}"
else
    echo -e "${RED}❌ Dashboard overview endpoint failed${NC}"
    exit 1
fi

# Test word frequency endpoint
if curl -f -s http://localhost:3002/api/wordfreq > /dev/null; then
    echo -e "${GREEN}✅ Word frequency endpoint working${NC}"
else
    echo -e "${RED}❌ Word frequency endpoint failed${NC}"
    exit 1
fi

# Check cache files exist (optional - they might be created on first run)
echo -e "${YELLOW}💾 Checking cache files...${NC}"
if [ -f "/app/src/dashboard_service/utils/dashboard_cache.json" ]; then
    echo -e "${GREEN}✅ Dashboard cache file exists${NC}"
else
    echo -e "${YELLOW}⚠️  Dashboard cache file not found (will be created on first update)${NC}"
fi

if [ -f "/app/src/dashboard_service/utils/wordfreq_cache.json" ]; then
    echo -e "${GREEN}✅ Word frequency cache file exists${NC}"
else
    echo -e "${YELLOW}⚠️  Word frequency cache file not found (will be created on first update)${NC}"
fi

# Check MongoDB connection (via API)
echo -e "${YELLOW}🗄️  Checking database connection...${NC}"
if curl -f -s "http://localhost:3002/api/chats?limit=1" > /dev/null; then
    echo -e "${GREEN}✅ Database connection working${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 All health checks passed!${NC}"
exit 0