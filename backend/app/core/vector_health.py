"""Vector store health checks -- dimension validation and diagnostics."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


async def check_embedding_dimensions(project_id: Optional[str] = None) -> dict:
    """Verify stored vector dimensions match current embedding model output."""
    from app.core.embeddings import embed_text

    try:
        test_vector = await embed_text("dimension validation check")
        model_dim = len(test_vector)
    except Exception as e:
        return {"status": "error", "message": f"Cannot get model dimensions: {e}", "stored_dim": 0, "model_dim": 0}

    # Check a specific project or scan all
    data_dir = Path(settings.data_dir) / "lance_db"
    if not data_dir.exists():
        return {"status": "empty", "message": "No vector stores found", "stored_dim": 0, "model_dim": model_dim}

    projects = [project_id] if project_id else [d.name for d in data_dir.iterdir() if d.is_dir()]

    mismatches = []
    for pid in projects:
        try:
            import lancedb
            db_path = str(data_dir / pid)
            db = lancedb.connect(db_path)
            if "chunks" not in db.table_names():
                continue
            table = db.open_table("chunks")
            df = table.to_pandas()
            if len(df) == 0:
                continue
            stored_dim = len(df.iloc[0]["vector"])
            if stored_dim != model_dim:
                mismatches.append({"project_id": pid, "stored_dim": stored_dim, "model_dim": model_dim})
        except Exception as e:
            logger.warning(f"Dimension check failed for project {pid}: {e}")

    if mismatches:
        return {
            "status": "mismatch",
            "message": f"Dimension mismatch in {len(mismatches)} project(s). Reprocess files to fix.",
            "mismatches": mismatches,
            "model_dim": model_dim,
            "stored_dim": mismatches[0]["stored_dim"] if mismatches else 0,
        }

    return {"status": "ok", "message": "All vector dimensions match", "stored_dim": model_dim, "model_dim": model_dim}
