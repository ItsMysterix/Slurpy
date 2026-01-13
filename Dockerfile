FROM python:3.11-slim

WORKDIR /app

# Install system dependencies - minimal set
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set Python to use UTF-8 encoding and skip writing bytecode
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV TOKENIZERS_PARALLELISM=false
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

# Upgrade pip/setuptools for faster installs
RUN pip install --upgrade pip setuptools wheel --quiet

# Copy requirements
COPY requirements/backend.txt .

# Install torch CPU-only version first (much smaller than CUDA version)
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu --quiet

# Install all other dependencies, excluding torch to avoid reinstalling
RUN pip install -r backend.txt --quiet --no-deps || pip install -r backend.txt --quiet

# Pre-download embedding model at build time
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" 2>/dev/null || true

# Copy backend code (after dependencies to leverage Docker layer caching)
COPY backend /app/backend
COPY emotion /app/emotion

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/healthz || exit 1

# Expose port
EXPOSE 8000

# Run the MCP server with single worker for Railway hobby plan
CMD ["python", "-m", "uvicorn", "backend.slurpy.workers.mcp_server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

