# 在线音源库索引

App 从本目录的 `index.json` 读取音源列表。客户端按以下顺序取，先成功者生效：

1. 用户在库页面内自定义的地址（如填过）
2. `https://raw.githubusercontent.com/Phoenix-Lk0/lx-music-mobile/main/library/index.json`
3. `https://cdn.jsdelivr.net/gh/Phoenix-Lk0/lx-music-mobile@main/library/index.json`
4. `https://fastly.jsdelivr.net/gh/Phoenix-Lk0/lx-music-mobile@main/library/index.json`

全部失败时回退到本机上次成功缓存（30 分钟 TTL 内不再请求）。

## index.json 结构

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schema` | number | 是 | 索引格式版本，当前为 `1` |
| `updatedAt` | string | 否 | ISO 时间，仅供展示 |
| `notice` | string | 否 | 列表顶部提示文案 |
| `sources` | array | 是 | 音源条目数组 |
| `sources[].id` | string | 是 | **稳定主键**，勿用 name 代替，同名源会串 |
| `sources[].name` | string | 是 | 展示名；与本机已装源的 name 比对，用于判定已装/可更新 |
| `sources[].author` | string | 否 | 作者 |
| `sources[].description` | string | 否 | 一行描述 |
| `sources[].version` | string | 否 | 与本机同名声明的 version 不同即显示「更新」 |
| `sources[].scriptUrl` | string | 是 | 脚本原始地址，必须是 `http(s)://` |
| `sources[].sha256` | string | 否 | 脚本 sha256，存在则校验（脚本 >2MB 时跳过） |
| `sources[].size` | number | 否 | 脚本字节数，误差 >2KB 视为不匹配 |
| `sources[].homepage` | string | 否 | 主页 |
| `sources[].tags` | string[] | 否 | 标签，保留字段 |
| `sources[].quality` | string[] | 否 | 支持音质，保留字段 |
| `sources[].status` | string | 否 | `ok` / `degraded` / `dead`；`dead` 时客户端禁用安装 |

## 新增一个音源

```bash
# 1) 脚本放到 library/scripts/<id>.js，头部注释必须有 @name / @version
# 2) 计算校验值
python3 - <<'PY'
import hashlib
d = open('library/scripts/<id>.js','rb').read()
print('size', len(d)); print('sha256', hashlib.sha256(d).hexdigest())
PY
# 3) 把条目追加到 library/index.json 的 sources 数组，version 必须与脚本头部 @version 一致
# 4) 推送后客户端「刷新」即可看到
```

## 维护约定

- 脚本失效不改历史：把 `status` 改成 `dead`，客户端会灰显并禁止安装，不会影响已装用户继续使用。
- 新增版本只改 `version` 与 `scriptUrl`/`sha256`，客户端会对已装同名声显示「更新」，更新时先移除旧源再导入，不产生重复条目。
- 单机自定义源上限 20 个、单脚本上限 9MB，与上游在线导入一致。
- `library/scripts/example.js` 是链路自测源，不提供任何音频，可长期保留。
