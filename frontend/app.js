
const $ = (sel) => document.querySelector(sel);
const api = {
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
};

let state = {
  items: [],
  filtered: [],
};

function normalize(s) { return (s || '').toLowerCase(); }

function applyFilters() {
  const q = normalize($('#q').value);
  const fStatus = $('#f-status').value;
  const fDiff = $('#f-diff').value;
  const sort = $('#sort').value;

  let arr = [...state.items];

  if (q) {
    arr = arr.filter(it => {
      const hay = [
        it.title, it.source, it.notes,
        ...(it.tags || []),
        it.owner
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if (fStatus) arr = arr.filter(it => it.status === fStatus);
  if (fDiff) arr = arr.filter(it => it.difficulty === fDiff);

  const cmp = {
    'created_at_desc': (a,b) => new Date(b.created_at) - new Date(a.created_at),
    'created_at_asc':  (a,b) => new Date(a.created_at) - new Date(b.created_at),
    'priority_desc':   (a,b) => (b.priority||0) - (a.priority||0),
    'priority_asc':    (a,b) => (a.priority||0) - (b.priority||0),
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

    const diffCell = document.createElement('td');
    diffCell.textContent = it.difficulty || '-';
    tr.appendChild(diffCell);

    const statusCell = document.createElement('td');
    const status = (it.status || 'TODO').toLowerCase();
    statusCell.innerHTML = `<span class="badge ${status}">${it.status}</span>`;
    tr.appendChild(statusCell);

    const prioCell = document.createElement('td');
    prioCell.textContent = it.priority ?? '-';
    tr.appendChild(prioCell);

    const ownerCell = document.createElement('td');
    ownerCell.textContent = it.owner || '-';
    tr.appendChild(ownerCell);

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
    const editBtn = document.createElement('button');
    editBtn.className = 'small';
    editBtn.textContent = '编辑';
    editBtn.onclick = () => fillForm(it);
    const delBtn = document.createElement('button');
    delBtn.className = 'small danger';
    delBtn.textContent = '删除';
    delBtn.onclick = async () => {
      if (!confirm(`确定删除「${it.title}」?`)) return;
      await api.remove(it.id);
      await reload();
    };
    opsCell.appendChild(editBtn);
    opsCell.appendChild(document.createTextNode(' '));
    opsCell.appendChild(delBtn);
    tr.appendChild(opsCell);

    tbody.appendChild(tr);
  }
}

function formPayload() {
  const tagStr = $('#tags').value.trim();
  const tags = tagStr ? tagStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  return {
    title: $('#title').value.trim(),
    link: $('#link').value.trim() || null,
    source: $('#source').value.trim() || null,
    difficulty: $('#difficulty').value,
    status: $('#status').value,
    priority: Number($('#priority').value) || 3,
    owner: $('#owner').value.trim() || null,
    tags,
    notes: $('#notes').value.trim() || null,
  };
}

function resetForm() {
  $('#pid').value = '';
  $('#title').value = '';
  $('#link').value = '';
  $('#source').value = '';
  $('#difficulty').value = 'Medium';
  $('#status').value = 'TODO';
  $('#priority').value = '3';
  $('#owner').value = '';
  $('#tags').value = '';
  $('#notes').value = '';
  $('#submit-btn').textContent = '保存';
}

function fillForm(it) {
  $('#pid').value = it.id;
  $('#title').value = it.title || '';
  $('#link').value = it.link || '';
  $('#source').value = it.source || '';
  $('#difficulty').value = it.difficulty || 'Medium';
  $('#status').value = it.status || 'TODO';
  $('#priority').value = String(it.priority ?? 3);
  $('#owner').value = it.owner || '';
  $('#tags').value = (it.tags || []).join(', ');
  $('#notes').value = it.notes || '';
  $('#submit-btn').textContent = '更新';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function reload() {
  state.items = await api.list();
  applyFilters();
}

function escapeHtml(unsafe) {
  return (unsafe || '').replace(/[&<"'>]/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[m]);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Bind form
  $('#problem-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#pid').value.trim();
    const payload = formPayload();
    if (!payload.title) return alert('标题必填');
    if (id) await api.update(id, payload);
    else await api.create(payload);
    resetForm();
    await reload();
  });
  $('#reset-btn').addEventListener('click', resetForm);

  // Filters
  $('#q').addEventListener('input', applyFilters);
  $('#f-status').addEventListener('change', applyFilters);
  $('#f-diff').addEventListener('change', applyFilters);
  $('#sort').addEventListener('change', applyFilters);

  await reload();
});
