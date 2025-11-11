
# ACM 题目与比赛追踪（本地多人共用）

本项目提供一个开箱即用的本地 Web 工具：
- 前端（纯 HTML/JS/CSS）直接在浏览器里管理题目与比赛；
- 后端（FastAPI）托管静态页面并把数据落到 `data/*.json`；
- 用 Git 同步数据文件，天然支持多人协作与历史回溯。

## 功能亮点
- 题目管理三视图：全部（All）/ 未解决（Unsolved）/ 已解决（Solved）。
- 题解面板：Markdown + LaTeX 支持，内置代码高亮与题解预览。
- 比赛面板（Contests）：A..M 卡片式记录各题通过/尝试人数与本队状态（AC/attempted/unsubmitted），支持赛后总结与排名。
- 一键 Git 同步：网页内填写提交说明并推送（需本地已配置 Git 仓库与远程）。
- 纯文件存储：`data/problems.json` 与 `data/contests.json`，轻量、可读、易合并。
- 零外部依赖：无需数据库；后端同时托管前端，无需额外静态服务器。
- 跨平台一键启动脚本（Windows/macOS/Linux）。

## 快速开始

### 1) 安装依赖（需 Python 3.9+）
```bash
cd acm-tracker
python -m venv .venv
# macOS/Linux:
. .venv/bin/activate && pip install -r requirements.txt
# Windows CMD/PowerShell:
.venv\Scripts\pip install -r requirements.txt
```

### 2) 启动服务（默认 http://127.0.0.1:8000/）
```bash
# macOS/Linux:
uvicorn server:app --reload --port 8000
# 或直接：python server.py

# Windows:
.venv\Scripts\uvicorn server:app --reload --port 8000
# 或：.venv\Scripts\python server.py
```
打开浏览器访问 `http://127.0.0.1:8000/` 即可。

> 提示：后端已托管前端静态资源，无需另起本地静态服务器。

### 3) 一键启动（推荐）
- Windows(CMD)：双击 `quickstart.bat`
- Windows(PowerShell)：右键 `quickstart.ps1` → 以 PowerShell 运行
- macOS/Linux/WSL：在项目根目录运行 `./quickstart.sh`
- 更短命令：`./run`（若提示权限不足，可用 `bash run`）

脚本会自动：创建虚拟环境 → 安装依赖 → 打开浏览器 → 启动本地服务。

想要更短：添加一个别名（任选其一）
- bash：`echo "alias acm='bash ~/program/2025-Autumn/acm-tracker/run'" >> ~/.bashrc && source ~/.bashrc`
- zsh：`echo "alias acm='bash ~/program/2025-Autumn/acm-tracker/run'" >> ~/.zshrc && source ~/.zshrc`
之后直接输入 `acm` 即可启动。

## 页面导航
- 全部题目：`/index.html`
- 未解决：`/unsolved.html`（未看题 / 已看题无思路 / 知道做法未实现）
- 已解决：`/solved.html`
- 比赛面板：`/contests.html`

## 数据文件
- `data/problems.json`：题目清单（浏览器表单保存时自动更新）。
- `data/solutions/*.md`：每道题的题解 Markdown 文件，文件名为题目 `id`.md。
- `data/contests.json`：比赛记录（包含各题统计与状态、排名、赛后总结）。

把项目放入 Git 仓库，日常流程建议：
1) 开始前 `git pull`；2) 页面中增删改并保存；3) 提交并推送（见下文“一键 Git 同步”）；4) 结束后 `git push`。

## 一键 Git 同步（网页内）
在「All Problems」「Unsolved」「Solved」「Contests」页面顶部的“Git 同步”区域：
- 点击“获取远程更新”触发 `git pull origin main`（成功后页面数据会自动刷新）。
- 填写提交说明后点击“上传到 GitHub”，按钮会先自动执行 `git pull origin main`，随后执行等价于：
  - `git add -A` → `git commit -m "..."` → `git push`
- 若第一次推送且未设置上游分支，会尝试 `git push -u origin <当前分支>`。

若出现报错如“not_a_git_repo / no_changes / push 失败”，按提示在项目根目录完成 `git init`、`git remote add origin ...` 等配置，或确认确实有暂存的变更。

## 数据模型（与后端保持一致）

### Problem
字段：
- `title: str` 题目标题（必填）
- `link: HttpUrl | null` 题目链接
- `source: str | null` 来源（如 Codeforces/AtCoder/Luogu…）
- `tags: string[]` 标签列表
- `assignee: str | null` 当前补题人（负责跟进的队员）
- `solved: bool` 是否已解决（设为 true 时会自动清空 `unsolved_stage` 与 `unsolved_custom_label`）
- `unsolved_stage: "未看题" | "已看题无思路" | "知道做法未实现" | null`
- `unsolved_custom_label: str | null` 自定义的未解决补充标签（仅在未解决时保留）
- `pass_count: int | null` 场上通过人数（越多越简单）
- `notes: str | null` 备注
- `has_solution: bool` 是否已有题解文件（由服务端根据 `data/solutions/{id}.md` 推断，只读）
- 系统字段：`id: str`, `created_at: ISO8601`, `updated_at: ISO8601`

