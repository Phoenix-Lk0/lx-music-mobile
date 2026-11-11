日期 / 2026-11-11
类型 / 说明
状态 / 已完成，待用户在 PC 端执行
关联 / lx-music-mobile v1.9.2（0669d1b）、feat/source-library（388a929）、dist/0001-feat-Lib-Edition.patch

# 音源库版（Lib Edition）：打包、构建、部署完整教程

对象：`lx-music-mobile` v1.9.2 源码 + 在线音源库扩展（保留本地导入/在线导入，与官方版共存）。
本文所有命令均可直接复制执行；每一步都给出「通过判据」和「失败怎么办」。

---

## 零、交付包里有什么

```
lx-music-mobile-1.9.2-lib/          ← 完整 git 仓库（含 .git，已在 feat/source-library 分支上提交）
├── .git/                           ← 提交 388a929 已在里面，历史完整可继续开发
├── src/config/sourceLibrary.ts     ← 新增：索引地址、缓存 key、上限、类型
├── src/core/sourceLibrary.ts       ← 新增：拉索引/多地址回退/sha256/状态判定/安装
├── src/screens/.../SourceLibrary/  ← 新增：音源库列表弹窗
├── src/screens/.../ImportBtn.tsx   ← 改：菜单变三项（本地/在线/音源库）
├── library/index.json              ← 13 个本机实测可用音源（脚本自托管）
├── library/index.full.json         ← 317 条镜像音源（可选装载）
├── library/scripts/*.js            ← 13 个脚本实体
├── LIB_EDITION.md                  ← 改动清单与设计说明
└── docs/BUILD_AND_DEPLOY.md        ← 本文
```

另有 `dist/0001-feat-Lib-Edition.patch`（707KB），可用 `git am` 把同一套改动打到任意 v1.9.2 源码上。

**包里没有 `node_modules`**（329MB，可随时重装），也没有构建产物。

---

## 一、PC 环境准备

| 组件 | 版本要求 | 检查命令 | 说明 |
|---|---|---|---|
| Node.js | **18 或 20**（LTS） | `node -v` | 不要用 22+，上游 `.nvmrc` 锁的是 18/20；本机实测 Node 26 会导致依赖安装卡死 |
| npm | ≥ 8.5.2 | `npm -v` | 随 Node 提供 |
| JDK | **17** | `java -version` | Android Gradle Plugin 8.6.1 要求 17，21 会报不兼容 |
| Android SDK | **Platform 36** + Build-Tools 34/35/36 | — | 在 Android Studio → SDK Manager 勾选 |
| NDK | **26.1.10909125** | — | RN 0.73 默认；SDK Manager → NDK (Side by side) |
| Git | 2.30+ | `git version` | |
| 磁盘 | ≥ 8GB 空闲 | — | 依赖 + 构建中间产物 |

环境变量（Linux/macOS，写进 `~/.bashrc`）：

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
export JAVA_HOME=/path/to/jdk-17
```

Windows 用系统环境变量面板设置同名变量；`ANDROID_HOME` 指向 `C:\Users\<你>\AppData\Local\Android\Sdk`。

**通过判据**：`node -v` 出 v18.x/v20.x，`java -version` 出 17.x，`ls $ANDROID_HOME/platforms` 里有 `android-36`。

---

## 二、第一步：替换用户名占位符（必做，否则音源库拉不到列表）

包内所有索引地址写的是 `Phoenix-Lk0` / `lx-music-mobile` 占位符，必须先换成你的账号。

```bash
cd lx-music-mobile-1.9.2-lib

# 改成你自己的
OWNER=your-github-name
REPO=lx-music-mobile-lib

grep -rl "Phoenix-Lk0" . --exclude-dir=.git \
  | xargs sed -i "s/Phoenix-Lk0/$OWNER/g; s/lx-music-mobile/$REPO/g"
```

**通过判据**：

```bash
grep -rn "{{GH_" src library | wc -l     # 必须输出 0
grep -n "raw.githubusercontent" src/config/sourceLibrary.ts | head -1
# 期望看到 https://raw.githubusercontent.com/your-github-name/lx-music-mobile-lib/main/library/index.json
```

如果你**暂时不想用 GitHub**，可以跳过本节，改在 App 内「音源库 → 自定义地址」填任意可访问的 `index.json` URL（见第六节 6.5）。代码里的占位符此时不会生效，但也不报错。

---

## 三、方式 A：推到 GitHub，用 Actions 出包（推荐，手机也能拿到 APK）

### 3.1 建空仓库

打开 https://github.com/new：

- Repository name：`lx-music-mobile-lib`
- 可见性：建议 **Private**（脚本与索引属个人配置）
- **不要**勾选 Add README / .gitignore / license（否则首次 push 冲突）

点 Create repository。

### 3.2 推送（SSH 方式，推荐）

```bash
cd lx-music-mobile-1.9.2-lib

