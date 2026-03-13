# KeyFarm

Tauri v2 桌面應用 (macOS)，搭配 React + Vite 前端。

## 發布流程

Build → Sign → Notarize → Staple → Upload R2 → Deploy site

一鍵執行：`./sign-and-build.sh`（gitignored，含 API token）

## 部署網站

```bash
npx wrangler pages deploy site --project-name keyfarm
```

- Pages project: `keyfarm`
- Domain: `keyfarm.dorara.app`
- **每次修改 `site/` 後都要執行部署**

## R2 儲存

- Bucket: `keyfarm` (APAC)
- Account ID: `cf9381b225a13388f22692beeefb568f`
- Public URL: `https://r2keyfarm.dorara.app/keyfarm/KeyFarm_0.1.0_aarch64.dmg`
- Upload 透過 Cloudflare API（bearer token 在 sign-and-build.sh 中）

## 重要路徑

| 檔案 | 說明 |
|------|------|
| `sign-and-build.sh` | 簽署打包上傳腳本（gitignored） |
| `site/` | 官網靜態檔 |
| `src-tauri/tauri.conf.json` | Tauri 設定、版本號 |
| `src-tauri/target/release/bundle/dmg/` | DMG 輸出位置 |

## 更新版本時

同步修改：`tauri.conf.json` 版本號、`sign-and-build.sh` DMG 路徑、`site/index.html` 下載連結。
