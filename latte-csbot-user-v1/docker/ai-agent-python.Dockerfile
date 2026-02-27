# ===========================================
# latte CS-BOT Python AI Agent Dockerfile
# ===========================================
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY latte-csbot_ai-agent/mainflow/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY latte-csbot_ai-agent/mainflow/ .

RUN mkdir -p logs

EXPOSE 8767

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8765/health || exit 1

CMD ["uvicorn", "ai-agent-mainflow:app", "--host", "0.0.0.0", "--port", "8765"]
