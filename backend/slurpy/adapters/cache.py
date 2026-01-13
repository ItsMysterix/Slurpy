# backend/slurpy/adapters/cache.py
"""
Simple in-memory LRU cache for RAG query results.
No Redis needed - keeps Railway costs minimal.
"""
from __future__ import annotations

from collections import OrderedDict
import time
import hashlib
from typing import Optional, Any
import os

__all__ = ["get_cache", "QueryCache"]


class QueryCache:
    """LRU cache with TTL for query results"""
    
    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        self.cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self.max_size = max_size
        self.ttl = ttl
        self.hits = 0
        self.misses = 0
    
    def _generate_key(self, data: str) -> str:
        """Generate cache key from query string"""
        return hashlib.md5(data.encode()).hexdigest()
    
    def get(self, query: str) -> Optional[Any]:
        """Get cached value if exists and not expired"""
        key = self._generate_key(query)
        
        if key in self.cache:
            value, timestamp = self.cache[key]
            
            # Check if still valid
            if time.time() - timestamp < self.ttl:
                # Move to end (LRU)
                self.cache.move_to_end(key)
                self.hits += 1
                return value
            else:
                # Expired, remove it
                del self.cache[key]
        
        self.misses += 1
        return None
    
    def set(self, query: str, value: Any) -> None:
        """Cache a value with current timestamp"""
        key = self._generate_key(query)
        
        # Remove oldest if cache is full
        if len(self.cache) >= self.max_size:
            self.cache.popitem(last=False)
        
        self.cache[key] = (value, time.time())
    
    def clear(self) -> None:
        """Clear all cached values and stats"""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
    
    def stats(self) -> dict[str, Any]:
        """Get cache statistics"""
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0
        
        return {
            "size": len(self.cache),
            "max_size": self.max_size,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": f"{hit_rate:.2f}%",
            "ttl_seconds": self.ttl
        }


# Singleton instance
_cache: Optional[QueryCache] = None


def get_cache() -> QueryCache:
    """Get or create the global cache instance"""
    global _cache
    if _cache is None:
        max_size = int(os.getenv("CACHE_SIZE", "1000"))
        ttl = int(os.getenv("CACHE_TTL", "3600"))
        _cache = QueryCache(max_size=max_size, ttl=ttl)
    return _cache
