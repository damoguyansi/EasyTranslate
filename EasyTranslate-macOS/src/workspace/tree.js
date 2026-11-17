// JSON 树视图：按需渲染子节点（大文件也流畅）、按层级展开、搜索定位、路径复制
import { esc } from '../ui/dom.js';
import { valueType, joinPath, looksLikeJson } from '../core/json.js';

const PAGE = 500; // 单个节点一次最多渲染的子项数

function preview(v) {
  const type = valueType(v);
  if (type === 'string') return `<span class="t-val tok-str">"${esc(v.length > 300 ? v.slice(0, 300) + '…' : v)}"</span>`;
  if (type === 'number') return `<span class="t-val tok-num">${v}</span>`;
  if (type === 'boolean') return `<span class="t-val tok-bool">${v}</span>`;
  if (type === 'null') return '<span class="t-val tok-null">null</span>';
  return '';
}

function embedded(v) {
  if (typeof v !== 'string' || v.length < 2 || !looksLikeJson(v)) return undefined;
  try {
    const p = JSON.parse(v);
    return p && typeof p === 'object' ? p : undefined;
  } catch {
    return undefined;
  }
}

function entries(v) {
  if (Array.isArray(v)) return v.map((x, i) => [i, x]);
  return Object.entries(v);
}

export function createTree(container, { onSelect } = {}) {
  let root;
  let hits = [];
  let hitIndex = -1;
  let query = '';

  function childValue(node) {
    return node.embedded !== undefined ? node.embedded : node.value;
  }

  function isBranch(node) {
    const v = childValue(node);
    return v !== null && typeof v === 'object';
  }

  function makeRow(node) {
    const row = document.createElement('div');
    row.className = 't-row';
    row.style.paddingLeft = node.depth * 16 + 4 + 'px';
    const v = childValue(node);
    const branch = isBranch(node);
    let keyHtml = '';
    if (node.key !== undefined) {
      keyHtml =
        typeof node.key === 'number'
          ? `<span class="t-idx">${node.key}</span><span class="t-colon">:</span>`
          : `<span class="t-key tok-key">${esc(node.key)}</span><span class="t-colon">:</span>`;
    }
    let body;
    if (branch) {
      const n = Array.isArray(v) ? v.length : Object.keys(v).length;
      const sum = Array.isArray(v) ? `[${n}]` : `{${n}}`;
      body = `<span class="t-sum">${sum}</span>${node.embedded !== undefined ? '<span class="t-badge">字符串内 JSON</span>' : ''}`;
    } else body = preview(v);
    row.innerHTML = `<span class="t-tog">${branch ? '▶' : ''}</span>${keyHtml}${body}`;
    row.__node = node;
    node.row = row;
    return row;
  }

  function build(value, key, depth, path, parentEl) {
    const node = { value, key, depth, path, expanded: false, children: null, wrap: null };
    node.embedded = embedded(value);
    const wrap = document.createElement('div');
    wrap.appendChild(makeRow(node));
    node.wrap = wrap;
    parentEl.appendChild(wrap);
    return node;
  }

  function renderChildren(node, from = 0) {
    const v = childValue(node);
    const list = entries(v);
    const box = node.childBox || (node.childBox = document.createElement('div'));
    if (!node.childBox.isConnected) node.wrap.appendChild(box);
    node.children ||= [];
    const frag = document.createDocumentFragment();
    const end = Math.min(list.length, from + PAGE);
    for (let i = from; i < end; i++) {
      const [k, cv] = list[i];
      node.children.push(build(cv, k, node.depth + 1, joinPath(node.path, k), frag));
    }
    box.querySelector('.t-more')?.remove();
    box.appendChild(frag);
    if (end < list.length) {
      const more = document.createElement('div');
      more.className = 't-row t-more';
      more.style.paddingLeft = (node.depth + 1) * 16 + 20 + 'px';
      more.innerHTML = `<span class="muted">… 还有 ${list.length - end} 项，点击加载更多</span>`;
      more.addEventListener('click', () => renderChildren(node, end));
      box.appendChild(more);
    }
  }

  function setExpanded(node, open) {
    if (!isBranch(node) || node.expanded === open) return;
    node.expanded = open;
    node.row.querySelector('.t-tog').classList.toggle('open', open);
    if (open) {
      if (!node.children) renderChildren(node);
      else node.childBox.hidden = false;
    } else if (node.childBox) node.childBox.hidden = true;
  }

  function expandTo(node, level) {
    if (!isBranch(node)) return;
    const open = node.depth < level;
    setExpanded(node, open);
    if (open) for (const c of node.children || []) expandTo(c, level);
  }

  container.addEventListener('click', (e) => {
    const row = e.target.closest('.t-row');
    const node = row?.__node;
    if (!node) return;
    container.querySelector('.t-row.sel')?.classList.remove('sel');
    row.classList.add('sel');
    if (isBranch(node) && (e.target.closest('.t-tog') || e.detail === 1)) setExpanded(node, !node.expanded);
    onSelect?.(node);
  });

  function render(value) {
    container.innerHTML = '';
    hits = [];
    hitIndex = -1;
    root = build(value, undefined, 0, '$', container);
    expandTo(root, 2);
    if (query) search(query);
  }

  function showError(msg) {
    root = null;
    container.innerHTML = `<div class="tree-error">${esc(msg)}</div>`;
  }

  function showEmpty() {
    root = null;
    container.innerHTML = '<div class="empty">在左侧输入 JSON，这里会显示树形结构</div>';
  }

  /* ---------- 搜索：在数据上查找，再展开祖先节点定位 ---------- */
  function search(q) {
    query = q.trim().toLowerCase();
    container.querySelectorAll('.t-row.hit').forEach((r) => r.classList.remove('hit', 'cur'));
    hits = [];
    hitIndex = -1;
    if (!query || !root) return 0;
    const walk = (v, trail, depth) => {
      if (hits.length >= 2000) return;
      const e = embedded(v);
      const val = e !== undefined ? e : v;
      if (val !== null && typeof val === 'object') {
        for (const [k, cv] of entries(val)) {
          const keyHit = typeof k === 'string' && k.toLowerCase().includes(query);
          const valHit = (cv === null || typeof cv !== 'object') && String(cv).toLowerCase().includes(query);
          const next = trail.concat([k]);
          if (keyHit || valHit) hits.push(next);
          walk(cv, next, depth + 1);
        }
      }
    };
    walk(root.value, [], 0);
    return hits.length;
  }

  function reveal(trail) {
    let node = root;
    for (const k of trail) {
      setExpanded(node, true);
      let child = node.children.find((c) => c.key === k);
      while (!child && node.childBox?.querySelector('.t-more')) {
        renderChildren(node, node.children.length);
        child = node.children.find((c) => c.key === k);
      }
      if (!child) return null;
      node = child;
    }
    return node;
  }

  function step(delta) {
    if (!hits.length) return { index: 0, total: 0 };
    container.querySelector('.t-row.cur')?.classList.remove('cur', 'hit');
    hitIndex = (hitIndex + delta + hits.length) % hits.length;
    const node = reveal(hits[hitIndex]);
    if (node) {
      node.row.classList.add('hit', 'cur');
      node.row.scrollIntoView({ block: 'center' });
      onSelect?.(node);
    }
    return { index: hitIndex + 1, total: hits.length };
  }

  return {
    render,
    showError,
    showEmpty,
    expandLevel: (n) => root && expandTo(root, n),
    search,
    step
  };
}
