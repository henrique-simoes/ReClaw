"""Codebook CRUD API routes for qualitative coding."""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.codebook import Codebook, Code
from app.models.database import get_db

router = APIRouter()


# --- Request / Response schemas ---

class CodebookCreate(BaseModel):
    project_id: str
    name: str
    description: str = ""
    approach: str = "inductive"


class CodebookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    approach: str | None = None
    status: str | None = None


class CodeCreate(BaseModel):
    codebook_id: str
    name: str
    definition: str = ""
    inclusion_criteria: str = ""
    exclusion_criteria: str = ""
    examples: list[str] = []
    code_type: str = "descriptive"
    parent_code_id: str | None = None


class CodeUpdate(BaseModel):
    name: str | None = None
    definition: str | None = None
    inclusion_criteria: str | None = None
    exclusion_criteria: str | None = None
    examples: list[str] | None = None
    code_type: str | None = None
    parent_code_id: str | None = None
    frequency: int | None = None
    kappa: float | None = None


# --- Codebook endpoints ---

@router.get("/codebooks")
async def list_codebooks(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List codebooks for a project."""
    result = await db.execute(
        select(Codebook)
        .where(Codebook.project_id == project_id)
        .options(selectinload(Codebook.codes))
        .order_by(Codebook.created_at.desc())
    )
    codebooks = result.scalars().all()
    return [cb.to_dict() for cb in codebooks]


@router.post("/codebooks", status_code=201)
async def create_codebook(data: CodebookCreate, db: AsyncSession = Depends(get_db)):
    """Create a new codebook."""
    codebook = Codebook(
        id=str(uuid.uuid4()),
        project_id=data.project_id,
        name=data.name,
        description=data.description,
        approach=data.approach,
    )
    db.add(codebook)
    await db.commit()
    await db.refresh(codebook)
    return codebook.to_dict()


@router.get("/codebooks/{codebook_id}")
async def get_codebook(codebook_id: str, db: AsyncSession = Depends(get_db)):
    """Get a codebook with all its codes."""
    result = await db.execute(
        select(Codebook)
        .where(Codebook.id == codebook_id)
        .options(selectinload(Codebook.codes))
    )
    codebook = result.scalar_one_or_none()
    if not codebook:
        raise HTTPException(status_code=404, detail="Codebook not found")
    data = codebook.to_dict()
    data["codes"] = [c.to_dict() for c in codebook.codes]
    return data


@router.patch("/codebooks/{codebook_id}")
async def update_codebook(
    codebook_id: str, data: CodebookUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a codebook."""
    result = await db.execute(select(Codebook).where(Codebook.id == codebook_id))
    codebook = result.scalar_one_or_none()
    if not codebook:
        raise HTTPException(status_code=404, detail="Codebook not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(codebook, field, value)
    await db.commit()
    await db.refresh(codebook)
    return codebook.to_dict()


@router.delete("/codebooks/{codebook_id}", status_code=204)
async def delete_codebook(codebook_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a codebook and all its codes."""
    result = await db.execute(select(Codebook).where(Codebook.id == codebook_id))
    codebook = result.scalar_one_or_none()
    if not codebook:
        raise HTTPException(status_code=404, detail="Codebook not found")
    await db.delete(codebook)
    await db.commit()


# --- Code endpoints ---

@router.post("/codes", status_code=201)
async def create_code(data: CodeCreate, db: AsyncSession = Depends(get_db)):
    """Add a code to a codebook."""
    code = Code(
        id=str(uuid.uuid4()),
        codebook_id=data.codebook_id,
        name=data.name,
        definition=data.definition,
        inclusion_criteria=data.inclusion_criteria,
        exclusion_criteria=data.exclusion_criteria,
        examples=json.dumps(data.examples),
        code_type=data.code_type,
        parent_code_id=data.parent_code_id,
    )
    db.add(code)
    await db.commit()
    await db.refresh(code)
    return code.to_dict()


@router.patch("/codes/{code_id}")
async def update_code(
    code_id: str, data: CodeUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a code."""
    result = await db.execute(select(Code).where(Code.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    update_data = data.model_dump(exclude_unset=True)
    if "examples" in update_data:
        update_data["examples"] = json.dumps(update_data["examples"])
    for field, value in update_data.items():
        setattr(code, field, value)
    await db.commit()
    await db.refresh(code)
    return code.to_dict()


@router.delete("/codes/{code_id}", status_code=204)
async def delete_code(code_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a code."""
    result = await db.execute(select(Code).where(Code.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    await db.delete(code)
    await db.commit()
