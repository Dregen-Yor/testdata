"""
Git utilities for ACM Compass
Handles version control operations for the data directory
"""
import json
from pathlib import Path
from subprocess import run as _run, PIPE
from datetime import datetime
from typing import Optional

from .data_manager import BASE_DIR, DATA_DIR

# Git configuration cache file
GIT_CONFIG_FILE = BASE_DIR / ".git_config.json"


def _sh(cmd: str, cwd: Path = DATA_DIR) -> dict:
    """Execute shell command in data directory and return result"""
    p = _run(cmd, shell=True, cwd=str(cwd), stdout=PIPE, stderr=PIPE, text=True)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout,
        "stderr": p.stderr,
        "cmd": cmd
    }


def load_git_config() -> dict:
    """Load git configuration from cache file"""
    if GIT_CONFIG_FILE.exists():
        try:
            data = json.loads(GIT_CONFIG_FILE.read_text(encoding="utf-8"))
            return data
        except Exception:
            pass
    return {"repo_url": "", "branch": "main"}


def save_git_config(repo_url: str, branch: str = "main") -> None:
    """Save git configuration to cache file"""
    config = {
        "repo_url": repo_url.strip(),
        "branch": branch.strip(),
        "last_updated": datetime.now().isoformat()
    }
    GIT_CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def is_data_git_repo() -> bool:
    """Check if data directory is a git repository"""
    r = _sh("git rev-parse --is-inside-work-tree", cwd=DATA_DIR)
    return r["returncode"] == 0 and r["stdout"].strip() == "true"


def get_current_branch() -> Optional[str]:
    """Get current git branch name in data directory"""
    r = _sh("git rev-parse --abbrev-ref HEAD", cwd=DATA_DIR)
    return r["stdout"].strip() if r["returncode"] == 0 else None


def init_data_repo(repo_url: str, branch: str = "main") -> str:
    """Initialize data directory as a git repository and configure remote"""
    output = ""

    # Check if already a git repo
    if is_data_git_repo():
        output += "ℹ️  data/ 目录已经是 Git 仓库\n\n"
    else:
        # Initialize git repo
        output += "=== 初始化 Git 仓库 ===\n"
        result = _sh("git init", cwd=DATA_DIR)
        output += f"{result['stdout']}\n"
        if result['returncode'] != 0:
            output += f"stderr: {result['stderr']}\n"
            output += "\n❌ Git 初始化失败"
            return output
        output += "✓ Git 仓库初始化成功\n\n"

    # Configure remote
    if not repo_url or not repo_url.strip():
        output += "⚠️  未提供仓库地址，跳过远程配置\n"
        return output

    output += "=== 配置远程仓库 ===\n"

    # Check if remote 'origin' exists
    check_remote = _sh("git remote get-url origin", cwd=DATA_DIR)

    if check_remote['returncode'] == 0:
        # Remote exists, update it
        result = _sh(f"git remote set-url origin {repo_url}", cwd=DATA_DIR)
        output += f"更新远程仓库地址: {repo_url}\n"
    else:
        # Remote doesn't exist, add it
        result = _sh(f"git remote add origin {repo_url}", cwd=DATA_DIR)
        output += f"添加远程仓库: {repo_url}\n"

    if result['returncode'] != 0:
        output += f"stderr: {result['stderr']}\n"
        output += "\n❌ 远程仓库配置失败"
        return output

    # Save configuration
    save_git_config(repo_url, branch)
    output += f"✓ 远程仓库配置成功\n"
    output += f"✓ 配置已保存到缓存\n"

    return output


def git_pull(repo_url: str, branch: str = "main") -> str:
    """Execute git pull for data directory and return formatted output"""
    output = ""

    # Ensure repo is initialized
    if not is_data_git_repo():
        output += init_data_repo(repo_url, branch)
        output += "\n"
    else:
        # Update remote if provided
        if repo_url and repo_url.strip():
            result = _sh(f"git remote set-url origin {repo_url}", cwd=DATA_DIR)
            save_git_config(repo_url, branch)

    # Check if remote is configured
    check_remote = _sh("git remote get-url origin", cwd=DATA_DIR)
    if check_remote['returncode'] != 0:
        output += "❌ 远程仓库未配置\n请先输入仓库地址"
        return output

    # Pull from remote
    output += f"=== git pull origin {branch} ===\n"
    result = _sh(f"git pull origin {branch}", cwd=DATA_DIR)
    output += f"Return code: {result['returncode']}\n\n"
    output += f"stdout:\n{result['stdout']}\n\n"

    if result['stderr']:
        output += f"stderr:\n{result['stderr']}\n"

    if result['returncode'] == 0:
        output += "\n✓ 成功拉取远程更新"
    else:
        # Try with --allow-unrelated-histories for first pull
        output += "\n第一次拉取？尝试使用 --allow-unrelated-histories...\n"
        result2 = _sh(f"git pull origin {branch} --allow-unrelated-histories", cwd=DATA_DIR)
        output += f"\n{result2['stdout']}\n"
        if result2['returncode'] == 0:
            output += "\n✓ 成功拉取远程更新"
        else:
            output += "\n❌ 拉取失败"

    return output


