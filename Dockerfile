FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Copy requirements
COPY requirements/backend.txt requirements/backend.txt

# Install torch CPU
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu --quiet

# Install all requirements INCLUDING click
RUN pip install -r requirements/backend.txt --quiet

# Download model
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" 2>/dev/null || true

# Copy code
COPY backend /app/backend
COPY emotion /app/emotion

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "backend.slurpy.workers.mcp_server:app", "--host", "0.0.0.0", "--port", "8000"]


