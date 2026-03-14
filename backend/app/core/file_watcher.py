"""Watch directories for new/modified files and auto-ingest them."""

import asyncio
import json
import logging
from pathlib import Path

from watchfiles import awatch, Change

from app.core.embeddings import embed_chunks
from app.core.file_processor import get_supported_extensions, process_file
from app.core.rag import VectorStore
from app.api.websocket import broadcast_file_processed

logger = logging.getLogger(__name__)


class FileWatcher:
    """Watches configured directories for file changes and auto-processes them."""

    def __init__(self) -> None:
        self._running = False
        self._watched_dirs: dict[str, str] = {}  # dir_path → project_id
        self._processed_files: dict[str, float] = {}  # file_path → last_modified
        self._state_file = Path("data/watcher_state.json")
        self._load_state()

    def _load_state(self) -> None:
        """Load processed file state from disk."""
        if self._state_file.exists():
            try:
                data = json.loads(self._state_file.read_text())
                self._processed_files = data.get("processed_files", {})
                self._watched_dirs = data.get("watched_dirs", {})
            except (json.JSONDecodeError, KeyError):
                pass

    def _save_state(self) -> None:
        """Save processed file state to disk."""
        self._state_file.parent.mkdir(parents=True, exist_ok=True)
        self._state_file.write_text(
            json.dumps(
                {
                    "processed_files": self._processed_files,
                    "watched_dirs": self._watched_dirs,
                },
                indent=2,
            )
        )

    def add_watch(self, directory: str, project_id: str) -> None:
        """Add a directory to watch for a specific project."""
        self._watched_dirs[directory] = project_id
        self._save_state()
        logger.info(f"Watching directory: {directory} for project {project_id}")

    def remove_watch(self, directory: str) -> None:
        """Remove a directory from watching."""
        self._watched_dirs.pop(directory, None)
        self._save_state()
        logger.info(f"Stopped watching: {directory}")

    def get_watches(self) -> dict[str, str]:
        """Get all watched directories."""
        return dict(self._watched_dirs)

    async def _process_file(self, file_path: Path, project_id: str) -> dict | None:
        """Process a single file and ingest into the vector store.

        Returns:
            Summary dict of what was processed, or None if skipped/failed.
        """
        suffix = file_path.suffix.lower()
        if suffix not in get_supported_extensions():
            return None

        # Check if already processed and not modified
        stat = file_path.stat()
        file_key = str(file_path)
        last_modified = stat.st_mtime

        if file_key in self._processed_files:
            if self._processed_files[file_key] >= last_modified:
                return None  # Already processed, not modified

        logger.info(f"Processing file: {file_path}")

        # Process the file
        result = process_file(file_path)
        if result.error:
            logger.error(f"Error processing {file_path}: {result.error}")
            return {"file": file_key, "error": result.error}

        if not result.chunks:
            logger.warning(f"No text extracted from {file_path}")
            return None

        # Delete old embeddings for this source
        store = VectorStore(project_id)
        await store.delete_by_source(file_key)

        # Embed and store
        embedded = await embed_chunks(result.chunks)
        count = await store.add_chunks(embedded)

        # Mark as processed
        self._processed_files[file_key] = last_modified
        self._save_state()

        summary = {
            "file": file_key,
            "chunks": count,
            "total_chars": result.total_chars,
            "pages": result.pages,
        }
        logger.info(f"Processed {file_path}: {count} chunks indexed")

        # Notify UI via WebSocket
        try:
            await broadcast_file_processed(file_path.name, count, project_id)
        except Exception:
            pass  # Don't fail file processing if broadcast fails

        return summary

    async def scan_directory(self, directory: str, project_id: str) -> list[dict]:
        """Scan a directory and process all supported files.

        Returns:
            List of processing summaries.
        """
        dir_path = Path(directory)
        if not dir_path.exists() or not dir_path.is_dir():
            logger.warning(f"Directory not found: {directory}")
            return []

        results = []
        supported = set(get_supported_extensions())

        for file_path in dir_path.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in supported:
                result = await self._process_file(file_path, project_id)
                if result:
                    results.append(result)

        return results

    async def start(self) -> None:
        """Start watching all configured directories."""
        self._running = True
        logger.info(f"File watcher started. Watching {len(self._watched_dirs)} directories.")

        # Initial scan of all watched directories
        for directory, project_id in self._watched_dirs.items():
            await self.scan_directory(directory, project_id)

        # Watch for changes
        dirs_to_watch = [d for d in self._watched_dirs if Path(d).exists()]
        if not dirs_to_watch:
            # No directories to watch — just sleep and periodically check for new watches
            while self._running:
                await asyncio.sleep(10)
                dirs_to_watch = [d for d in self._watched_dirs if Path(d).exists()]
                if dirs_to_watch:
                    break

        if not self._running:
            return

        try:
            async for changes in awatch(*dirs_to_watch):
                if not self._running:
                    break

                for change_type, path_str in changes:
                    if change_type in (Change.added, Change.modified):
                        file_path = Path(path_str)
                        if not file_path.is_file():
                            continue

                        # Find which project this file belongs to
                        for watch_dir, project_id in self._watched_dirs.items():
                            if str(file_path).startswith(watch_dir):
                                await self._process_file(file_path, project_id)
                                break
        except asyncio.CancelledError:
            logger.info("File watcher cancelled.")

    def stop(self) -> None:
        """Stop the file watcher."""
        self._running = False
        logger.info("File watcher stopped.")