# 没有 ssh key 就先生成
ssh-keygen -t ed25519 -C "lx-lib" -f ~/.ssh/id_ed25519_lxlib -N ""

# 把公钥内容贴到 https://github.com/settings/ssh/new
cat ~/.ssh/id_ed25519_lxlib.pub

# 让本仓库用这把 key
git config core.sshCommand "ssh -i ~/.ssh/id_ed25519_lxlib"

git remote add origin git@github.com:$OWNER/lx-music-mobile-lib.git
git push -u origin feat/source-library
```

验证 SSH 连通：`ssh -T git@github.com`，回 `Hi <你的名字>! You've successfully authenticated`。

> 注意：默认分支保持 `master`（上游默认分支名），我们只推 `feat/source-library` 功能分支。第一次 push 后去仓库 Settings → Branches，把默认分支改成 `feat/source-library`，否则 Actions 页面默认看不懂。

### 3.3 推送（PAT 方式，如果 SSH 被网络挡住）

https://github.com/settings/tokens → Generate new token (classic) → 勾 `repo` → 生成后复制。

```bash
git remote add origin https://github.com/$OWNER/lx-music-mobile-lib.git
git push -u origin feat/source-library
# 用户名填 GitHub 用户名，密码位置粘贴 PAT（不是账号密码）
```

用完立即在 tokens 页面 Revoke 该 token。

### 3.4 生成自签 keystore（只需一次，务必备份）

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore release.keystore -alias lxlib \
  -keyalg RSA -keysize 2048 -validity 36500 \
  -storepass 'LXlib2026pass' -keypass 'LXlib2026pass' \
  -dname 'CN=lx-music-lib, OU=otb, O=otb, L=CN, S=CN, C=CN'

base64 -w0 release.keystore > release.b64      # macOS 用 base64 -i release.keystore -o release.b64
wc -c release.b64
```

**重要**：keystore 丢失后无法再给已装 App 升级（只能卸载重装丢数据）。把 `release.keystore` 和两个密码存到你自己的密码库。

### 3.5 配 Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret，逐个添加：

| Name | Value |
|---|---|
| `KEYSTORE_STORE_FILE` | `release.keystore` |
| `KEYSTORE_STORE_FILE_BASE64` | `release.b64` 文件的**全部内容**（一行，无换行） |
| `KEYSTORE_KEY_ALIAS` | `lxlib` |
| `KEYSTORE_PASSWORD` | 3.4 生成的 storepass |
| `KEYSTORE_KEY_PASSWORD` | 3.4 生成的 keypass |

**通过判据**：五个 secret 全部显示 Updated，名字大小写完全一致（大小写错会导致构建里 `signingConfig` 取空值而失败）。

### 3.6 触发构建并取包

`.github/workflows/build-lib.yml` 已配置为「push 到 `feat/source-library` 自动构建」：

1. 随便改一点东西再 push（例如 `git commit --allow-empty -m "ci: trigger" && git push`）
2. 仓库 → Actions → **Build (Lib Edition)** → 最新一次运行
3. 约 8–15 分钟（首次含依赖安装），绿勾后页面底部 **Artifacts** 下载 `lx-music-lib-<run号>.zip`

包内 5 个 APK（按 ABI 拆分 + universal）。手机装 `universal` 或 `arm64-v8a`。

**失败怎么办**：

| 现象 | 原因 | 处理 |
|---|---|---|
| `Keystore was tampered with, or password was incorrect` | Secrets 值带换行/空格 | 重填，base64 要一整行 |
| `SDK location not found` | runner 缺 SDK | 在 workflow 的 Build 步骤前加 `- uses: android-actions/setup-android@v3` |
| `Process completed with exit code 1` 且日志含 `npm ci` 失败 | `package-lock.json` 与 Node 版本不匹配 | 本地 `npm install` 后提交新 lock |
| 卡在 `react-native-track-player` | 该依赖走 GitHub 源，runner 网络抖动 | 重新 Run workflow 即可 |

---

## 四、方式 B：本地直接构建（不经过 GitHub）

```bash
cd lx-music-mobile-1.9.2-lib

# 1) 安装依赖（必须 18/20，别用 npm install 的 --legacy-peer-deps 除非报 peer 冲突）
npm ci || npm install

# 2) 给 release 签名配置准备 keystore.properties
cat > android/keystore.properties <<'EOF'
storeFile=release.keystore
storePassword=LXlib2026pass
keyAlias=lxlib
keyPassword=LXlib2026pass
EOF
cp release.keystore android/app/release.keystore

