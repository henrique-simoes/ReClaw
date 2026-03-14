"""User Simulation Agent — simulates real users to test the platform end-to-end.

Creates projects, uploads files, runs skills, reviews findings — all
through the actual API to verify everything works as a real user would experience.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

import os
API_BASE = os.getenv("RECLAW_API_BASE", "http://localhost:8000")


class UserSimAgent:
    """Simulates user behavior against the ReClaw API."""

    def __init__(self) -> None:
        self._running = False
        self._sim_interval = 1800  # 30 minutes
        self._reports: list[dict] = []
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(base_url=API_BASE, timeout=30.0)
        return self._client

    async def start(self) -> None:
        self._running = True
        logger.info("User Simulation Agent started.")

        # Wait for backend to be ready
        await asyncio.sleep(30)

        while self._running:
            try:
                report = await self.run_simulation()
                self._reports.append(report)
                if len(self._reports) > 10:
                    self._reports = self._reports[-10:]
            except Exception as e:
                logger.error(f"User simulation error: {e}")

            await asyncio.sleep(self._sim_interval)

    def stop(self) -> None:
        self._running = False

    async def run_simulation(self) -> dict:
        """Run a full user simulation cycle."""
        timestamp = datetime.now(timezone.utc).isoformat()
        results: list[dict] = []

        client = await self._get_client()

        # Test 1: Health check
        results.append(await self._test_endpoint(client, "Health Check", "GET", "/api/health"))

        # Test 2: List projects (may be empty)
        result = await self._test_endpoint(client, "List Projects", "GET", "/api/projects")
        results.append(result)

        # Test 3: Create a test project
        project_name = f"Sim Test {datetime.now().strftime('%H:%M')}"
        result = await self._test_endpoint(
            client, "Create Project", "POST", "/api/projects",
            json={"name": project_name, "description": "Automated simulation test"},
        )
        results.append(result)
        project_id = result.get("response", {}).get("id") if result["success"] else None

        if project_id:
            # Test 4: Get project
            results.append(await self._test_endpoint(
                client, "Get Project", "GET", f"/api/projects/{project_id}"
            ))

            # Test 5: Create a task
            result = await self._test_endpoint(
                client, "Create Task", "POST", "/api/tasks",
                json={"project_id": project_id, "title": "Test interview analysis", "skill_name": "user-interviews"},
            )
            results.append(result)
            task_id = result.get("response", {}).get("id") if result["success"] else None

            # Test 6: List tasks
            results.append(await self._test_endpoint(
                client, "List Tasks", "GET", f"/api/tasks?project_id={project_id}"
            ))

            # Test 7: Get findings summary
            results.append(await self._test_endpoint(
                client, "Findings Summary", "GET", f"/api/findings/summary/{project_id}"
            ))

            # Test 8: List skills
            results.append(await self._test_endpoint(
                client, "List Skills", "GET", "/api/skills"
            ))

            # Test 9: Get hardware info
            results.append(await self._test_endpoint(
                client, "Hardware Info", "GET", "/api/settings/hardware"
            ))

            # Test 10: System status
            results.append(await self._test_endpoint(
                client, "System Status", "GET", "/api/settings/status"
            ))

            # Test 11: Check audit endpoints
            results.append(await self._test_endpoint(
                client, "DevOps Audit", "GET", "/api/audit/devops/latest"
            ))

            # Cleanup: delete test project
            await self._test_endpoint(
                client, "Delete Test Project", "DELETE", f"/api/projects/{project_id}"
            )

        # Summarize
        passed = sum(1 for r in results if r["success"])
        failed = len(results) - passed

        return {
            "timestamp": timestamp,
            "tests_run": len(results),
            "passed": passed,
            "failed": failed,
            "pass_rate": round(passed / max(len(results), 1) * 100, 1),
            "results": results,
            "summary": f"{passed}/{len(results)} tests passed ({round(passed / max(len(results), 1) * 100)}%)",
        }

    async def _test_endpoint(
        self, client: httpx.AsyncClient, name: str, method: str, path: str, **kwargs
    ) -> dict:
        """Test a single API endpoint."""
        try:
            if method == "GET":
                resp = await client.get(path)
            elif method == "POST":
                resp = await client.post(path, **kwargs)
            elif method == "DELETE":
                resp = await client.delete(path)
            else:
                resp = await client.request(method, path, **kwargs)

            success = 200 <= resp.status_code < 300
            return {
                "name": name,
                "method": method,
                "path": path,
                "status_code": resp.status_code,
                "success": success,
                "response_time_ms": resp.elapsed.total_seconds() * 1000 if hasattr(resp, 'elapsed') else 0,
                "response": resp.json() if success and resp.headers.get("content-type", "").startswith("application/json") else {},
                "error": None if success else resp.text[:200],
            }
        except Exception as e:
            return {
                "name": name,
                "method": method,
                "path": path,
                "status_code": 0,
                "success": False,
                "response_time_ms": 0,
                "response": {},
                "error": str(e),
            }

    def get_latest_report(self) -> dict | None:
        return self._reports[-1] if self._reports else None

    def get_reports(self, limit: int = 10) -> list[dict]:
        return self._reports[-limit:]


# Singleton
user_sim_agent = UserSimAgent()
