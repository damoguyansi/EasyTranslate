# macOS 代码签名证书

EasyTranslate 每个版本都用这张固定的自签名证书签名。macOS 的「屏幕录制」「辅助功能」授权绑定签名证书，因此升级版本后授权保持有效，无需重新授权。

| 文件 | 说明 |
| --- | --- |
| `EasyTranslate-codesign.p12` | 证书 + 私钥（PKCS#12，兼容 macOS `security import`） |
| `p12-password.txt` | `.p12` 的密码 |
| `cert.pem` | 证书公钥部分 |
| `codesign.cnf` | 生成证书用的 OpenSSL 配置 |

- 证书名称：`EasyTranslate Code Signing`
- SHA-1 指纹：`796A034A1780D2719D7D711DEF36F7964A8C7368`
- 有效期至：2046-11-12

## GitHub Actions

`.github/workflows/release-macos.yml` 从仓库密钥 `MACOS_CERT_P12`（`.p12` 的 Base64）和 `MACOS_CERT_PASSWORD` 读取证书，并校验上面的指纹。更换证书时需要同时更新这两个密钥和工作流里的 `EXPECTED_SHA1`。

## 在本机 Mac 上用同一证书打包

```bash
security import signing/EasyTranslate-codesign.p12 -k ~/Library/Keychains/login.keychain-db \
  -P "$(cat signing/p12-password.txt)" -T /usr/bin/codesign
sudo security add-trusted-cert -d -r trustRoot -p codeSign \
  -k /Library/Keychains/System.keychain signing/cert.pem
EASYTRANSLATE_CODESIGN_IDENTITY=796A034A1780D2719D7D711DEF36F7964A8C7368 npm run dist
```

**不要更换这张证书**：换证书后，用户升级时需要重新授权一次。
