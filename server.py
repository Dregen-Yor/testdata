
from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Literal
from datetime import datetime
from uuid import uuid4
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from subprocess import run as _run, PIPE
import shlex

# ----- Paths -----
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DATA_FILE = DATA_DIR / "problems.json"
CONTESTS_FILE = DATA_DIR / "contests.json"
FRONTEND_DIR = BASE_DIR / "frontend"
SOLUTIONS_DIR = DATA_DIR / "solutions"
SOLUTIONS_DIR.mkdir(exist_ok=True)

# Ensure data file exists
if not DATA_FILE.exists():
    DATA_FILE.write_text("[]", encoding="utf-8")
if not CONTESTS_FILE.exists():
    CONTESTS_FILE.write_text("[]", encoding="utf-8")

# Thread-safe read/write
_lock = Lock()

def _load() -> List[dict]:
    with _lock:
        try:
            items = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            # If file is corrupted, back it up and start fresh
            backup = DATA_FILE.with_suffix(".backup.json")
            backup.write_text(DATA_FILE.read_text(encoding="utf-8"), encoding="utf-8")
            DATA_FILE.write_text("[]", encoding="utf-8")
            items = []

        changed = False
        normalized_items: List[dict] = []
        for rec in items:
            rec = dict(rec)
            # migrate any legacy solution fields into markdown files
            content = None
            for key in ('solution_markdown', 'solution_md', 'solution'):
                if key in rec and rec[key]:
                    content = rec.pop(key)
                    changed = True
                    break
            if content and rec.get('id'):
                _write_solution(str(rec['id']), str(content))
            # drop deprecated or computed fields before normalization
            if rec.pop('has_solution', None) is not None:
                changed = True
            normalized_items.append(normalize_record(rec))

        if changed:
            sanitized = []
            for rec in normalized_items:
                clean = dict(rec)
                clean.pop('has_solution', None)
                sanitized.append(clean)
            DATA_FILE.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")

    # attach solution presence flag outside of lock
    for rec in normalized_items:
        pid = rec.get('id')
        if pid:
            rec['has_solution'] = _solution_exists(str(pid))
        else:
            rec['has_solution'] = False
    return normalized_items

def _save(items: List[dict]) -> None:
    # save already-normalized items
    with _lock:
        sanitized = []
        for rec in items:
            rec = dict(rec)
            rec.pop('has_solution', None)
            sanitized.append(rec)
        DATA_FILE.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")


def _solution_path(problem_id: str) -> Path:
    return SOLUTIONS_DIR / f"{problem_id}.md"


def _solution_exists(problem_id: str) -> bool:
    return _solution_path(problem_id).exists()


def _read_solution(problem_id: str) -> Optional[str]:
    path = _solution_path(problem_id)
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def _write_solution(problem_id: str, markdown: str) -> None:
    path = _solution_path(problem_id)
    path.write_text(markdown, encoding="utf-8")


def _delete_solution(problem_id: str) -> None:
    path = _solution_path(problem_id)
    if path.exists():
        path.unlink()


def _load_and_find_problem(pid: str) -> tuple[List[dict], dict]:
    items = _load()
    for rec in items:
        if rec.get('id') == pid:
            return items, rec
    raise HTTPException(status_code=404, detail="Problem not found")

def normalize_record(rec: dict) -> dict:
    """Back-compat normalization: ensure new fields exist and drop deprecated ones.
    - solved: bool (default False); if legacy status == 'Done', set True
    - unsolved_stage: Optional[str]
    - tags: list[str]
    - pass_count: Optional[int]
    - assignee: Optional[str]
    - drop 'owner'
    """
    rec = dict(rec)
    rec.pop('has_solution', None)
    owner = rec.pop('owner', None)
    if 'solved' not in rec:
        status = str(rec.get('status') or '').lower()
        rec['solved'] = True if status == 'done' else False
    if 'unsolved_stage' not in rec:
        rec['unsolved_stage'] = None
    else:
        stage = rec.get('unsolved_stage')
        if stage not in {"未看题", "已看题无思路", "知道做法未实现"}:
            rec['unsolved_stage'] = None
    custom_label = rec.get('unsolved_custom_label')
    if custom_label is not None:
        custom_label = str(custom_label).strip() or None
    rec['unsolved_custom_label'] = None if rec.get('solved') else custom_label
    if 'tags' not in rec or rec['tags'] is None:
        rec['tags'] = []
    try:
        if 'pass_count' in rec and rec['pass_count'] is not None:
            rec['pass_count'] = int(rec['pass_count'])
    except Exception:
        rec['pass_count'] = None
    assignee = rec.get('assignee')
    if assignee is None and owner:
        assignee = owner
    if assignee is not None:
        assignee = str(assignee).strip() or None
    rec['assignee'] = assignee
    if rec.get('solved'):
        rec['unsolved_stage'] = None
        rec['unsolved_custom_label'] = None
    return rec

