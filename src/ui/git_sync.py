"""
Git sync UI module
Handles the Git version control tab with separate data repository
"""
import gradio as gr
from datetime import datetime

from ..git_utils import (
    git_pull, git_push, load_git_config,
    get_repo_status, init_data_repo
)


def init_repo_handler(repo_url: str, branch: str):
    """Handle repository initialization"""
    if not repo_url or not repo_url.strip():
        return "⚠️  请先输入仓库地址", "", "main"

    output = init_data_repo(repo_url, branch)
    return output, repo_url, branch


def git_pull_handler(repo_url: str, branch: str):
    """Handle git pull operation"""
    if not repo_url or not repo_url.strip():
        return "⚠️  请先输入仓库地址"

    return git_pull(repo_url, branch)


def git_push_handler(repo_url: str, message: str, branch: str):
    """Handle git push operation"""
    if not repo_url or not repo_url.strip():
        return "⚠️  请先输入仓库地址"

    return git_push(repo_url, message, branch)


def status_handler():
    """Handle status check"""
    return get_repo_status()


def build_git_sync_tab():
    """Build the Git sync tab with repository configuration"""
    # Load saved configuration before building UI
    saved_config = load_git_config()
    saved_repo_url = saved_config.get("repo_url", "")
    saved_branch = saved_config.get("branch", "main")
    initial_status = get_repo_status()

    with gr.Tab("🔄 Git 同步"):
        gr.Markdown("### Git 版本控制 - Data 独立仓库")
        gr.Markdown("数据文件单独使用一个 Git 仓库进行版本控制")

        # Repository configuration section
        with gr.Accordion("📝 仓库配置", open=True):
            gr.Markdown("""
            **首次使用步骤：**
            1. 在 GitHub/GitLab 等平台创建一个新的空仓库
            2. 复制仓库的 HTTPS 或 SSH 地址（例如：`https://github.com/username/acm-data.git`）
            3. 在下方输入仓库地址并点击"初始化 Data 仓库"
            4. 之后可以正常使用拉取和推送功能
            """)

            with gr.Row():
                repo_url_input = gr.Textbox(
                    label="Git 仓库地址",
                    placeholder="https://github.com/username/acm-data.git 或 git@github.com:username/acm-data.git",
                    value=saved_repo_url,
                    scale=3
                )
                branch_input = gr.Textbox(
                    label="分支名称",
                    value=saved_branch,
                    scale=1
                )

            with gr.Row():
                init_btn = gr.Button("🔧 初始化 Data 仓库", variant="secondary", size="sm")
                status_btn = gr.Button("📊 查看仓库状态", variant="secondary", size="sm")

            init_output = gr.Textbox(label="初始化输出", lines=5, interactive=False, value=initial_status)

        gr.Markdown("---")

        # Pull section
        gr.Markdown("### ⬇️  拉取远程更新")
        gr.Markdown("从远程仓库拉取最新的数据变更")

        with gr.Row():
            pull_btn = gr.Button("⬇️ Git Pull (拉取远程更新)", variant="secondary", size="lg")

        # Push section
        gr.Markdown("### ⬆️  推送本地更改")
        gr.Markdown("将本地数据变更推送到远程仓库")

        with gr.Row():
            commit_msg = gr.Textbox(
                label="提交说明",
                placeholder="描述本次更改...",
                value=f"update data ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})"
            )

        with gr.Row():
            push_btn = gr.Button("⬆️ Git Push (推送到远程)", variant="primary", size="lg")

        # Output section
        git_output = gr.Textbox(label="Git 操作日志", lines=15, interactive=False, max_lines=25)

        gr.Markdown("---")
        gr.Markdown("""
        **使用说明：**
        1. **首次使用**：输入仓库地址并点击"初始化 Data 仓库"
        2. **日常使用**：
           - 开始工作前：点击"拉取远程更新"同步最新数据
           - 完成工作后：填写提交说明，点击"推送到远程"
        3. **多人协作**：定期拉取更新，避免冲突
        4. **注意**：仓库地址会自动保存，下次打开自动加载

        **仓库范围：** 只同步 `data/` 目录（包含 problems.json、contests.json 和 solutions/）
        """)

        # Event handlers
        init_btn.click(
            fn=init_repo_handler,
            inputs=[repo_url_input, branch_input],
            outputs=[init_output, repo_url_input, branch_input]
        )

        status_btn.click(
            fn=status_handler,
            outputs=init_output
        )

        pull_btn.click(
            fn=git_pull_handler,
            inputs=[repo_url_input, branch_input],
            outputs=git_output
        )

        push_btn.click(
            fn=git_push_handler,
            inputs=[repo_url_input, commit_msg, branch_input],
            outputs=git_output
        )
