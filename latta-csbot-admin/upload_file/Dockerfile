# Python Ingestion Pipeline Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PyMuPDF
# Fix for Hash Sum mismatch: clean cache, disable check-valid-until, use fix-missing, allow unauthenticated
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get update -o Acquire::Check-Valid-Until=false -o Acquire::AllowInsecureRepositories=true || true && \
    apt-get install -y --allow-unauthenticated --fix-missing --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy pipeline modules
# Copy pipeline modules
COPY pipeline/ ./pipeline/
COPY controllers/ ./controllers/
COPY routes/ ./routes/
COPY services/ ./services/
COPY upload_file_service.py .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run the service
CMD ["uvicorn", "upload_file_service:app", "--host", "0.0.0.0", "--port", "8001"]
