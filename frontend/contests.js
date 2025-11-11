const $ = (sel) => document.querySelector(sel);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const STATUS_LABEL = {
  ac: 'Accepted',
  attempted: 'Attempted',
  unsubmitted: 'Unsubmitted',
};

const api = {
  async list() {
    const r = await fetch('/api/contests');
    return await r.json();
  },
  async get(id) {
    const r = await fetch(`/api/contests/${id}`);
    return await r.json();
  },
  async create(payload) {
    const r = await fetch('/api/contests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  },
  async update(id, payload) {
    const r = await fetch(`/api/contests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  },
  async remove(id) {
    const r = await fetch(`/api/contests/${id}`, { method: 'DELETE' });
    return await r.json();
  },
  async gitPush(message, files=['data']) {
    const r = await fetch('/api/git/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, files }),
    });
    return await r.json();
  },
  async gitPull(remote='origin', branch='main') {
    const r = await fetch('/api/git/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote, branch }),
    });
    return await r.json();
  },
};

const state = { items: [], selectedId: null };
const md = window.markdownit ? window.markdownit({ html: true, linkify: true, breaks: true }) : null;

const modalEls = {
  modal: null,
  title: null,
  meta: null,
  summary: null,
  grid: null,
  close: null,
};

function buildGrid(n) {
  const grid = $('#grid');
  grid.innerHTML = '';
  const total = Math.max(1, Math.min(15, Number(n) || 1));
  for (let i = 0; i < total; i++) {
    const letter = LETTERS[i];
    const card = document.createElement('div');
    card.className = 'prob-card status-unsubmitted';
    card.innerHTML = `
      <div class="prob-head">${letter}</div>
      <div class="prob-body">
        <label>Pass / Attempt</label>
        <div class="row">
          <input class="pass" type="number" min="0" value="0" />
          <span>/</span>
          <input class="attempt" type="number" min="0" value="0" />
        </div>
        <label>Team Status</label>
        <select class="status">
          <option value="unsubmitted">Unsubmitted</option>
          <option value="attempted">Attempted</option>
          <option value="ac">Accepted</option>
        </select>
      </div>
    `;
    card.querySelector('.status').addEventListener('change', (e) => applyCardColor(card, e.target.value));
    grid.appendChild(card);
  }
}

function readGrid() {
  const total = Math.max(1, Math.min(15, Number($('#total_problems').value) || 1));
  const cards = Array.from($('#grid').querySelectorAll('.prob-card'));
  const problems = [];
  for (let i = 0; i < total; i++) {
    const card = cards[i];
    const pass = Number(card.querySelector('.pass').value) || 0;
    const att = Number(card.querySelector('.attempt').value) || 0;
    const st = card.querySelector('.status').value;
    problems.push({ letter: LETTERS[i], pass_count: pass, attempt_count: att, my_status: st });
  }
  return problems;
}

function fillGrid(problems) {
  const total = problems.length;
  $('#total_problems').value = total;
  buildGrid(total);
  const cards = Array.from($('#grid').querySelectorAll('.prob-card'));
  for (let i = 0; i < total; i++) {
    const p = problems[i] || { pass_count: 0, attempt_count: 0, my_status: 'unsubmitted' };
    const card = cards[i];
    card.querySelector('.pass').value = p.pass_count ?? 0;
    card.querySelector('.attempt').value = p.attempt_count ?? 0;
    card.querySelector('.status').value = p.my_status || 'unsubmitted';
    applyCardColor(card, p.my_status);
  }
}

function applyCardColor(card, status) {
  card.classList.remove('status-ac', 'status-attempted', 'status-unsubmitted');
  card.classList.add('status-' + (status || 'unsubmitted'));
}

function summarizeContest(contest) {
  const problems = contest.problems || [];
  const solved = problems.filter((p) => p.my_status === 'ac').length;
  const attempted = problems.filter((p) => p.my_status === 'attempted').length;
  const total = contest.total_problems ?? problems.length ?? 0;
  return { solved, attempted, total };
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString();
    }
  } catch (err) {
    /* ignore */
  }
  return iso.replace('T', ' ').replace('Z', '');
}

async function renderSummaryMarkdown(container, markdown) {
  if (!container) return;
  const content = (markdown || '').trim();
  if (!content) {
    container.innerHTML = '<p class="muted">暂无总结</p>';
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

function toPayload() {
  return {
    name: $('#name').value.trim(),
    total_problems: Math.max(1, Math.min(15, Number($('#total_problems').value) || 1)),
    problems: readGrid(),
    rank_str: $('#rank_str').value.trim() || null,
    summary: $('#summary').value.trim() || null,
  };
}

function resetForm() {
  $('#cid').value = '';
  $('#name').value = '';
  $('#rank_str').value = '';
  $('#summary').value = '';
  $('#total_problems').value = 12;
  buildGrid(12);
  $('#c-submit-btn').textContent = 'Save';
}

function fillForm(it) {
  $('#cid').value = it.id;
  $('#name').value = it.name || '';
  $('#rank_str').value = it.rank_str || '';
  $('#summary').value = it.summary || '';
  fillGrid(it.problems || []);
  $('#c-submit-btn').textContent = 'Update';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function reload() {
  state.items = await api.list();
  renderList();
  await syncModal();
}

function renderList() {
  const tbody = $('#ctbody');
  tbody.innerHTML = '';
  for (const it of state.items) {
    const tr = document.createElement('tr');
    if (state.selectedId === it.id) tr.classList.add('active');
    const stats = summarizeContest(it);

    const tdName = document.createElement('td');
    tdName.textContent = it.name || '-';
    tr.appendChild(tdName);

    const tdTotal = document.createElement('td');
    tdTotal.textContent = stats.total || '-';
    tr.appendChild(tdTotal);

    const tdSolved = document.createElement('td');
    tdSolved.textContent = `${stats.solved}/${stats.total || 0}`;
    tr.appendChild(tdSolved);

    const tdRank = document.createElement('td');
    tdRank.textContent = it.rank_str || '-';
    tr.appendChild(tdRank);

    const tdUpdated = document.createElement('td');
    tdUpdated.textContent = formatDate(it.updated_at);
    tr.appendChild(tdUpdated);

    const tdActions = document.createElement('td');
    const view = document.createElement('button');
    view.className = 'small secondary';
    view.textContent = 'View';
    view.onclick = () => showDetail(it);

    const edit = document.createElement('button');
    edit.className = 'small';
    edit.textContent = 'Edit';
    edit.onclick = () => fillForm(it);

    const del = document.createElement('button');
    del.className = 'small danger';
    del.textContent = 'Delete';
    del.onclick = async () => {
      if (!confirm(`Delete contest "${it.name}"?`)) return;
      await api.remove(it.id);
      await reload();
    };

    tdActions.appendChild(view);
    tdActions.appendChild(document.createTextNode(' '));
    tdActions.appendChild(edit);
    tdActions.appendChild(document.createTextNode(' '));
    tdActions.appendChild(del);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
}

function isModalOpen() {
  return modalEls.modal && !modalEls.modal.hasAttribute('hidden');
}

function openModalFrame() {
  if (!modalEls.modal) return false;
  modalEls.modal.removeAttribute('hidden');
  modalEls.modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  return true;
}

function closeContestModal() {
  if (!modalEls.modal) return;
  modalEls.modal.classList.remove('open');
  modalEls.modal.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
  state.selectedId = null;
  renderList();
}

async function populateContestModal(contest) {
  if (!modalEls.title) return;
  const stats = summarizeContest(contest);
  modalEls.title.textContent = contest.name || 'Untitled contest';
  const metaParts = [];
  metaParts.push(`${stats.total} problems`);
  metaParts.push(`${stats.solved} solved`);
  metaParts.push(`${stats.attempted} attempted`);
  if (contest.rank_str) metaParts.push(`Rank ${contest.rank_str}`);
  if (contest.updated_at) metaParts.push(`Updated ${formatDate(contest.updated_at)}`);
  if (modalEls.meta) modalEls.meta.textContent = metaParts.join(' | ');
  if (modalEls.summary) {
    modalEls.summary.innerHTML = '<p class="muted">加载中...</p>';
    await renderSummaryMarkdown(modalEls.summary, contest.summary ?? '');
  }
  renderContestGrid(modalEls.grid, contest.problems || []);
}

async function showDetail(it) {
  state.selectedId = it.id;
  renderList();
  if (!openModalFrame()) return;
  await populateContestModal(it);
}

function renderContestGrid(container, problems) {
  if (!container) return;
  container.innerHTML = '';
  if (!problems.length) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty muted';
    empty.textContent = 'No problem data recorded.';
    container.appendChild(empty);
    container.classList.add('empty');
    return;
  }
  container.classList.remove('empty');
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i] || {};
    const letter = p.letter || LETTERS[i] || '?';
    const status = p.my_status || 'unsubmitted';
    const card = document.createElement('div');
    card.className = 'prob-card';
    applyCardColor(card, status);
    card.innerHTML = `
      <div class="prob-head">${letter}</div>
      <div class="prob-body readonly">
        <div class="counts"><span>${p.pass_count ?? 0}</span><span>/</span><span>${p.attempt_count ?? 0}</span></div>
        <div class="status-label">${STATUS_LABEL[status] || STATUS_LABEL.unsubmitted}</div>
      </div>
    `;
    container.appendChild(card);
  }
}

async function syncModal() {
  if (!state.selectedId || !isModalOpen()) return;
  const match = state.items.find((it) => it.id === state.selectedId);
  if (match) {
    await populateContestModal(match);
  } else {
    closeContestModal();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const pushBtn = document.getElementById('git-push-btn');
  const pullBtn = document.getElementById('git-pull-btn');
  const msgInput = document.getElementById('commit-msg');
  const gitLog = document.getElementById('git-log');
  if (msgInput && !msgInput.value) {
    msgInput.value = `update contests (${new Date().toLocaleString()})`;
  }
  if (pushBtn && msgInput) {
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
          const hint = pullRes.hint || 'git pull 执行失败';
          alert(hint);
          return;
        }
        appendLog(pullRes.stdout);
        appendLog(pullRes.stderr);
        appendLog('Running: git add -> commit -> push...');
        const message = msgInput.value.trim() || `update contests (${new Date().toLocaleString()})`;
        const res = await api.gitPush(message, ['data']);
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
      } catch (err) {
        appendLog(err);
        alert('推送失败');
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
        } else if (res.error === 'not_a_git_repo') {
          if (gitLog) gitLog.textContent = res.hint || '当前目录不是 git 仓库';
          alert('请先在项目根目录 git init 并设置远程');
        } else {
          if (gitLog) gitLog.textContent = JSON.stringify(res, null, 2);
          alert('git pull 失败，请查看日志');
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

  modalEls.modal = document.getElementById('contest-modal');
  modalEls.title = document.getElementById('contest-modal-title');
  modalEls.meta = document.getElementById('contest-modal-meta');
  modalEls.summary = document.getElementById('contest-modal-summary');
  modalEls.grid = document.getElementById('contest-modal-grid');
  modalEls.close = document.getElementById('contest-modal-close');
  if (modalEls.close) modalEls.close.addEventListener('click', closeContestModal);
  if (modalEls.modal) {
    modalEls.modal.addEventListener('click', (e) => {
      if (e.target === modalEls.modal) closeContestModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalOpen()) closeContestModal();
  });

  buildGrid(12);
  $('#total_problems').addEventListener('change', (e) => buildGrid(e.target.value));
  $('#contest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#cid').value.trim();
    const payload = toPayload();
    if (!payload.name) return alert('Name is required');
    if (id) await api.update(id, payload);
    else await api.create(payload);
    resetForm();
    await reload();
  });
  $('#c-reset-btn').addEventListener('click', resetForm);
  await reload();
});
