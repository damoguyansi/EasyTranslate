// Authenticator 账号保险箱：使用系统钥匙串（safeStorage）加密后落盘
export function createVault(store, safeStorage) {
  let cache = null;

  function load() {
    if (cache) return cache;
    const v = store.getVault();
    if (!v?.data) return (cache = []);
    try {
      const raw = safeStorage.decryptString(Buffer.from(v.data, 'base64'));
      const parsed = JSON.parse(raw);
      cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  function save(accounts) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用，无法保存验证码账号');
    const list = Array.isArray(accounts) ? accounts : [];
    const data = safeStorage.encryptString(JSON.stringify(list)).toString('base64');
    store.setVault({ version: 2, data, updatedAt: Date.now() });
    cache = list;
    return list;
  }

  return { load, save };
}
