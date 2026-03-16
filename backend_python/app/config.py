from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./spintracker.db"
    app_name: str = "SpinTracker Backend"
    app_version: str = "1.0.0"
    debug: bool = False

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()