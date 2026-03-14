#!/usr/bin/env python3
"""ReClaw End-to-End Test — Simulates Sarah's complete user journey.

Runs against a live ReClaw instance (docker compose up or local dev).
Tests every API endpoint, creates real data, runs real skills,
and verifies the entire system works end-to-end.

Usage:
    python tests/e2e_test.py [--base-url http://localhost:8000]
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    print("httpx required: pip install httpx")
    sys.exit(1)

BASE_URL = "http://localhost:8000"
FIXTURES = Path(__file__).parent / "fixtures"

# Test results tracking
results = []
start_time = time.time()


def test(name, fn):
    """Run a test and record the result."""
    try:
        result = fn()
        results.append({"name": name, "status": "PASS", "detail": str(result)[:200] if result else "OK"})
        print(f"  ✅ {name}")
        return result
    except Exception as e:
        results.append({"name": name, "status": "FAIL", "detail": str(e)[:300]})
        print(f"  ❌ {name}: {e}")
        return None


def main():
    global BASE_URL
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=BASE_URL)
    args = parser.parse_args()
    BASE_URL = args.base_url

    client = httpx.Client(base_url=BASE_URL, timeout=60.0)

    print("\n🐾 ReClaw End-to-End Test")
    print(f"   Target: {BASE_URL}")
    print(f"   Fixtures: {FIXTURES}")
    print("=" * 60)

    # =========================================================
    # PHASE 1: System Health
    # =========================================================
    print("\n📡 Phase 1: System Health")

    test("Health check", lambda: assert_ok(client.get("/api/health")))
    test("System status", lambda: assert_ok(client.get("/api/settings/status")))
    test("Hardware info", lambda: assert_ok(client.get("/api/settings/hardware")))
    test("Available models", lambda: assert_ok(client.get("/api/settings/models")))
    test("Resource governor", lambda: assert_ok(client.get("/api/resources")))

    # =========================================================
    # PHASE 2: Project Setup (Sarah creates her project)
    # =========================================================
    print("\n📁 Phase 2: Project Setup")

    project = test("Create project", lambda: assert_ok(client.post("/api/projects", json={
        "name": "Onboarding Redesign Study",
        "description": "Investigating onboarding drop-off for our PM tool. Goal: reduce churn by 20%.",
    })))
    project_id = project["id"] if project else None

    if project_id:
        test("Get project", lambda: assert_ok(client.get(f"/api/projects/{project_id}")))

        test("Set company context", lambda: assert_ok(client.patch(f"/api/projects/{project_id}", json={
            "company_context": "Acme PM — B2B SaaS project management tool for product teams. "
                               "200 employees, mid-market focus (50-500 seat companies). "
                               "Culture: data-driven, user-centric, move fast with quality.",
        })))

        test("Set project context", lambda: assert_ok(client.patch(f"/api/projects/{project_id}", json={
            "project_context": "Research goal: Understand why 45% of users drop off at step 3 (phone verification) "
                               "during onboarding. Timeline: 4 weeks. Target users: PMs, designers, eng leads "
                               "at companies with 50-500 employees. Phase: Discover.",
        })))

        test("Set guardrails", lambda: assert_ok(client.patch(f"/api/projects/{project_id}", json={
            "guardrails": "- Always cite which participant said what\n"
                          "- Flag findings with fewer than 3 supporting data points\n"
                          "- Use 'workspace' not 'project' (company terminology)\n"
                          "- Don't recommend removing phone verification without strong evidence",
        })))

    # =========================================================
    # PHASE 3: Context Hierarchy
    # =========================================================
    print("\n📜 Phase 3: Context Hierarchy")

    test("Create company context doc", lambda: assert_ok(client.post("/api/contexts", json={
        "name": "Acme PM Company Culture",
        "level_type": "company",
        "content": "We value user research and data-driven decisions. Our product team includes PMs, designers, and researchers.",
        "priority": 10,
    })))

    if project_id:
        test("Get composed context", lambda: assert_ok(client.get(f"/api/contexts/composed/{project_id}")))

    # =========================================================
    # PHASE 4: File Upload & Processing
    # =========================================================
    print("\n📄 Phase 4: File Upload & Processing")

    if project_id:
        for fixture_file in sorted(FIXTURES.glob("*")):
            if fixture_file.is_file():
                test(f"Upload {fixture_file.name}", lambda f=fixture_file: upload_file(client, project_id, f))

        test("List project files", lambda: assert_ok(client.get(f"/api/files/{project_id}")))
        test("File stats", lambda: assert_ok(client.get(f"/api/files/{project_id}/stats")))

    # =========================================================
    # PHASE 5: Chat & Skill Execution
    # =========================================================
    print("\n💬 Phase 5: Chat & Skill Execution")

    if project_id:
        test("Chat — analyze interviews", lambda: chat_message(client, project_id,
             "Analyze the interview transcripts I uploaded. Focus on onboarding pain points."))

        test("Chat — competitive analysis", lambda: chat_message(client, project_id,
             "Run a competitive analysis based on the competitive_analysis.md file."))

        test("Chat — create personas", lambda: chat_message(client, project_id,
             "Create personas from the research data."))

        test("Chat — thematic analysis", lambda: chat_message(client, project_id,
             "Run thematic analysis on all the interview data."))

        test("Chat — general question", lambda: chat_message(client, project_id,
             "What are the top 3 pain points we've found so far?"))

        test("Direct skill execute — survey design", lambda: assert_ok(client.post(
            "/api/skills/survey-design/execute", json={
                "project_id": project_id,
                "user_context": "Design a follow-up survey about onboarding satisfaction",
            })))

        test("Direct skill plan — user interviews", lambda: assert_ok(client.post(
            "/api/skills/user-interviews/plan", json={
                "project_id": project_id,
                "user_context": "Plan round 2 interviews focusing on the phone verification drop-off",
            })))

    # =========================================================
    # PHASE 6: Findings Verification
    # =========================================================
    print("\n🔍 Phase 6: Findings Verification")

    if project_id:
        test("List nuggets", lambda: assert_ok(client.get(f"/api/findings/nuggets?project_id={project_id}")))
        test("List facts", lambda: assert_ok(client.get(f"/api/findings/facts?project_id={project_id}")))
        test("List insights", lambda: assert_ok(client.get(f"/api/findings/insights?project_id={project_id}")))
        test("List recommendations", lambda: assert_ok(client.get(f"/api/findings/recommendations?project_id={project_id}")))
        test("Findings summary", lambda: assert_ok(client.get(f"/api/findings/summary/{project_id}")))
        test("Project search", lambda: assert_ok(client.get(f"/api/findings/search/{project_id}?query=phone+verification")))
        test("Global search", lambda: assert_ok(client.get("/api/findings/search/global?query=onboarding")))

    # =========================================================
    # PHASE 7: Tasks & Kanban
    # =========================================================
    print("\n📋 Phase 7: Tasks & Kanban")

    if project_id:
        task1 = test("Create task — analyze surveys", lambda: assert_ok(client.post("/api/tasks", json={
            "project_id": project_id,
            "title": "Analyze survey responses for AI-generated answers",
            "description": "Run the survey AI detection skill on our 20 survey responses",
            "skill_name": "survey-ai-detection",
        })))

        task2 = test("Create task — journey map", lambda: assert_ok(client.post("/api/tasks", json={
            "project_id": project_id,
            "title": "Create user journey map for onboarding flow",
            "skill_name": "journey-mapping",
        })))

        if task1:
            test("Move task to in_progress", lambda: assert_ok(client.post(
                f"/api/tasks/{task1['id']}/move?status=in_progress")))

        test("List all tasks", lambda: assert_ok(client.get(f"/api/tasks?project_id={project_id}")))

    # =========================================================
    # PHASE 8: Metrics & History
    # =========================================================
    print("\n📊 Phase 8: Metrics & History")

    if project_id:
        test("Project metrics", lambda: assert_ok(client.get(f"/api/metrics/{project_id}")))
        test("Version history", lambda: assert_ok(client.get(f"/api/projects/{project_id}/versions")))
        test("Chat history", lambda: assert_ok(client.get(f"/api/chat/history/{project_id}")))

    # =========================================================
    # PHASE 9: Skills Registry
    # =========================================================
    print("\n🧩 Phase 9: Skills")

    test("List all skills", lambda: assert_ok(client.get("/api/skills")))
    test("Skill registry", lambda: assert_ok(client.get("/api/skill-registry")))
    test("Skill health", lambda: assert_ok(client.get("/api/skills/health/all")))

    # =========================================================
    # PHASE 10: Agents & Audit
    # =========================================================
    print("\n🤖 Phase 10: Agents & Audit")

    test("Agent status", lambda: assert_ok(client.get("/api/agents/status")))
    test("List agents", lambda: assert_ok(client.get("/api/agents")))
    test("DevOps audit latest", lambda: assert_ok(client.get("/api/audit/devops/latest")))
    test("UI audit latest", lambda: assert_ok(client.get("/api/audit/ui/latest")))
    test("UX eval latest", lambda: assert_ok(client.get("/api/audit/ux/latest")))
    test("Sim test latest", lambda: assert_ok(client.get("/api/audit/sim/latest")))
    test("Context documents", lambda: assert_ok(client.get("/api/contexts")))

    # =========================================================
    # PHASE 11: Frontend Check
    # =========================================================
    print("\n🌐 Phase 11: Frontend")

    try:
        frontend = httpx.get("http://localhost:3000", timeout=10)
        test("Frontend serves HTML", lambda: assert_true(frontend.status_code == 200 and "<html" in frontend.text.lower()))
    except Exception:
        test("Frontend serves HTML", lambda: (_ for _ in ()).throw(Exception("Frontend not reachable at localhost:3000")))

    # =========================================================
    # RESULTS
    # =========================================================
    elapsed = time.time() - start_time
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")

    print("\n" + "=" * 60)
    print(f"🐾 Results: {passed} passed, {failed} failed, {len(results)} total")
    print(f"⏱️  Time: {elapsed:.1f}s")
    print("=" * 60)

    # Write report
    report_path = Path(__file__).parent.parent / "docs" / "e2e-test-report.md"
    write_report(report_path, elapsed)

    print(f"\n📄 Report: {report_path}")

    return 0 if failed == 0 else 1


def assert_ok(response):
    """Assert HTTP response is successful and return JSON."""
    if response.status_code >= 400:
        raise Exception(f"HTTP {response.status_code}: {response.text[:200]}")
    return response.json()


def assert_true(condition):
    if not condition:
        raise Exception("Assertion failed")
    return True


def upload_file(client, project_id, file_path):
    """Upload a file to a project."""
    with open(file_path, "rb") as f:
        response = client.post(
            f"/api/files/upload/{project_id}",
            files={"file": (file_path.name, f, "application/octet-stream")},
        )
    if response.status_code >= 400:
        raise Exception(f"Upload failed: {response.status_code}")
    return response.json()


def chat_message(client, project_id, message):
    """Send a chat message and collect the streamed response."""
    response = client.post("/api/chat", json={
        "message": message,
        "project_id": project_id,
    }, timeout=120.0)

    if response.status_code >= 400:
        raise Exception(f"Chat failed: {response.status_code}: {response.text[:200]}")

    # Parse SSE stream
    full_response = ""
    for line in response.text.split("\n"):
        if line.startswith("data: "):
            try:
                data = json.loads(line[6:])
                if data.get("type") == "chunk":
                    full_response += data.get("content", "")
                elif data.get("type") == "error":
                    raise Exception(f"Chat error: {data.get('message')}")
            except json.JSONDecodeError:
                pass

    if not full_response:
        raise Exception("Empty chat response")

    return {"response_length": len(full_response), "preview": full_response[:100]}


def write_report(path, elapsed):
    """Write the test report as Markdown."""
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")

    lines = [
        "# ReClaw — End-to-End Test Report",
        "",
        f"**Date:** {time.strftime('%Y-%m-%d %H:%M')}",
        f"**Duration:** {elapsed:.1f}s",
        f"**Results:** {passed} passed, {failed} failed, {len(results)} total",
        f"**Pass Rate:** {passed / max(len(results), 1) * 100:.0f}%",
        "",
        "---",
        "",
    ]

    # Group by phase
    current_phase = ""
    for r in results:
        phase = r["name"].split(" — ")[0] if " — " in r["name"] else ""
        if phase != current_phase:
            current_phase = phase
            lines.append(f"## {phase or 'Tests'}")
            lines.append("")

        icon = "✅" if r["status"] == "PASS" else "❌"
        lines.append(f"- {icon} **{r['name']}**")
        if r["status"] == "FAIL":
            lines.append(f"  - Error: `{r['detail']}`")
        lines.append("")

    # Failures summary
    failures = [r for r in results if r["status"] == "FAIL"]
    if failures:
        lines.extend(["## ❌ Failures", ""])
        for f in failures:
            lines.append(f"### {f['name']}")
            lines.append(f"```\n{f['detail']}\n```")
            lines.append("")

    lines.extend([
        "---",
        "",
        f"*Generated by ReClaw E2E test suite • {time.strftime('%Y-%m-%d')}*",
    ])

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines))


if __name__ == "__main__":
    sys.exit(main())
