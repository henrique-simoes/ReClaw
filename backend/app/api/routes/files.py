"""File upload and processing API routes."""

import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.file_processor import get_supported_extensions, process_file
from app.core.rag import VectorStore, ingest_chunks
from app.models.database import get_db

# Media and image extensions that can be uploaded/served but not text-processed
MEDIA_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".ogg",
    ".mp4", ".webm", ".mov",
    ".jpg", ".jpeg", ".png", ".gif",
}

router = APIRouter()


@router.post("/files/upload/{project_id}")
async def upload_file(
    project_id: str,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
):
    """Upload a file and process it into the project's knowledge base."""
    # Validate extension
    suffix = Path(file.filename or "").suffix.lower()
    all_supported = set(get_supported_extensions()) | MEDIA_EXTENSIONS
    if suffix not in all_supported:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {suffix}. Supported: {', '.join(sorted(all_supported))}",
        )

    # Save file to upload directory
    project_upload_dir = Path(settings.upload_dir) / project_id
    project_upload_dir.mkdir(parents=True, exist_ok=True)

    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{suffix}"
    file_path = project_upload_dir / safe_filename

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # Media files: store only, skip text extraction
    if suffix in MEDIA_EXTENSIONS:
        return {
            "status": "stored",
            "file_id": file_id,
            "filename": file.filename,
            "saved_as": safe_filename,
            "total_chars": 0,
            "pages": 0,
            "chunks_indexed": 0,
        }

    # Process the file
    result = process_file(file_path)

    if result.error:
        return {
            "status": "error",
            "file_id": file_id,
            "filename": file.filename,
            "error": result.error,
        }

    # Remove existing chunks for this source before re-ingesting
    store = VectorStore(project_id)
    await store.delete_by_source(file_path.name)

    # Ingest chunks into vector store
    chunks_indexed = await ingest_chunks(project_id, result.chunks)

    return {
        "status": "processed",
        "file_id": file_id,
        "filename": file.filename,
        "saved_as": safe_filename,
        "total_chars": result.total_chars,
        "pages": result.pages,
        "chunks_indexed": chunks_indexed,
    }


@router.get("/files/{project_id}")
async def list_files(project_id: str):
    """List all uploaded files for a project."""
    project_upload_dir = Path(settings.upload_dir) / project_id
    if not project_upload_dir.exists():
        return {"files": []}

    files = []
    supported = set(get_supported_extensions()) | MEDIA_EXTENSIONS

    for file_path in sorted(project_upload_dir.iterdir()):
        if file_path.is_file() and file_path.suffix.lower() in supported:
            stat = file_path.stat()
            files.append({
                "name": file_path.name,
                "size_bytes": stat.st_size,
                "modified": stat.st_mtime,
                "type": file_path.suffix.lower(),
            })

    return {"files": files, "count": len(files)}


@router.post("/files/{project_id}/reprocess")
async def reprocess_files(project_id: str):
    """Reprocess all files for a project (re-embed and re-index)."""
    project_upload_dir = Path(settings.upload_dir) / project_id
    if not project_upload_dir.exists():
        return {"status": "no files", "processed": 0}

    total_chunks = 0
    processed_files = 0
    errors = []

    for file_path in project_upload_dir.iterdir():
        if not file_path.is_file():
            continue

        result = process_file(file_path)
        if result.error:
            errors.append({"file": file_path.name, "error": result.error})
            continue

        if result.chunks:
            # Remove existing chunks for this source before re-ingesting
            store = VectorStore(project_id)
            await store.delete_by_source(file_path.name)

            chunks = await ingest_chunks(project_id, result.chunks)
            total_chunks += chunks
            processed_files += 1

    return {
        "status": "complete",
        "processed": processed_files,
        "total_chunks": total_chunks,
        "errors": errors,
    }


@router.get("/files/{project_id}/stats")
async def file_stats(project_id: str):
    """Get vector store stats for a project."""
    store = VectorStore(project_id)
    count = await store.count()
    return {
        "project_id": project_id,
        "indexed_chunks": count,
    }


@router.get("/files/{project_id}/content/{filename}")
async def get_file_content(project_id: str, filename: str):
    """Get file content for preview. Returns text content for supported formats."""
    project_upload_dir = Path(settings.upload_dir) / project_id
    file_path = project_upload_dir / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Security: ensure file is within upload dir
    try:
        file_path.resolve().relative_to(project_upload_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    suffix = file_path.suffix.lower()

    # Text-based files: return content directly
    if suffix in {".txt", ".md", ".csv"}:
        async with aiofiles.open(file_path, "r", errors="replace") as f:
            content = await f.read()
        return {"filename": filename, "type": suffix, "content": content, "size": len(content)}

    # PDF: try to extract text
    if suffix == ".pdf":
        result = process_file(file_path)
        text = "\n\n".join(chunk.text for chunk in result.chunks) if result.chunks else ""
        return {"filename": filename, "type": suffix, "content": text, "pages": result.pages, "size": len(text)}

    # DOCX: extract text
    if suffix == ".docx":
        result = process_file(file_path)
        text = "\n\n".join(chunk.text for chunk in result.chunks) if result.chunks else ""
        return {"filename": filename, "type": suffix, "content": text, "size": len(text)}

    # Media files: return metadata only (frontend handles playback via direct URL)
    if suffix in MEDIA_EXTENSIONS:
        stat = os.stat(file_path)
        return {
            "filename": filename,
            "type": suffix,
            "content": None,
            "media_url": f"/api/files/{project_id}/serve/{filename}",
            "size": stat.st_size,
        }

    return {"filename": filename, "type": suffix, "content": None, "size": 0}


@router.post("/files/{project_id}/scan")
async def scan_project_files(project_id: str, request: Request):
    """Trigger a file watcher scan for the project's upload directory.

    Used by the seeder script and for manual re-scans that also create
    research tasks based on file classification.
    """
    upload_dir = str(Path(settings.upload_dir) / project_id)
    if not Path(upload_dir).exists():
        return {"status": "no files", "scanned": 0}

    file_watcher = getattr(request.app.state, "file_watcher", None)
    if not file_watcher:
        raise HTTPException(status_code=503, detail="File watcher not available")

    results = await file_watcher.scan_directory(upload_dir, project_id)
    return {
        "status": "complete",
        "scanned": len(results),
        "results": results,
    }


@router.get("/files/{project_id}/serve/{filename}")
async def serve_file(project_id: str, filename: str):
    """Serve a file directly (for media playback, image display, PDF viewer)."""
    project_upload_dir = Path(settings.upload_dir) / project_id
    file_path = project_upload_dir / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        file_path.resolve().relative_to(project_upload_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(file_path)
