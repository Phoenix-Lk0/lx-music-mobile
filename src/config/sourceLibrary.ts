/**
 * 在线音源库 - 扩展配置
 *
 * 本文件为音源库版新增文件，不修改上游任何既有逻辑。
 * 上游发新版时，通常只需要同步本文件内的地址常量。
 */

/** 是否为音源库共存版，用于跳过指向官方包的更新检查等分支逻辑 */
export const LIB_EDITION = true

/**
 * 音源库索引地址，按顺序回退，可被用户在库页面内覆盖。
 * 换仓库只需改这里，其余代码不动。
 */
export const SOURCE_LIBRARY_URLS = [
  'https://raw.githubusercontent.com/Phoenix-Lk0/lx-music-mobile/main/library/index.json',
  'https://cdn.jsdelivr.net/gh/Phoenix-Lk0/lx-music-mobile@main/library/index.json',
  'https://fastly.jsdelivr.net/gh/Phoenix-Lk0/lx-music-mobile@main/library/index.json',
]

/** 索引缓存有效期（毫秒），期间重复打开列表直接读缓存 */
export const SOURCE_LIBRARY_CACHE_TTL = 30 * 60 * 1000
/** 索引缓存与自定义索引地址的本地 key，不占用上游 setting 命名空间 */
export const SOURCE_LIBRARY_CACHE_KEY = '@otb_source_library_cache'
export const SOURCE_LIBRARY_INDEX_URL_KEY = '@otb_source_library_index_url'
/** 索引条目 id → 本机自定义源 id 的映射，用于解决同名声（同作者多代音源）误判 */
export const SOURCE_LIBRARY_INSTALLED_KEY = '@otb_source_library_installed'
/** 与上游在线导入保持一致的脚本体积上限 */
export const SOURCE_LIBRARY_MAX_SCRIPT_SIZE = 9_000_000
/** 与上游 ImportBtn 保持一致的源数量上限 */
export const SOURCE_LIBRARY_MAX_COUNT = 20
/** 超过该体积只校验大小、跳过 sha256（纯 JS 计算过慢） */
export const SOURCE_LIBRARY_HASH_LIMIT = 2 * 1024 * 1024

export type SourceLibraryItemState = 'notInstalled' | 'installed' | 'outdated'

export interface SourceLibraryItem {
  /** 稳定主键，勿用 name 代替，同名源会串 */
  id: string
  name: string
  author?: string
  description?: string
  version?: string
  scriptUrl: string
  sha256?: string
  size?: number
  homepage?: string
  tags?: string[]
  quality?: string[]
  status?: 'ok' | 'degraded' | 'dead'
}

export interface SourceLibraryIndex {
  schema: number
  updatedAt?: string
  notice?: string
  sources: SourceLibraryItem[]
}

export interface SourceLibraryListItem extends SourceLibraryItem {
  state: SourceLibraryItemState
  localId?: string
  localVersion?: string
}
