"""Database connection and session management."""

from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""

    pass


# Ensure the data directory exists
db_path = settings.database_url.replace("sqlite+aiosqlite:///", "")
Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """Get a database session (for use as a FastAPI dependency)."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Create all database tables."""
    # Import all models so they're registered with Base
    from app.models import agent, codebook, finding, message, project, session, task  # noqa: F401
    from app.core.context_hierarchy import ContextDocument  # noqa: F401
    from app.core.scheduler import ScheduledTask  # noqa: F401
    from app.models.context_dag import ContextDAGNode  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