def git_push(repo_url: str, message: Optional[str] = None, branch: str = "main") -> str:
    """Execute git add, commit, and push for data directory. Return formatted output"""
    output = ""

    # Ensure repo is initialized
    if not is_data_git_repo():
        output += init_data_repo(repo_url, branch)
        output += "\n"
    else:
        # Update remote if provided
        if repo_url and repo_url.strip():
            result = _sh(f"git remote set-url origin {repo_url}", cwd=DATA_DIR)
            save_git_config(repo_url, branch)

    # Check if remote is configured
    check_remote = _sh("git remote get-url origin", cwd=DATA_DIR)
    if check_remote['returncode'] != 0:
        output += "❌ 远程仓库未配置\n请先输入仓库地址"
        return output

    if not message or not message.strip():
        message = f"update data ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})"

    # git add
    output += "=== git add -A ===\n"
    result = _sh("git add -A", cwd=DATA_DIR)
    output += f"Return code: {result['returncode']}\n"
    if result['returncode'] != 0:
        output += f"stderr: {result['stderr']}\n"
        output += "\n❌ git add 失败"
        return output

    # Check if there are changes
    diff = _sh("git diff --cached --name-only", cwd=DATA_DIR)
    if not diff['stdout'].strip():
        return "ℹ️ 没有需要提交的更改"

    output += f"\nChanged files:\n{diff['stdout']}\n"

    # git commit
    output += "\n=== git commit ===\n"
    msg_escaped = message.replace('"', '\\"')
    result = _sh(f'git commit -m "{msg_escaped}"', cwd=DATA_DIR)
    output += f"Return code: {result['returncode']}\n"
    output += f"stdout: {result['stdout']}\n"
    if result['returncode'] != 0:
        output += f"stderr: {result['stderr']}\n"
        output += "\n❌ git commit 失败"
        return output

    # git push
    output += f"\n=== git push origin {branch} ===\n"
    result = _sh(f"git push origin {branch}", cwd=DATA_DIR)
    output += f"Return code: {result['returncode']}\n"
    output += f"stdout: {result['stdout']}\n"

    if result['returncode'] == 0:
        output += "\n✓ 成功推送到远程"
        return output

    # Try with upstream
    output += f"\nTrying: git push -u origin {branch}\n"
    result = _sh(f"git push -u origin {branch}", cwd=DATA_DIR)
    output += f"Return code: {result['returncode']}\n"
    output += f"stdout: {result['stdout']}\n"

    if result['stderr']:
        output += f"stderr: {result['stderr']}\n"

    if result['returncode'] == 0:
        output += "\n✓ 成功推送到远程（设置上游分支）"
    else:
        output += "\n❌ 推送失败"

    return output


def get_repo_status() -> str:
    """Get current repository status information"""
    if not is_data_git_repo():
        return "📂 data/ 目录尚未初始化为 Git 仓库"

    output = "📂 Data 仓库状态\n\n"

    # Get current branch
    branch = get_current_branch()
    if branch:
        output += f"🌿 当前分支: {branch}\n"

    # Get remote URL
    remote = _sh("git remote get-url origin", cwd=DATA_DIR)
    if remote['returncode'] == 0:
        output += f"🔗 远程仓库: {remote['stdout'].strip()}\n"
    else:
        output += "🔗 远程仓库: 未配置\n"

    # Get status
    status = _sh("git status --short", cwd=DATA_DIR)
    if status['stdout'].strip():
        output += f"\n📝 未提交的更改:\n{status['stdout']}"
    else:
        output += "\n✅ 工作目录干净"

    return output
