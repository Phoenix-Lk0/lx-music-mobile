# 音源库版（Lib Edition）说明

本分支在 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 之上叠加**在线音源库**功能，其余功能、UI、音源协议、播放内核全部保持上游原样，可与官方版共存安装。

上游基线：**v1.9.2**（`0669d1b`）。

## 与上游的差异

| 类型 | 路径 | 内容 |
|---|---|---|
| 新增 | `src/config/sourceLibrary.ts` | 索引地址、缓存 key、上限常量、类型定义 |
| 新增 | `src/core/sourceLibrary.ts` | 拉索引 / 多地址回退 / sha256 校验 / 版本比对 / 安装 |
| 新增 | `src/screens/Home/Views/Setting/settings/Basic/UserApiEditModal/SourceLibrary/index.tsx` | 列表弹窗 |
| 新增 | `library/` | 索引与脚本托管目录（不影响构建） |
| 新增 | `.github/workflows/build-lib.yml` | 本分支专用构建，只出 artifact，不建 tag/release |
| 修改 | `.../UserApiEditModal/ImportBtn.tsx` | 菜单追加「从音源库导入」；本地导入、在线导入两项**原样保留** |
| 修改 | `src/lang/{zh-cn,zh-tw,en-us}.json` | 追加 21 个文案 key（三份必须同步，类型由 zh-cn 推导） |
| 修改 | `src/config/constant.ts` | `APP_PROVIDER_NAME` 随 applicationId 改为 `cn.toside.music.mobile.otb.provider` |
| 修改 | `src/core/version.ts` | 跳过官方更新检查（官方包签名不同，无法覆盖安装） |
| 修改 | `android/app/build.gradle` | `applicationId` → `cn.toside.music.mobile.otb`，实现与官方版共存 |
| 修改 | `app.json` | 显示名 → `洛雪音乐助手+`，`name` 保持不变 |
| 修改 | `android/app/src/main/AndroidManifest.xml` | 追加 `lxmusiclib://` scheme，`lxmusic://` 保留 |

`namespace` 与 Java 包名未改动，避免 R 类与模块路径全线重排。

## 跟进上游更新

```bash
git remote add upstream https://github.com/lyswhut/lx-music-mobile.git
git fetch upstream --tags
git checkout feat/source-library
git rebase vX.Y.Z
# 冲突通常只出现在 constant.ts / ImportBtn.tsx / 三份 lang json
git push -f origin feat/source-library
```

设计上把业务代码全部放在新增文件里，上游文件只做「加一行、加一项、改一个常量」级别的改动，因此冲突面固定且可预判。`src/utils/data.ts` 与 `src/types/user_api.d.ts` **未改动**——版本比对只用上游已有的 `name` / `version` 字段。

## 构建

`.github/workflows/build-lib.yml` 在推送到 `feat/source-library` 时构建 release APK 并上传 artifact，需要仓库 Secrets：

| Secret | 说明 |
|---|---|
| `KEYSTORE_STORE_FILE` | keystore 文件名，如 `release.keystore` |
| `KEYSTORE_STORE_FILE_BASE64` | 该文件的 base64 |
| `KEYSTORE_KEY_ALIAS` | 别名 |
| `KEYSTORE_PASSWORD` | store 密码 |
| `KEYSTORE_KEY_PASSWORD` | key 密码 |

生成自签 keystore：

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore release.keystore -alias lxlib \
  -keyalg RSA -keysize 2048 -validity 36500 \
  -storepass '{{STORE_PASS}}' -keypass '{{KEY_PASS}}' \
  -dname 'CN=lx-music-lib, OU=otb, O=otb, L=CN, S=CN, C=CN'
base64 -w0 release.keystore > release.b64   # 内容填 KEYSTORE_STORE_FILE_BASE64
```

## 共存说明

- 包名不同 → 可与官方版同时安装，两边数据完全隔离（AsyncStorage 与文件目录均随包名隔离）。
- 签名不同 → 本版无法覆盖安装官方版，反之亦然；这是共存的前提，不是缺陷。
- 更新检查已关闭 → 不会提示下载官方包导致安装失败。

## 许可

上游为 Apache-2.0。本分支保留原始 `LICENSE` 与作者声明，改动文件不额外施加限制。索引目录 `library/` 内的第三方音源脚本版权归各自作者，本仓库仅做索引。
