// 验证码视图（TOTP）：粘贴/扫码/手动添加、Google Authenticator 批量导入、搜索、拖拽排序、备注
import { api } from '../ui/api.js';
import { $, esc, toast, copyText, showMenu, openDialog, confirmDialog } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { decodeQrBlob } from '../ui/qr.js';
import {
  parseAuthPayload, createManualAccount, mergeAccounts, reorderAccounts,
  generateTotp, totpRemaining, normalizeRemark
} from '../core/totp.js';

const RING = 2 * Math.PI * 8.5;
const PALETTE = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff9f0a', '#30b0c7', '#34c759', '#ac8e68', '#64d2ff', '#ff6b3d'];

function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initial(name) {
  const c = Array.from(String(name || '?').trim())[0] || '?';
  return c.toUpperCase();
}

export function initAuth() {
  const list = $('#authList');
  const search = $('#authSearch');
  let accounts = [];
  let timer = null;
  let loaded = false;

  async function load() {
    try {
      accounts = (await api.invoke('vault:load')) || [];
    } catch {
      accounts = [];
    }
    loaded = true;
    render();
  }

  async function save() {
    try {
      await api.invoke('vault:save', accounts);
    } catch (e) {
      toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
    }
  }

  function visible() {
    const q = search.value.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => `${a.issuer} ${a.account} ${a.remark || ''}`.toLowerCase().includes(q));
  }

  function render() {
    const items = visible();
    if (!accounts.length) {
      list.innerHTML = `<div class="empty">${icon('shield')}
        <span>还没有验证码账号</span>
        <span>复制二维码图片后按 <span class="kbd">⌘V</span>，或点击「扫码」框选屏幕上的二维码<br/>支持 Google Authenticator 导出的批量迁移二维码</span></div>`;
      return;
    }
    if (!items.length) {
      list.innerHTML = '<div class="empty">没有匹配的账号</div>';
      return;
    }
    list.innerHTML =
      items
        .map(
          (a) => `<div class="a-item" data-id="${esc(a.id)}">
        <span class="a-avatar" style="--c:${avatarColor(a.issuer)}" title="拖动排序">${esc(initial(a.issuer))}<span class="grip">${icon('grip')}</span></span>
        <div class="a-meta"><div class="a-issuer">${esc(a.issuer)}</div>
          <div class="a-account">${esc(a.account)}${a.remark ? `<span class="remark">${esc(a.remark)}</span>` : ''}</div></div>
        <button class="a-code" title="点击复制">------</button>
        <svg class="ring" viewBox="0 0 22 22"><circle class="bg" cx="11" cy="11" r="8.5"/><circle class="fg" cx="11" cy="11" r="8.5" stroke-dasharray="${RING}"/></svg>
      </div>`
        )
        .join('') + '<div class="auth-tip">点击验证码复制 · 右键编辑备注或删除</div>';
    tick();
  }

  async function tick() {
    const now = Date.now();
    const rows = list.querySelectorAll('.a-item');
    await Promise.all(
      [...rows].map(async (row) => {
        const a = accounts.find((x) => x.id === row.dataset.id);
        if (!a) return;
        let code;
        try {
          code = await generateTotp(a, now);
        } catch {
          code = 'ERROR';
        }
        const left = totpRemaining(a, now);
        const urgent = left <= 5;
        const btn = row.querySelector('.a-code');
        const pretty = code.length === 6 ? code.slice(0, 3) + ' ' + code.slice(3) : code.length === 8 ? code.slice(0, 4) + ' ' + code.slice(4) : code;
        if (btn.textContent !== pretty) btn.textContent = pretty;
        btn.dataset.code = code;
        btn.classList.toggle('urgent', urgent);
        const ring = row.querySelector('.ring');
        ring.classList.toggle('urgent', urgent);
        ring.querySelector('.fg').style.strokeDashoffset = String(RING * (1 - left / (a.period || 30)));
        ring.setAttribute('aria-label', `${left} 秒后刷新`);
        row.title = `${left} 秒后刷新`;
      })
    );
  }

  async function addPayload(text) {
    const incoming = parseAuthPayload(text);
    accounts = mergeAccounts(accounts, incoming);
    await save();
    search.value = '';
    render();
    toast(incoming.length > 1 ? `已导入 ${incoming.length} 个账号` : `已添加 ${incoming[0].issuer}`);
  }

  async function addFromClipboard() {
    try {
      const clip = await api.invoke('clipboard:read');
      if (clip?.image) {
        const text = await decodeQrBlob(new Blob([clip.image.data], { type: clip.image.type }));
        if (!text) throw new Error('剪贴板图片中没有识别到二维码');
        return await addPayload(text);
      }
      if (clip?.text?.trim()) return await addPayload(clip.text);
      throw new Error('剪贴板中没有二维码图片或 otpauth:// 链接');
    } catch (e) {
      toast(e.message || String(e), 'error');
    }
  }

  function manualDialog() {
    openDialog({
      title: '手动添加账号',
      okText: '添加',
      body: `<div class="row"><label>服务名称</label><input name="issuer" class="field" placeholder="例如 GitHub" /></div>
        <div class="row"><label>账号</label><input name="account" class="field" placeholder="例如 me@example.com" /></div>
        <div class="row"><label>密钥（Base32）</label><input name="secret" class="field mono" placeholder="JBSW Y3DP EHPK 3PXP" autocomplete="off" required /></div>
        <div class="row" style="grid-template-columns:1fr 1fr 1fr;gap:6px">
          <select name="digits" class="field"><option value="6">6 位</option><option value="8">8 位</option></select>
          <select name="period" class="field"><option value="30">30 秒</option><option value="60">60 秒</option></select>
          <select name="algorithm" class="field"><option>SHA1</option><option>SHA256</option><option>SHA512</option></select>
        </div>`,
      onOk: async (form) => {
        const f = Object.fromEntries(new FormData(form));
        const acc = createManualAccount(f);
        accounts = mergeAccounts(accounts, [acc]);
        await save();
        render();
        toast(`已添加 ${acc.issuer}`);
      }
    });
  }

  function editRemark(a) {
    openDialog({
      title: `备注 · ${a.issuer}`,
      okText: '保存',
      body: `<div class="row"><input name="remark" class="field" maxlength="20" placeholder="20 字以内，留空则清除" value="${esc(a.remark || '')}" /></div>`,
      onOk: async (form) => {
        const r = normalizeRemark(new FormData(form).get('remark'));
        if (r) a.remark = r;
        else delete a.remark;
        await save();
        render();
      }
    });
  }

  function rename(a) {
    openDialog({
      title: '编辑名称',
      okText: '保存',
      body: `<div class="row"><label>服务名称</label><input name="issuer" class="field" value="${esc(a.issuer)}" /></div>
        <div class="row"><label>账号</label><input name="account" class="field" value="${esc(a.account)}" /></div>`,
      onOk: async (form) => {
        const f = Object.fromEntries(new FormData(form));
        a.issuer = String(f.issuer || '').trim() || a.issuer;
        a.account = String(f.account || '').trim();
        await save();
        render();
      }
    });
  }

  list.addEventListener('click', (e) => {
    const code = e.target.closest('.a-code');
    if (code?.dataset.code) copyText(code.dataset.code, '验证码已复制');
  });
  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.a-item');
    const a = row && accounts.find((x) => x.id === row.dataset.id);
    if (!a) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, [
      { label: '复制验证码', action: () => copyText(row.querySelector('.a-code').dataset.code, '验证码已复制') },
      { label: '编辑名称…', action: () => rename(a) },
      { label: a.remark ? '修改备注…' : '添加备注…', action: () => editRemark(a) },
      '-',
      {
        label: '删除',
        danger: true,
        action: async () => {
          if (!(await confirmDialog('删除账号', `确定删除「${a.issuer}${a.account ? ' · ' + a.account : ''}」？删除后无法恢复。`, '删除'))) return;
          accounts = accounts.filter((x) => x.id !== a.id);
          await save();
          render();
          toast('已删除');
        }
      }
    ]);
  });

  /* ---------- 拖拽排序（仅在未搜索时） ---------- */
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.a-avatar');
    if (!grip || e.button !== 0 || search.value.trim()) return;
    const row = grip.closest('.a-item');
    e.preventDefault();
    row.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    let moved = false;
    const move = (ev) => {
      const others = [...list.querySelectorAll('.a-item:not(.dragging)')];
      const next = others.find((o) => ev.clientY < o.getBoundingClientRect().top + o.offsetHeight / 2);
      if (next && next !== row.nextElementSibling) {
        list.insertBefore(row, next);
        moved = true;
      } else if (!next && row !== others[others.length - 1]?.nextElementSibling) {
        others[others.length - 1]?.after(row);
        moved = true;
      }
    };
    const up = async () => {
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', up);
      row.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      if (!moved) return;
      accounts = reorderAccounts(accounts, [...list.querySelectorAll('.a-item')].map((r) => r.dataset.id));
      await save();
    };
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', up);
    row.addEventListener('pointercancel', up);
  });

  search.addEventListener('input', render);
  $('#authPaste').addEventListener('click', addFromClipboard);
  $('#authScan').addEventListener('click', () => api.invoke('capture:start', { mode: 'qr' }));
  $('#authAdd').addEventListener('click', manualDialog);
  document.addEventListener('paste', (e) => {
    if (!$('#view-auth').classList.contains('on') || e.target === search) return;
    e.preventDefault();
    addFromClipboard();
  });

  load();

  return {
    focus: () => {},
    onShow() {
      if (loaded) tick();
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    onHide() {
      clearInterval(timer);
    },
    async onReveal(msg) {
      if (msg.qr === undefined) return;
      if (!msg.qr) return toast('选区中没有识别到二维码', 'error');
      try {
        await addPayload(msg.qr);
      } catch (e) {
        toast(e.message, 'error');
      }
    }
  };
}
