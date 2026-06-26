// 打包后重新签名：electron-builder 在找不到付费 Developer ID 证书时会
// 直接跳过签名，导致 App 内部保留 Electron 原始的占位签名（Identifier=Electron）。
// macOS 的隐私权限（TCC，包括录屏/辅助功能）按"代码签名身份"记录授权，
// 不是按 Info.plist 的 CFBundleIdentifier。身份是通用的 "Electron" 会导致
// 多个未签名 Electron App 互相冲突、授权后依然反复提示。
// 这里用本机自签（ad-hoc）证书，把签名身份强制改成我们自己的 appId，
// 这样无论安装到哪台电脑，TCC 权限都能正确、稳定地与本应用绑定。
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// 递归收集需要单独签名的嵌套代码（Frameworks / Helper.app），
// 必须按"从内到外、从深到浅"的顺序逐个签名——不能直接对外层 .app 用
// `codesign --deep`，那样会导致内层 Electron Framework 和外层主程序的
// 签名 Team ID 不一致，启动时被系统 dyld 校验拒绝（Library not loaded）。
// 自底向上收集所有需要单独签名的内容：framework / helper app 包内部
// 散落的可执行文件（如 chrome_crashpad_handler）、.dylib，都要先签完，
// 再签它们所在的 .framework / .app 包本身，最后才签最外层主程序。
function collectNestedTargets(dir, acc = [], isBundleRoot = false) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      if (name.endsWith('.framework') || name.endsWith('.app')) {
        const innerRoot = name.endsWith('.framework') ? path.join(full, 'Versions/A') : path.join(full, 'Contents');
        collectNestedTargets(innerRoot, acc, true);
        acc.push(full);
      } else {
        // MacOS 目录就是主二进制所在位置，已由外层 bundle 签名覆盖，跳过单独处理
        if (isBundleRoot && name === 'MacOS') continue;
        collectNestedTargets(full, acc, false);
      }
    } else if (stat.isFile() && !isBundleRoot) {
      // 仅签 bundle 内部"深处"散落的可执行文件/动态库（如 Helpers 里的
      // chrome_crashpad_handler）；bundle 根目录下与框架/应用同名的主二进制
      // 文件留给最终对 bundle 路径本身的 codesign 处理，避免重复签名冲突。
      const isExecutable = (stat.mode & 0o111) !== 0;
      if (name.endsWith('.dylib') || name.endsWith('.so') || isExecutable) {
        acc.push(full);
      }
    }
  }
  return acc;
}

function sign(target, appId, entitlements) {
  execFileSync('codesign', [
    '--force',
    '--sign', '-',
    '--identifier', appId,
    '--entitlements', entitlements,
    '--options', 'runtime',
    '--timestamp=none',
    target,
  ], { stdio: 'inherit' });
}

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appId = context.packager.appInfo.id || context.packager.config.appId;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlements = path.join(context.packager.projectDir, 'resources', 'entitlements.mac.plist');

  console.log(`[after-sign] 重新签名 ${appPath}，身份 = ${appId}（自内向外逐项签名）`);

  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');
  if (fs.existsSync(frameworksDir)) {
    for (const nested of collectNestedTargets(frameworksDir)) {
      sign(nested, appId, entitlements);
    }
  }
  sign(appPath, appId, entitlements);

  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['-dv', appPath], { stdio: 'inherit' });
};
