from __future__ import annotations

import os
from functools import lru_cache
from pydantic import Field, AnyHttpUrl
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App
    APP_NAME: str = "Slurpy API"
    ENV: str = Field(default=os.getenv("ENV", "local"))
    DEBUG: bool = Field(default=os.getenv("DEBUG", "false").lower() == "true")
    LOG_FORMAT: str = Field(default=os.getenv("LOG_FORMAT", "console"))  # "console" | "json"

    # OpenAI / LLM
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = Field(default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    OPENAI_TEMPERATURE: float = Field(default=float(os.getenv("OPENAI_TEMPERATURE", "0.7")))

    # Embeddings
    EMBED_MODEL: str = Field(default=os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2"))
    EMBED_DEVICE: str | None = Field(default=os.getenv("EMBED_DEVICE"))  # cpu|cuda|mps

    # Qdrant
    QDRANT_URL: AnyHttpUrl | None = None
    QDRANT_API_KEY: str | None = None
    QDRANT_COLLECTION: str = Field(default=os.getenv("QDRANT_COLLECTION", "slurpy_chunks"))

    # Cache settings
    CACHE_SIZE: int = Field(default=int(os.getenv("CACHE_SIZE", "1000")))
    CACHE_TTL: int = Field(default=int(os.getenv("CACHE_TTL", "3600")))  # 1 hour default
    
    # Performance settings
    MAX_WORKERS: int = Field(default=int(os.getenv("MAX_WORKERS", "1")))

    # Supabase
    SUPABASE_URL: AnyHttpUrl | None = None
    SUPABASE_SERVICE_ROLE: str | None = None
    SUPABASE_ANON_KEY: str | None = None
    SUPABASE_SCHEMA: str = Field(default=os.getenv("SUPABASE_SCHEMA", "public"))

    

    class Config:
        env_file = (".env.backend", ".env.local", ".env")
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Cached Settings instance. Call anywhere.
    """
    return Settings()