# 3) 构建
cd android
./gradlew assembleRelease
```

产物目录：`android/app/build/outputs/apk/release/`，文件名形如 `lx-music-mobile-v1.9.2-arm64-v8a.apk`。

> 说明：`android/app/build.gradle` 的 `signingConfigs.release` 分支在**没有** `-PMYAPP_UPLOAD_STORE_FILE` 参数时会去读 `android/keystore.properties`，所以上面第 2 步是必需的，否则构建直接报 `keystore.properties (No such file)`。

**通过判据**：`ls -lh android/app/build/outputs/apk/release/*.apk` 有输出且单个 ≥ 20MB。

**首次构建常见报错**：

| 报错 | 处理 |
|---|---|
| `Could not find com.android.tools.build:gradle:8.6.1` | 网络问题，重试或配 `gradle.properties` 代理 |
| `NDK not configured` | SDK Manager 装 NDK 26.1.10909125，或 `local.properties` 写 `ndk.dir=...` |
| `JavaScript bundle failed` | `node -v` 不是 18/20 |
| OOM `Java heap space` | `android/gradle.properties` 里 `org.gradle.jvmargs=-Xmx4g` |

---

## 五、安装到手机并验证（这一步决定共存是否成立）

```bash
adb install -r android/app/build/outputs/apk/release/lx-music-mobile-v1.9.2-arm64-v8a.apk
# 或直接把 APK 传到手机点击安装
```

**共存验证清单**（逐项核，缺一不算通过）：

| # | 判据 | 通过条件 |
|---|---|---|
| 1 | 桌面图标 | 出现「洛雪音乐助手+」，**官方版图标仍在**，两者可同时打开 |
| 2 | 包名 | `adb shell pm list packages \| grep toside` 输出两行：`cn.toside.music.mobile` 与 `cn.toside.music.mobile.otb` |
| 3 | 数据隔离 | 在 + 版里加一首歌，官方版歌单不受影响 |
| 4 | 原有导入 | 设置 → 自定义源管理 → 导入 ▾ 菜单出现三项：本地导入 / 在线导入 / 从音源库导入 |
| 5 | 在线导入照旧 | 选「在线导入」，粘贴任意脚本 URL，能导入成功（说明上游功能未被破坏） |
| 6 | 音源库 | 选「从音源库导入」，2 秒内出 13 条列表；若仓库未推或索引地址未替换或索引地址未替换，会显示「音源库加载失败」 |
| 7 | 安装单个音源 | 点某条「安装」→ toast「xx 已导入」→ 状态变「已安装」→ 关闭弹窗，下面源列表出现该源 |
| 8 | 选择并播放 | 选中该源，搜索一首歌能出结果且能播放（验证脚本真的可用） |
| 9 | 更新识别 | 手改仓库 `library/index.json` 里某条 `version`（加一位），重进音源库 → 该条显示「更新」+ 本地版本号 |
| 10 | 上限保护 | 本地已有 20 个源时点安装 → 提示「自定义源已达上限（20）」且不崩 |
| 11 | 持久化 | 杀进程重启，已装源与选中状态保持 |
| 12 | 更新检查 | 冷启动不弹「发现新版本」（共存版已关闭官方更新检查） |

---

## 六、音源库日常维护

### 6.1 新增一个音源

```bash
cd lx-music-mobile-1.9.2-lib

# 1) 脚本放进去，文件名用英文 slug（避免 URL 里出现中文需转义）
cp /path/to/新音源.js library/scripts/xinyuan-v1.js

# 2) 算校验值
python3 - <<'PY'
import hashlib
p='library/scripts/xinyuan-v1.js'
d=open(p,'rb').read()
print('size', len(d)); print('sha256', hashlib.sha256(d).hexdigest())
PY

# 3) 编辑 library/index.json，在 sources 数组里加一条
```

条目模板（字段含义见 `library/README.md`）：

```json
{
  "id": "xinyuan-v1",
  "name": "脚本头部 @name 的值",
  "author": "作者",
  "description": "一句话说明",
  "version": "1.0.0",
  "scriptUrl": "https://raw.githubusercontent.com/<OWNER>/<REPO>/main/library/scripts/xinyuan-v1.js",
  "sha256": "上一步算出的值",
  "size": 12345,
  "tags": ["已验证"],
  "status": "ok"
}
```

`id` 必须唯一；`name` 建议与脚本头部 `@name` 一致（客户端优先用 id 映射判定状态，name 只做兜底匹配与展示）。

### 6.2 更新已有音源

只改三处：`version`（提高）、`sha256`、`size`；`scriptUrl` 若换了文件名也要改。

App 端表现：该条显示「本地版本 v1.0.0」+ 按钮变「更新」；点更新会**先删旧源再导入新源**，不会产生重复条目，映射关系自动指向新 id。

### 6.3 标记失效

把 `"status": "ok"` 改成 `"status": "dead"`。App 端该条灰显、按钮禁用、点击提示「该音源已标记为失效」。**已装的用户不受影响**，可继续用。

### 6.4 改完要做什么

```bash
git add library && git commit -m "library: 新增 xinyuan-v1" && git push
```

App 端进「音源库」→ 点右上「刷新」（缓存 TTL 30 分钟，刷新是强制的）。

### 6.5 不依赖 GitHub 的索引托管

任何能返回静态 JSON 的地址都行（对象存储、自己的服务器、Gitee raw、jsDelivr 加速的别家仓库）。两种用法：

- **全局替换**：改 `src/config/sourceLibrary.ts` 里 `SOURCE_LIBRARY_URLS` 数组后重新构建；
- **不改代码**：在 App 里进入音源库后填自定义地址（存于 `@otb_source_library_index_url`），优先于内置地址。这个入口当前版本未挂 UI，需要走 `setCustomIndexUrl()`；如果你要我加一个「设置索引地址」的输入框，说一声，改动约 15 行。

镜像回退顺序（自动）：自定义地址 → raw.githubusercontent → jsDelivr → fastly.jsDelivr；全失败回退上次成功缓存。

---

## 七、跟进上游更新（这是本方案的核心价值）

```bash
cd lx-music-mobile-1.9.2-lib

# 只做一次
git remote add upstream https://github.com/lyswhut/lx-music-mobile.git

# 每次上游发版
git fetch upstream --tags
git checkout feat/source-library
git rebase v1.9.3            # 换成本次的新 tag
```

冲突只会出现在这 5 处（按概率排序）：

| 文件 | 冲突形态 | 处理原则 |
|---|---|---|
| `src/lang/zh-cn.json`（及 tw/en） | 尾部 key 区域 | 两边都保留，我们的 key 在后 |
| `.../UserApiEditModal/ImportBtn.tsx` | 菜单数组与 handleAction | 保留上游结构，把 `library` 项和分支塞回去 |
| `src/config/constant.ts` | 若上游动了 `APP_PROVIDER_NAME` | 用**新 applicationId** 的那行 |
| `android/app/build.gradle` | 若上游改 applicationId | 保持 `cn.toside.music.mobile.otb` |
| `src/core/userApi.ts` | `importUserApi` 签名 | 保留 `return info` |

```bash
# 解完冲突
git add -A && git rebase --continue
git push -f origin feat/source-library
```

**不要改的两点**：`namespace` 和 Java 包名（改了要重排每个 `.java` 的 package 与 import，毫无收益）。

**验证 rebase 没破功**：`grep -rn "{{GH_" src library | wc -l` 应为 0；`git diff upstream/master --stat` 应只剩上表 13 个文件左右。

---

## 八、故障排查

| 现象 | 定位 | 处理 |
|---|---|---|
| 音源库弹窗一直「加载中」 | 索引地址不可达 | 手机浏览器直接打开 index.json URL，能打开说明是 App 问题；打不开说明地址/仓库可见性有问题（Private 仓库的 raw 需要 token，**建议把仓库设为 Public，或改用 jsDelivr + 公开仓库**） |
| 「音源库加载失败」 | 同上，或 JSON 语法错 | `python3 -m json.tool library/index.json > /dev/null` 校验 |
| 列表出来但安装报「脚本校验失败」 | `sha256` 与文件不符 | 重算 sha256；若脚本被 CDN 压缩过（极少），删掉 `sha256` 字段只留 `size` |
| 安装成功但选中后搜不到歌 | 源本身失效 | 把该条置 `dead`，换一个源；这是第三方源常态 |
| 更新按钮点了没变化 | 版本号没真的变 | 确认 `version` 字符串与本地不同（`v1.0` 与 `1.0` 视为不同，会导致误判「更新」，保持格式统一） |
| 装了 + 版后官方版被覆盖 | applicationId 没生效 | `adb shell dumpsys package cn.toside.music.mobile.otb \| head` 看 `versionName`；若包名仍是官方，说明构建用了旧 checkout |
| 冷启动白屏 | JS bundle 未打进 release | 用 `./gradlew assembleRelease` 而不是 `assembleDebug`；debug 版需要 Metro |

日志抓取：

```bash
adb logcat -c && adb logcat | grep -iE "sourceLibrary|user_api|ReactNativeJS"
```

---

## 九、回滚与卸载

- **只回滚代码**：`git reset --hard 388a929` 或 `git checkout master`（上游原版）。
- **只撤扩展、保留仓库**：`git revert 388a929`。
- **手机上卸载 + 版**：设置 → 应用 → 洛雪音乐助手+ → 卸载。官方版与数据完全不受影响。
- **换签名**（keystore 丢了）：必须先卸载 + 版再装新包，数据会丢；这是 Android 的签名约束，无解。

---

## 十、一句话验收

`adb shell pm list packages | grep toside` 出两行、音源库列出 13 条、随便装一条能搜到歌并播放 —— 三条同时成立，本方案落地成功。
