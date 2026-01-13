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

# Install dependencies with aggressive caching
# Split into two layers: base deps and heavy ML deps
RUN pip install \
    fastapi==0.115.0 \
    uvicorn==0.30.0 \
    python-dotenv==1.0.1 \
    pydantic==2.11.0 \
    pydantic-settings==2.10.1 \
    --quiet

# Install heavy ML dependencies (cached for reuse)
RUN pip install \
    torch>=2.0.0,<3.0.0 \
    --quiet

# Install remaining dependencies from requirements
RUN pip install -r backend.txt --quiet

# Pre-download embedding model at build time (important for performance)
# Use a minimal approach that doesn't require extra deps
RUN python -c "from sentence_transformers import SentenceTransformer; print('Loading model...'); model = SentenceTransformer('all-MiniLM-L6-v2'); print('✅ Model ready')" || echo "Model will download at startup"

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