# ----- Models -----
UnsolvedStage = Literal["未看题", "已看题无思路", "知道做法未实现"]

class ProblemIn(BaseModel):
    title: str = Field(..., min_length=1, description="题目标题")
    link: Optional[HttpUrl] = Field(None, description="题目链接")
    source: Optional[str] = Field(None, description="来源（Codeforces/AtCoder/Luogu等）")
    tags: List[str] = Field(default_factory=list, description="标签列表")
    assignee: Optional[str] = Field(None, description="当前补题人")
    solved: bool = Field(default=False, description="是否已解决")
    unsolved_stage: Optional[UnsolvedStage] = Field(default=None, description="未解决阶段分类")
    unsolved_custom_label: Optional[str] = Field(default=None, description="未解决自定义标签")
    pass_count: Optional[int] = Field(default=None, ge=0, description="场上通过人数（越多越简单）")
    notes: Optional[str] = Field(None, description="备注")

    @field_validator('source', 'assignee', 'unsolved_custom_label', mode='before')
    @classmethod
    def _strip_optional_text(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator('notes', mode='before')
    @classmethod
    def _strip_notes(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v

    @model_validator(mode='after')
    def _clear_unsolved_when_solved(cls, values):
        if values.solved:
            values.unsolved_stage = None
            values.unsolved_custom_label = None
        return values

class Problem(ProblemIn):
    id: str
    created_at: str
    updated_at: str
    has_solution: bool = False

# ----- FastAPI app -----
app = FastAPI(title="ACM Problem Tracker", version="1.1.0")

# Allow same-origin and localhost usage
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



class GitPushIn(BaseModel):
    message: str = "update problems"
    files: Optional[List[str]] = None
    add_all: bool = False


class GitPullIn(BaseModel):
    remote: str = "origin"
    branch: str = "main"

def _sh(cmd: str, cwd: Path = BASE_DIR):
    p = _run(cmd, shell=True, cwd=str(cwd), stdout=PIPE, stderr=PIPE, text=True)
    return {"returncode": p.returncode, "stdout": p.stdout, "stderr": p.stderr, "cmd": cmd}

def _git_in_repo() -> bool:
    r = _sh("git rev-parse --is-inside-work-tree")
    return r["returncode"] == 0 and r["stdout"].strip() == "true"

def _git_current_branch() -> Optional[str]:
    r = _sh("git rev-parse --abbrev-ref HEAD")
    return r["stdout"].strip() if r["returncode"] == 0 else None

# ----- Contest Models -----
ContestStatus = Literal["ac", "attempted", "unsubmitted"]

class ContestProblemIn(BaseModel):
    letter: Optional[str] = Field(None, description="A,B,C...")
    pass_count: int = Field(0, ge=0, description="通过人数")
    attempt_count: int = Field(0, ge=0, description="尝试人数")
    my_status: ContestStatus = Field("unsubmitted", description="本队本题状态")

class ContestIn(BaseModel):
    name: str = Field(..., min_length=1, description="比赛名称")
    total_problems: int = Field(..., ge=1, le=15, description="题目数量(≤15)")
    problems: List[ContestProblemIn] = Field(default_factory=list, description="题目数据 A..")
    rank_str: Optional[str] = Field(None, description="形如 a/b 的排名")
    summary: Optional[str] = Field(None, description="赛后总结")

class Contest(ContestIn):
    id: str
    created_at: str
    updated_at: str


class SolutionPayload(BaseModel):
    markdown: Optional[str] = None

def _load_contests() -> List[dict]:
    with _lock:
        try:
            raw = CONTESTS_FILE.read_text(encoding="utf-8")
        except FileNotFoundError:
            CONTESTS_FILE.write_text("[]", encoding="utf-8")
            raw = "[]"
        try:
            items = json.loads(raw)
        except json.JSONDecodeError:
            backup = CONTESTS_FILE.with_suffix(".backup.json")
            backup.write_text(raw, encoding="utf-8")
            CONTESTS_FILE.write_text("[]", encoding="utf-8")
            items = []
    return [normalize_contest(it) for it in items]

def _save_contests(items: List[dict]) -> None:
    with _lock:
        CONTESTS_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

def normalize_contest(rec: dict) -> dict:
    rec = dict(rec)
    try:
        rec['total_problems'] = max(1, min(15, int(rec.get('total_problems') or 1)))
    except Exception:
        rec['total_problems'] = 1
    probs = rec.get('problems') or []
    out = []
    for i in range(rec['total_problems']):
        base = {'letter': LETTERS[i], 'pass_count': 0, 'attempt_count': 0, 'my_status': 'unsubmitted'}
        if i < len(probs) and isinstance(probs[i], dict):
            d = dict(base)
            d.update({k: probs[i].get(k, v) for k, v in base.items()})
            try: d['pass_count'] = int(d.get('pass_count') or 0)
            except Exception: d['pass_count'] = 0
            try: d['attempt_count'] = int(d.get('attempt_count') or 0)
            except Exception: d['attempt_count'] = 0
            if d.get('my_status') not in ('ac','attempted','unsubmitted'):
                d['my_status'] = 'unsubmitted'
            out.append(d)
        else:
            out.append(base)
    rec['problems'] = out
    return rec

# ----- API Routes -----
@app.get("/api/problems", response_model=List[Problem])
def list_problems():
    return _load()

@app.post("/api/problems", response_model=Problem)
def create_problem(item: ProblemIn):
    now = datetime.utcnow().isoformat() + "Z"
    # If solved is True, clear unsolved_stage
    data = item.model_dump(mode="json")
    if data.get("solved"):
        data["unsolved_stage"] = None
        data["unsolved_custom_label"] = None
    rec = Problem(
        id=str(uuid4()),
        created_at=now,
        updated_at=now,
        **data
    ).model_dump(mode="json")
    items = _load()
    items.append(rec)
    _save(items)
    rec['has_solution'] = _solution_exists(rec['id'])
    return rec

@app.put("/api/problems/{pid}", response_model=Problem)
def update_problem(pid: str, item: ProblemIn):
    items = _load()
    for i, rec in enumerate(items):
        if rec["id"] == pid:
            data = item.model_dump(mode="json")
            if data.get("solved"):
                data["unsolved_stage"] = None
                data["unsolved_custom_label"] = None
            rec.update(data)
            rec["updated_at"] = datetime.utcnow().isoformat() + "Z"
            items[i] = normalize_record(rec)
            _save(items)
            items[i]['has_solution'] = _solution_exists(pid)
            return items[i]
    raise HTTPException(status_code=404, detail="Problem not found")

@app.delete("/api/problems/{pid}", response_model=dict)
def delete_problem(pid: str):
    items = _load()
    new_items = [rec for rec in items if rec["id"] != pid]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Problem not found")
    _save(new_items)
    _delete_solution(pid)
    return {"ok": True, "deleted_id": pid}

@app.get("/api/export", response_model=List[Problem])
def export_json():
    items = _load()
    out = []
    for rec in items:
        data = dict(rec)
        sol = _read_solution(rec['id']) if rec.get('id') else None
        if sol:
            data['solution_markdown'] = sol
        data.pop('has_solution', None)
        out.append(data)
    return out

@app.post("/api/import", response_model=dict)
def import_json(payload: List[Problem]):
    # Replace the whole dataset (keeps a backup)
    backup = DATA_FILE.with_suffix(".bak.json")
    backup.write_text(DATA_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    # Normalize incoming payload
    items = []
    for rec in payload:  # type: ignore[arg-type]
        if isinstance(rec, BaseModel):
            rec = rec.model_dump(mode="json")
        else:
            rec = dict(rec)
        content = None
        for key in ('solution_markdown', 'solution_md', 'solution'):
            if key in rec and rec[key]:
                content = rec.pop(key)
                break
        normalized = normalize_record(rec)
        items.append(normalized)
        if content and normalized.get('id'):
            _write_solution(str(normalized['id']), str(content))
    _save(items)
    return {"ok": True, "replaced_count": len(items)}


@app.get("/api/problems/{pid}/solution", response_model=dict)
def get_solution(pid: str):
    _, problem = _load_and_find_problem(pid)
    markdown = _read_solution(pid) or ""
    return {
        "id": pid,
        "markdown": markdown,
        "has_solution": bool(markdown),
        "updated_at": problem.get("updated_at"),
    }


@app.put("/api/problems/{pid}/solution", response_model=dict)
def put_solution(pid: str, payload: SolutionPayload):
    items, problem = _load_and_find_problem(pid)
    markdown = (payload.markdown or "").replace("\r\n", "\n")
    if markdown.strip():
        _write_solution(pid, markdown)
        has_solution = True
    else:
        _delete_solution(pid)
        has_solution = False
        markdown = ""
    problem['has_solution'] = has_solution
    problem['updated_at'] = datetime.utcnow().isoformat() + "Z"
    _save(items)
    return {
        "ok": True,
        "has_solution": has_solution,
        "updated_at": problem['updated_at'],
    }


@app.delete("/api/problems/{pid}/solution", response_model=dict)
def delete_solution_endpoint(pid: str):
    items, problem = _load_and_find_problem(pid)
    _delete_solution(pid)
    problem['has_solution'] = False
    problem['updated_at'] = datetime.utcnow().isoformat() + "Z"
    _save(items)
    return {"ok": True}

# ----- Static hosting for frontend -----

@app.post("/api/git/push", response_model=dict)
def git_push(payload: GitPushIn):
    if not _git_in_repo():
        return {"ok": False, "error": "not_a_git_repo", "hint": "请先在项目根目录 git init，并设置远程仓库（git remote add origin ...）"}

    # Stage files
    if payload.add_all or not payload.files:
        a = _sh("git add -A")
    else:
        to_add = " ".join(shlex.quote(f) for f in payload.files)
        a = _sh(f"git add {to_add}")
    if a["returncode"] != 0:
        return {"ok": False, "step": "add", **a}

    # If nothing to commit, exit early
    diff = _sh("git diff --cached --name-only")
    if diff["returncode"] != 0:
        return {"ok": False, "step": "diff", **diff}
    if not diff["stdout"].strip():
        return {"ok": False, "error": "no_changes", "hint": "没有需要提交的更改"}

    # Commit
    msg = payload.message.replace('"', '\\"')
    c = _sh(f'git commit -m "{msg}"')
    if c["returncode"] != 0:
        return {"ok": False, "step": "commit", **c}

    # Push
    p = _sh("git push")
    if p["returncode"] == 0:
        return {"ok": True, "step": "push", **p}

    # Try setting upstream if needed
    branch = _git_current_branch() or "main"
    p2 = _sh(f"git push -u origin {branch}")
    if p2["returncode"] == 0:
        return {"ok": True, "step": "push_upstream", **p2}

    return {"ok": False, "step": "push", "try": ["git push", f"git push -u origin {branch}"], "first": p, "second": p2}


@app.post("/api/git/pull", response_model=dict)
def git_pull(payload: GitPullIn = GitPullIn()):
    if not _git_in_repo():
        return {"ok": False, "error": "not_a_git_repo", "hint": "请先在项目根目录 git init，并设置远程仓库"}

    remote = payload.remote.strip() or "origin"
    branch = payload.branch.strip() or "main"
    result = _sh(f"git pull {shlex.quote(remote)} {shlex.quote(branch)}")
    if result["returncode"] == 0:
        return {"ok": True, **result}
    return {"ok": False, **result}

@app.get("/api/contests", response_model=List[Contest])
def list_contests():
    return _load_contests()

@app.get("/api/contests/{cid}", response_model=Contest)
def get_contest(cid: str):
    items = _load_contests()
    for it in items:
        if it["id"] == cid:
            return it
    raise HTTPException(status_code=404, detail="Contest not found")

@app.post("/api/contests", response_model=Contest)
def create_contest(item: ContestIn):
    now = datetime.utcnow().isoformat() + "Z"
    data = normalize_contest(item.model_dump(mode="json"))
    rec = Contest(
        id=str(uuid4()),
        created_at=now,
        updated_at=now,
        **data
    ).model_dump(mode="json")
    items = _load_contests()
    items.append(rec)
    _save_contests(items)
    return rec

@app.put("/api/contests/{cid}", response_model=Contest)
def update_contest(cid: str, item: ContestIn):
    items = _load_contests()
    for i, rec in enumerate(items):
        if rec["id"] == cid:
            data = normalize_contest(item.model_dump(mode="json"))
            rec.update(data)
            rec["updated_at"] = datetime.utcnow().isoformat() + "Z"
            items[i] = normalize_contest(rec)
            _save_contests(items)
            return items[i]
    raise HTTPException(status_code=404, detail="Contest not found")

@app.delete("/api/contests/{cid}", response_model=dict)
def delete_contest(cid: str):
    items = _load_contests()
    new_items = [rec for rec in items if rec["id"] != cid]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Contest not found")
    _save_contests(new_items)
    return {"ok": True, "deleted_id": cid}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

# ----- Dev helper -----
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