兼容性：历史数据中的 `status == "Done"` 会映射为 `solved = true`；旧字段 `owner` 已移除。

### 题解 Solution
- 每个题目可选配套 `data/solutions/{problem_id}.md` 文件，内容为 Markdown（含 LaTeX 公式、代码块）。
- Web 端在编辑题目时可直接录入题解，保存时后端会写入对应 `.md` 文件；为空时会删除文件。
- 导出 (`GET /api/export`) 时会自动把题解以 `solution_markdown` 字段附带在 JSON 中，导入时同名字段会被迁移成独立 Markdown 文件。

#### 使用方法
1. 打开任意题目页面（All/Unsolved/Solved），选中或新建题目，在表单底部的 **题解（Markdown + LaTeX）** 区域编写内容。
2. 点击「预览题解」可在弹窗中查看渲染效果（支持公式、代码高亮）。
3. 表单「保存」后，题解会写入 `data/solutions/<题目 id>.md`，并在列表中显示「题解」按钮；点击可随时查看。
4. 重新编辑想清空题解时，将文本框置空再保存即可删除对应的 `.md` 文件。

### Contest
字段：
- `name: str` 比赛名称
- `total_problems: int (1..15)` 题目数量（最多 15）
- `problems: { letter: 'A'.., pass_count: int, attempt_count: int, my_status: 'ac'|'attempted'|'unsubmitted' }[]`
- `rank_str: string | null` 形如 `a/b` 的排名
- `summary: string | null` 赛后总结
- 系统字段：`id: str`, `created_at: ISO8601`, `updated_at: ISO8601`

## REST API（供前端使用）

题目 Problem：
- `GET /api/problems` → `Problem[]`
- `POST /api/problems` → 创建，入参 `ProblemIn`
- `PUT /api/problems/{id}` → 更新，入参 `ProblemIn`
- `DELETE /api/problems/{id}` → 删除
- `GET /api/problems/{id}/solution` → `{ id, markdown, has_solution, updated_at }`
- `PUT /api/problems/{id}/solution` → 上传/更新题解，入参 `{ markdown: string }`（空字符串会删除题解）
- `DELETE /api/problems/{id}/solution` → 删除题解文件
- `GET /api/export` → 导出 `Problem[]`
- `POST /api/import` → 用 `Problem[]` 整体替换（自动备份原文件）

比赛 Contest：
- `GET /api/contests` → `Contest[]`
- `GET /api/contests/{id}` → `Contest`
- `POST /api/contests` → 创建，入参 `ContestIn`
- `PUT /api/contests/{id}` → 更新，入参 `ContestIn`
- `DELETE /api/contests/{id}` → 删除

Git 同步（网页按钮调用）：
- `POST /api/git/push`，入参：
  ```json
  { "message": "update problems", "files": ["data/problems.json"], "add_all": false }
  ```
  若未提供 `files` 或 `add_all=true`，等同于 `git add -A`。

## 目录结构
```
acm-tracker/
├─ server.py             # FastAPI 后端（同时托管前端）
├─ requirements.txt      # 依赖
├─ data/
│  ├─ problems.json      # 题目数据
│  └─ contests.json      # 比赛数据
└─ frontend/
   ├─ index.html         # 全部题目
   ├─ unsolved.html      # 未解决
   ├─ solved.html        # 已解决
   ├─ contests.html      # 比赛面板
   ├─ app.js             # 题目相关前端逻辑
   ├─ contests.js        # 比赛相关前端逻辑
   └─ style.css          # 统一样式
```

## 常见问题（FAQ）
- 我可以自定义字段吗？
  - 可以。保持前端提交的结构与后端 `ProblemIn/ContestIn` 模型一致即可。新增字段建议从前端表单开始接入，并在后端模型与 `normalize_*` 中补默认值。
- 怎么导入旧清单？
  - 将旧数据整理为与 `Problem` 兼容的数组，调用 `/api/import` 即可整体替换（原文件会自动备份到 `.bak.json`）。
- 为什么不用数据库？
  - 小团队 + Git 同步场景下，JSON 文件足够轻量、可读、易合并；未来如需扩展，迁移到 SQLite/PostgreSQL 也很容易。
- 端口/路径怎么改？
  - 运行时修改 `uvicorn` 的 `--port` 即可；静态目录为 `frontend/`，数据目录为 `data/`，可在 `server.py` 顶部常量处调整。
- Git 推送失败怎么办？
  - 确认项目根目录已 `git init` 并配置远程（`git remote -v`）；首次推送可能需要设置上游分支；或检查是否确有暂存更改。
- 题解渲染需要联网吗？
  - 默认从 jsDelivr 加载 `markdown-it`、`MathJax`、`highlight.js`，离线环境可改为本地托管（替换 HTML 中的 CDN 链接即可）。

## 备选方案：纯前端 + File System Access API（可选）
- 在 `https://` 或 `http://localhost` 环境下，Chrome/Edge 可让网页直接读写本地 JSON；
- 仍可配合 Git 同步，但 Safari/Firefox 支持较差，且需要用户授权选择文件；
- 本仓库默认方案更稳健：由后端负责写盘，前端专注交互。
