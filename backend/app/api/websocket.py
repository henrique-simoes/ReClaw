"""WebSocket endpoint for real-time agent status updates."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Manage active WebSocket connections."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self._connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self._connections)}")

    async def broadcast(self, event_type: str, data: dict) -> None:
        """Broadcast an event to all connected clients."""
        message = json.dumps({
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        disconnected = []
        for connection in self._connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def send_to(self, websocket: WebSocket, event_type: str, data: dict) -> None:
        """Send an event to a specific client."""
        message = json.dumps({
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await websocket.send_text(message)


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates.

    Events broadcast to clients:
    - agent_status: Agent activity updates (working, idle, etc.)
    - task_progress: Task progress updates (task_id, progress, notes)
    - file_processed: A file was processed and indexed
    - finding_created: A new finding was created
    - suggestion: Agent has a suggestion for the user
    - error: An error occurred
    """
    await manager.connect(websocket)

    try:
        # Send initial status
        await manager.send_to(websocket, "connected", {
            "message": "Connected to ReClaw real-time updates.",
        })

        # Keep connection alive, handle incoming messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle ping/pong for keepalive
                message = json.loads(data)
                if message.get("type") == "ping":
                    await manager.send_to(websocket, "pong", {})
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await manager.send_to(websocket, "ping", {})
                except Exception:
                    break

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# Helper functions for broadcasting events from other modules

async def broadcast_agent_status(status: str, details: str = "") -> None:
    """Broadcast agent status update."""
    await manager.broadcast("agent_status", {"status": status, "details": details})


async def broadcast_task_progress(task_id: str, progress: float, notes: str = "") -> None:
    """Broadcast task progress update."""
    await manager.broadcast("task_progress", {
        "task_id": task_id,
        "progress": progress,
        "notes": notes,
    })


async def broadcast_file_processed(filename: str, chunks: int, project_id: str) -> None:
    """Broadcast file processing completion."""
    await manager.broadcast("file_processed", {
        "filename": filename,
        "chunks": chunks,
        "project_id": project_id,
    })


async def broadcast_suggestion(message: str, project_id: str, action: str = "") -> None:
    """Broadcast a suggestion to the user."""
    await manager.broadcast("suggestion", {
        "message": message,
        "project_id": project_id,
        "action": action,
    })


async def broadcast_resource_throttle(reason: str, resources: Optional[dict] = None) -> None:
    """Broadcast a resource throttle event (agent paused due to hardware)."""
    await manager.broadcast("resource_throttle", {
        "reason": reason,
        "resources": resources or {},
    })


async def broadcast_task_queue_update(
    project_id: str, pending: int, in_progress: int, completed: int
) -> None:
    """Broadcast task queue depth so users see progress."""
    await manager.broadcast("task_queue_update", {
        "project_id": project_id,
        "pending": pending,
        "in_progress": in_progress,
        "completed": completed,
    })
