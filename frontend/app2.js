
const $ = (sel) => document.querySelector(sel);
const mode = (document.body.dataset.mode || 'all').trim();
const stageHeader = document.querySelector('#table thead th[data-col="stage"]');
const assigneeHeader = document.querySelector('#table thead th[data-col="assignee"]');
const showStageColumn = !!stageHeader;
const showAssigneeColumn = !!assigneeHeader;

const api = {
  async gitPush(message, files=['data']) {
    const r = await fetch('/api/git/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, files })
    });
    return await r.json();
  },
  async gitPull(remote='origin', branch='main') {
    const r = await fetch('/api/git/pull', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote, branch })
    });
    return await r.json();
  },
  async list() {
    const r = await fetch('/api/problems');
    return await r.json();
  },
  async create(payload) {
    const r = await fetch('/api/problems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  },
  async update(id, payload) {
    const r = await fetch(`/api/problems/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  },
  async remove(id) {
    const r = await fetch(`/api/problems/${id}`, { method: 'DELETE' });
    return await r.json();
  },
  async getSolution(id) {
    const r = await fetch(`/api/problems/${id}/solution`);
    if (r.status === 404) return { markdown: '' };
    return await r.json();
  },
  async putSolution(id, markdown) {
    const r = await fetch(`/api/problems/${id}/solution`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown }),
    });
    return await r.json();
  },
  async deleteSolution(id) {
    const r = await fetch(`/api/problems/${id}/solution`, { method: 'DELETE' });
    return await r.json();
  },
};

let state = { items: [], filtered: [] };
const solutionCache = new Map();
const md = window.markdownit ? window.markdownit({ html: true, linkify: true, breaks: true }) : null;

function getSolutionModalElements() {
  return {
    modal: document.getElementById('solution-modal'),
    body: document.getElementById('solution-modal-body'),
    title: document.getElementById('solution-modal-title'),
    close: document.getElementById('solution-modal-close'),
  };
}

function normalize(s) { return (s || '').toLowerCase(); }

function visibleItems(items) {
  if (mode === 'unsolved') return items.filter(it => !it.solved);
  if (mode === 'solved') return items.filter(it => !!it.solved);
  return items;
}

async function loadSolutionMarkdown(id) {
  if (solutionCache.has(id)) return solutionCache.get(id);
  const res = await api.getSolution(id);
  const text = res.markdown || '';
  solutionCache.set(id, text);
  return text;
}

function closeSolutionModal() {
  const { modal } = getSolutionModalElements();
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
}

async function renderSolutionMarkdown(container, markdown) {
  if (!container) return;
  const content = (markdown || '').trim();
  if (!content) {
    container.innerHTML = '<p class="muted">暂无题解</p>';
  } else if (md) {
    container.innerHTML = md.render(markdown);
  } else {
    container.textContent = markdown;
  }
  if (window.hljs && container.querySelectorAll) {
    container.querySelectorAll('pre code').forEach((block) => {
      try { window.hljs.highlightElement(block); } catch (err) { /* ignore */ }
    });
  }
  if (window.MathJax && window.MathJax.typesetPromise) {
    try {
      await window.MathJax.typesetPromise([container]);
    } catch (err) {
      console.warn('MathJax render failed', err);
    }
  }
}

async function openSolutionModal(problem, opts = {}) {
  const { modal, body, title } = getSolutionModalElements();
  if (!modal || !body || !title) {
    alert('当前页面未加载题解弹窗。');
    return;
  }
  modal.removeAttribute('hidden');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<p class="muted">加载中...</p>';
  const titleText = opts.preview ? (problem?.title || '题解预览') : (problem?.title || '题解');
  title.textContent = titleText;
  let markdown = opts.markdown;
  if (markdown === undefined && problem?.id) {
    try {
      markdown = await loadSolutionMarkdown(problem.id);
    } catch (err) {
      console.error('加载题解失败', err);
      markdown = '';
    }
  }
  await renderSolutionMarkdown(body, markdown);
}

function applyFilters() {
  const q = normalize($('#q')?.value);
  const fSolvedEl = $('#f-solved');
  const fSolved = fSolvedEl ? fSolvedEl.value : (mode === 'unsolved' ? 'false' : (mode === 'solved' ? 'true' : ''));
  const fStageEl = $('#f-stage');
  const fStage = fStageEl ? fStageEl.value : '';

  const sort = $('#sort')?.value || 'created_at_desc';

  let arr = [...state.items];
  // page-level filter
  arr = visibleItems(arr);

  if (q) {
    arr = arr.filter(it => {
      const hay = [
        it.title,
        it.source,
        it.notes,
        it.unsolved_stage,
        it.unsolved_custom_label,
        ...(it.tags || []),
        it.assignee,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if (fSolved !== '') {
    const flag = (fSolved === 'true');
    arr = arr.filter(it => !!it.solved === flag);
  }
  if (fStage) arr = arr.filter(it => (it.unsolved_stage || '') === fStage);

  const cmp = {
    'created_at_desc': (a,b) => new Date(b.created_at) - new Date(a.created_at),
    'created_at_asc':  (a,b) => new Date(a.created_at) - new Date(b.created_at),
    'pass_desc':       (a,b) => (b.pass_count ?? -1) - (a.pass_count ?? -1),
    'pass_asc':        (a,b) => (a.pass_count ?? 1e15) - (b.pass_count ?? 1e15),
    'title_asc':       (a,b) => (a.title||'').localeCompare(b.title||''),
  }[sort];
  arr.sort(cmp);

  state.filtered = arr;
  renderTable();
}

function renderTable() {
  const tbody = $('#tbody');
  tbody.innerHTML = '';
  for (const it of state.filtered) {
    const tr = document.createElement('tr');

    const titleCell = document.createElement('td');
    titleCell.innerHTML = it.link
      ? `<a href="${it.link}" target="_blank" rel="noreferrer">${escapeHtml(it.title)}</a>`
      : `<span>${escapeHtml(it.title)}</span>`;
    tr.appendChild(titleCell);

    const sourceCell = document.createElement('td');
    sourceCell.textContent = it.source || '-';
    tr.appendChild(sourceCell);

    // 在 All/Unsolved 页面展示“状态/阶段”列；Solved 页面不展示
    if (showStageColumn) {
      const thirdCell = document.createElement('td');
      thirdCell.classList.add('status-cell');
      const badges = [];
      badges.push({ text: it.solved ? '已解决' : '未解决', cls: it.solved ? 'done' : 'todo' });
      if (!it.solved) {
        if (it.unsolved_stage) badges.push({ text: it.unsolved_stage, cls: 'todo' });
        if (it.unsolved_custom_label) badges.push({ text: it.unsolved_custom_label, cls: 'custom' });
      }
      badges.forEach(({ text, cls }, idx) => {
        const span = document.createElement('span');
        span.className = `badge ${cls}`;
        span.textContent = text;
        thirdCell.appendChild(span);
        if (idx !== badges.length - 1) thirdCell.appendChild(document.createTextNode(' '));
      });
      tr.appendChild(thirdCell);
    }

    if (showAssigneeColumn) {
      const assigneeCell = document.createElement('td');
      assigneeCell.textContent = it.assignee || '-';
      tr.appendChild(assigneeCell);
    }

    const passCell = document.createElement('td');
    passCell.textContent = it.pass_count ?? '-';
    tr.appendChild(passCell);

    const tagsCell = document.createElement('td');
    tagsCell.className = 'tags';
    (it.tags || []).forEach(tag => {
      const s = document.createElement('span');
      s.className = 'badge';
      s.textContent = tag;
      tagsCell.appendChild(s);
    });
    tr.appendChild(tagsCell);

    const opsCell = document.createElement('td');
    const solutionBtn = document.createElement('button');
    const hasSolution = !!it.has_solution;
    solutionBtn.className = hasSolution ? 'small secondary' : 'small secondary ghost';
    solutionBtn.textContent = hasSolution ? '查看题解' : '添加题解';
    solutionBtn.title = hasSolution ? '打开题解弹窗' : '尚未编写题解，点击可先填写后预览';
    solutionBtn.type = 'button';
    solutionBtn.onclick = async () => {
      await openSolutionModal(it);
    };
    opsCell.appendChild(solutionBtn);
    opsCell.appendChild(document.createTextNode(' '));
    const editBtn = document.createElement('button');
    editBtn.className = 'small';
    editBtn.textContent = '编辑';
    editBtn.type = 'button';
    editBtn.onclick = () => {
      fillForm(it).catch(err => console.error(err));
    };
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'small';
    toggleBtn.textContent = it.solved ? '标记为未解决' : '标记为已解决';
    toggleBtn.type = 'button';
    toggleBtn.onclick = async () => {
      const payload = toPayload(it);
      payload.solved = !it.solved;
      if (payload.solved) {
        payload.unsolved_stage = null;
        payload.unsolved_custom_label = null;
      } else if (!payload.unsolved_stage) {
        payload.unsolved_stage = '未看题';
      }
      await api.update(it.id, payload);
      await reload();
    };
    const delBtn = document.createElement('button');
    delBtn.className = 'small danger';
    delBtn.textContent = '删除';
    delBtn.type = 'button';
    delBtn.onclick = async () => {
      if (!confirm(`确定删除「${it.title}」?`)) return;
      await api.remove(it.id);
      await reload();
    };
    opsCell.appendChild(editBtn);
    opsCell.appendChild(document.createTextNode(' '));
    opsCell.appendChild(toggleBtn);
    opsCell.appendChild(document.createTextNode(' '));
    opsCell.appendChild(delBtn);
    tr.appendChild(opsCell);

    tbody.appendChild(tr);
  }
}

function toPayload(fromFormOrItem) {
  // Accepts DOM or item object
  if (fromFormOrItem && fromFormOrItem.title === undefined) {
    // from DOM
    const tagStr = $('#tags').value.trim();
    const tags = tagStr ? tagStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    const solved = ($('#solved')?.value || 'false') === 'true';
    const passCountVal = $('#pass_count').value.trim();
    const assignee = $('#assignee')?.value.trim();
    const customLabel = $('#unsolved_custom_label')?.value.trim();
    return {
      title: $('#title').value.trim(),
      link: $('#link').value.trim() || null,
      source: $('#source').value.trim() || null,
      pass_count: passCountVal ? Number(passCountVal) : null,
      tags,
      assignee: assignee ? assignee : null,
      solved,
      unsolved_stage: solved ? null : ($('#unsolved_stage')?.value || null),
      unsolved_custom_label: solved ? null : (customLabel ? customLabel : null),
      notes: $('#notes').value.trim() || null,
    };
  } else {
    // from item object
    const it = fromFormOrItem;
    return {
      title: it.title,
      link: it.link || null,
      source: it.source || null,
      pass_count: it.pass_count ?? null,
      tags: it.tags || [],
      assignee: it.assignee || null,
      solved: !!it.solved,
      unsolved_stage: it.solved ? null : (it.unsolved_stage || null),
      unsolved_custom_label: it.solved ? null : (it.unsolved_custom_label || null),
      notes: it.notes || null,
    };
  }
}

function resetForm() {
  $('#pid').value = '';
  $('#title').value = '';
  $('#link').value = '';
  $('#source').value = '';
  $('#pass_count').value = '';
  $('#tags').value = '';
  const assigneeEl = $('#assignee');
  if (assigneeEl) assigneeEl.value = '';
  $('#notes').value = '';
  const solvedEl = $('#solved');
  if (solvedEl) solvedEl.value = (mode === 'solved') ? 'true' : 'false';
  const stageEl = $('#unsolved_stage');
  if (stageEl) stageEl.value = '未看题';
  const customEl = $('#unsolved_custom_label');
  if (customEl) customEl.value = '';
  const solutionEl = $('#solution_md');
  if (solutionEl) {
    solutionEl.value = '';
    solutionEl.placeholder = '支持 Markdown、代码块以及数学公式，如 $a^2 + b^2 = c^2$';
  }
  $('#submit-btn').textContent = '保存';
  toggleStageVisibility();
}

async function fillForm(it) {
  $('#pid').value = it.id;
  $('#title').value = it.title || '';
  $('#link').value = it.link || '';
  $('#source').value = it.source || '';
  $('#pass_count').value = it.pass_count ?? '';
  $('#tags').value = (it.tags || []).join(', ');
  const assigneeEl = $('#assignee');
  if (assigneeEl) assigneeEl.value = it.assignee || '';
  $('#notes').value = it.notes || '';
  const solvedEl = $('#solved');
  if (solvedEl) solvedEl.value = it.solved ? 'true' : 'false';
  if ($('#unsolved_stage')) $('#unsolved_stage').value = it.unsolved_stage || '未看题';
  const customEl = $('#unsolved_custom_label');
  if (customEl) customEl.value = it.unsolved_custom_label || '';
  const solutionEl = $('#solution_md');
  if (solutionEl) {
    solutionEl.value = '';
    if (it.has_solution) {
      solutionEl.disabled = true;
      solutionEl.placeholder = '题解加载中...';
      try {
        const markdown = await loadSolutionMarkdown(it.id);
        solutionEl.value = markdown;
      } catch (err) {
        console.error('加载题解失败', err);
        solutionEl.value = '';
      } finally {
        solutionEl.disabled = false;
        solutionEl.placeholder = '支持 Markdown、代码块以及数学公式，如 $a^2 + b^2 = c^2$';
      }
    }
  }
  $('#submit-btn').textContent = '更新';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toggleStageVisibility();
}

async function reload() {
  state.items = await api.list();
  solutionCache.clear();
  applyFilters();
}

function escapeHtml(unsafe) {
  return (unsafe || '').replace(/[&<"'>]/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[m]);
}

function toggleStageVisibility() {
  const solvedEl = $('#solved');
  const show = !solvedEl || solvedEl.value === 'false';
  const stageWrap = $('#unsolved_stage_wrap') || $('#unsolved_stage')?.parentElement;
  const customWrap = $('#unsolved_custom_label_wrap');
  if (stageWrap) stageWrap.style.display = show ? 'block' : 'none';
  if (customWrap) customWrap.style.display = show ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Git push button
  const pushBtn = document.getElementById('git-push-btn');
  const msgInput = document.getElementById('commit-msg');
  const gitLog = document.getElementById('git-log');
  const pullBtn = document.getElementById('git-pull-btn');
  if (pushBtn && msgInput) {
    const defaultMsg = `update problems (${new Date().toLocaleString()})`;
    if (!msgInput.value) msgInput.value = defaultMsg;
    pushBtn.addEventListener('click', async () => {
      pushBtn.disabled = true;
      pushBtn.textContent = '上传中...';
      const logs = [];
      const appendLog = (line) => {
        if (!gitLog) return;
        gitLog.style.display = 'block';
        if (line === undefined || line === null) return;
        const text = String(line).trim();
        if (!text) return;
        logs.push(text);
        gitLog.textContent = logs.join('\n');
      };
      if (gitLog) {
        gitLog.style.display = 'block';
        gitLog.textContent = '';
      }
      appendLog('Running: git pull origin main...');
      try {
        const pullRes = await api.gitPull();
        if (!pullRes.ok) {
          if (pullRes.stdout || pullRes.stderr) {
            appendLog(pullRes.stdout);
            appendLog(pullRes.stderr);
          } else {
            appendLog(JSON.stringify(pullRes, null, 2));
          }
        }
        if (!pullRes.ok) {
          const hint = pullRes.hint || 'git pull 执行失败';
          alert(hint);
          return;
        }
        appendLog(pullRes.stdout);
        appendLog(pullRes.stderr);
        appendLog('Running: git add -> commit -> push...');
        const res = await api.gitPush(msgInput.value, ['data']);
        if (res.ok) {
          appendLog(res.stdout);
          appendLog(res.stderr);
          alert('已提交并推送到远程。');
        } else if (res.error === 'no_changes') {
          appendLog(res.hint || '没有需要提交的更改');
          alert('没有更改需要提交');
        } else if (res.error === 'not_a_git_repo') {
          appendLog(res.hint || '当前目录不是 git 仓库');
          alert('请先在项目根目录 git init 并设置远程');
        } else {
          appendLog(JSON.stringify(res, null, 2));
          alert('推送失败，请查看日志');
        }
      } catch (e) {
        appendLog(e);
        alert('发生异常，查看日志');
      } finally {
        pushBtn.disabled = false;
        pushBtn.textContent = '上传到 GitHub';
        await reload();
      }
    });
  }

  if (pullBtn) {
    pullBtn.addEventListener('click', async () => {
      pullBtn.disabled = true;
      pullBtn.textContent = '拉取中...';
      if (gitLog) {
        gitLog.style.display = 'block';
        gitLog.textContent = 'Running: git pull origin main...';
      }
      try {
        const res = await api.gitPull();
        if (res.ok) {
          if (gitLog) gitLog.textContent = (res.stdout || '') + '\n' + (res.stderr || '');
          await reload();
          alert('已执行 git pull origin main');
        } else {
          if (gitLog) gitLog.textContent = JSON.stringify(res, null, 2);
          if (res.error === 'not_a_git_repo') alert('当前目录不是 git 仓库');
          else alert('git pull 失败，请查看日志');
        }
      } catch (err) {
        if (gitLog) gitLog.textContent = String(err);
        alert('执行 git pull 时出错');
      } finally {
        pullBtn.disabled = false;
        pullBtn.textContent = '获取远程更新';
      }
    });
  }

  const { modal, close } = getSolutionModalElements();
  if (close) close.addEventListener('click', closeSolutionModal);
  if (modal) {
    modal.addEventListener('click', (evt) => {
      if (evt.target === modal) closeSolutionModal();
    });
  }
  document.addEventListener('keydown', (evt) => {
    const { modal: currentModal } = getSolutionModalElements();
    if (evt.key === 'Escape' && currentModal && currentModal.classList.contains('open')) closeSolutionModal();
  });

  const previewBtn = document.getElementById('solution-preview-btn');
  if (previewBtn) {
    previewBtn.addEventListener('click', async () => {
      const markdown = $('#solution_md')?.value || '';
      const title = $('#title')?.value || '';
      await openSolutionModal({ id: $('#pid')?.value || '', title }, { preview: true, markdown });
    });
  }

  // Bind form
  $('#problem-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#pid').value.trim();
    const payload = toPayload({});
    if (!payload.title) return alert('标题必填');
    let saved;
    if (id) saved = await api.update(id, payload);
    else saved = await api.create(payload);
    const targetId = id || saved.id;
    const solutionEl = $('#solution_md');
    if (solutionEl && targetId) {
      const markdown = solutionEl.value.replace(/\r\n/g, '\n');
      if (markdown.trim()) {
        await api.putSolution(targetId, markdown);
        solutionCache.set(targetId, markdown);
      } else {
        if (id) {
          await api.deleteSolution(targetId);
        }
        solutionCache.delete(targetId);
      }
    }
    resetForm();
    await reload();
  });
  $('#reset-btn').addEventListener('click', resetForm);
  $('#solved')?.addEventListener('change', toggleStageVisibility);

  // Filters
  $('#q')?.addEventListener('input', applyFilters);
  $('#f-solved')?.addEventListener('change', applyFilters);
  $('#f-stage')?.addEventListener('change', applyFilters);
  $('#sort')?.addEventListener('change', applyFilters);

  await reload();
  toggleStageVisibility();
});
