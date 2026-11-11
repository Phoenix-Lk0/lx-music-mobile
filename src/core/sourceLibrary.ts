/**
 * 在线音源库 - 核心逻辑
 *
 * 纯扩展实现：
 * - 只读远端索引，不在浏览阶段执行任何脚本；
 * - 安装动作复用上游 importUserApi / handleImportScript，不重写存储结构；
 * - 版本比对只依赖上游已有的 name / version 字段。
 */
import { httpFetch } from '@/utils/request'
import { getData, saveData } from '@/plugins/storage'
import { state as userApiState } from '@/store/userApi'
import { importUserApi, removeUserApi } from '@/core/userApi'
import {
  SOURCE_LIBRARY_CACHE_KEY,
  SOURCE_LIBRARY_CACHE_TTL,
  SOURCE_LIBRARY_HASH_LIMIT,
  SOURCE_LIBRARY_INDEX_URL_KEY,
  SOURCE_LIBRARY_INSTALLED_KEY,
  SOURCE_LIBRARY_MAX_COUNT,
  SOURCE_LIBRARY_MAX_SCRIPT_SIZE,
  SOURCE_LIBRARY_URLS,
  type SourceLibraryIndex,
  type SourceLibraryItem,
  type SourceLibraryListItem,
} from '@/config/sourceLibrary'

interface CacheData {
  time: number
  index: SourceLibraryIndex
}

/* ------------------------------ sha256 ------------------------------ */

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
const toBytes = (str: string) => {
  const out: number[] = []
  const encoded = encodeURIComponent(str)
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      out.push(parseInt(encoded.substring(i + 1, i + 3), 16))
      i += 2
    } else out.push(encoded.charCodeAt(i))
  }
  return out
}

export const sha256Hex = (message: string): string => {
  const bytes = toBytes(message)
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const hi = Math.floor(bitLen / 0x100000000)
  const lo = bitLen >>> 0
  bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff)
  bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Array<number>(64).fill(0)

  for (let i = 0; i < bytes.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      const p = i + j * 4
      w[j] = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3)
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10)
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K256[j] + w[j]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
    h5 = (h5 + f) | 0
    h6 = (h6 + g) | 0
    h7 = (h7 + h) | 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(n => (n >>> 0).toString(16).padStart(8, '0'))
    .join('')
}

/* ------------------------------ 索引 ------------------------------ */

const isValidItem = (item: any): item is SourceLibraryItem => {
  return !!item && typeof item.name === 'string' && item.name.length > 0 &&
    typeof item.scriptUrl === 'string' && /^https?:\/\//.test(item.scriptUrl)
}

const normalizeIndex = (raw: any): SourceLibraryIndex => {
  if (!raw || !Array.isArray(raw.sources)) throw new Error('Invalid index format')
  const sources: SourceLibraryItem[] = []
  for (let i = 0; i < raw.sources.length; i++) {
    const item = raw.sources[i]
    if (!isValidItem(item)) continue
    sources.push({
      id: typeof item.id === 'string' && item.id ? item.id : `item_${i}`,
      name: item.name.trim(),
      author: item.author,
      description: item.description,
      version: item.version,
      scriptUrl: item.scriptUrl,
      sha256: item.sha256,
      size: item.size,
      homepage: item.homepage,
      tags: item.tags,
      quality: item.quality,
      status: item.status,
    })
  }
  return {
    schema: typeof raw.schema === 'number' ? raw.schema : 1,
    updatedAt: raw.updatedAt,
    notice: raw.notice,
    sources,
  }
}

export const getCustomIndexUrl = async(): Promise<string> => {
  try {
    const url = await getData<string>(SOURCE_LIBRARY_INDEX_URL_KEY)
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : ''
  } catch {
    return ''
  }
}

export const setCustomIndexUrl = async(url: string) => {
  await saveData(SOURCE_LIBRARY_INDEX_URL_KEY, url)
}

const getIndexUrls = async(): Promise<string[]> => {
  const custom = await getCustomIndexUrl()
  return custom ? [custom, ...SOURCE_LIBRARY_URLS] : [...SOURCE_LIBRARY_URLS]
}

const readCache = async(): Promise<CacheData | null> => {
  try {
    const cache = await getData<CacheData>(SOURCE_LIBRARY_CACHE_KEY)
    if (!cache || typeof cache.time !== 'number' || !cache.index) return null
    return cache
  } catch {
    return null
  }
}

const requestJson = async(url: string): Promise<SourceLibraryIndex> => {
  const resp = await httpFetch(url, { timeout: 12000 }).promise
  if (resp.statusCode >= 400) throw new Error(`HTTP ${resp.statusCode}`)
  const body = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body
  return normalizeIndex(body)
}

export interface FetchIndexResult {
  index: SourceLibraryIndex
  fromCache: boolean
  url: string
}

/**
 * 拉取索引：先走缓存（ttl 内），失败逐地址回退，全部失败则退回过期缓存。
 */
export const fetchSourceLibraryIndex = async(force = false): Promise<FetchIndexResult> => {
  const cache = await readCache()
  if (!force && cache && Date.now() - cache.time < SOURCE_LIBRARY_CACHE_TTL) {
    return { index: cache.index, fromCache: true, url: '' }
  }

  const urls = await getIndexUrls()
  let lastError: Error | undefined
  for (const url of urls) {
    try {
      const index = await requestJson(url)
      await saveData(SOURCE_LIBRARY_CACHE_KEY, { time: Date.now(), index } as CacheData)
      return { index, fromCache: false, url }
    } catch (err: any) {
      lastError = err
      console.log('[sourceLibrary] index failed:', url, err?.message)
    }
  }

  if (cache) return { index: cache.index, fromCache: true, url: '' }
  throw lastError ?? new Error('Index unavailable')
}

/* ------------------------------ 状态与安装 ------------------------------ */

const normalizeName = (name: string) => name.trim().toLowerCase()

export type InstallRecords = Record<string, string>

export const readInstallRecords = async(): Promise<InstallRecords> => {
  try {
    const records = await getData<InstallRecords>(SOURCE_LIBRARY_INSTALLED_KEY)
    return records && typeof records == 'object' ? records : {}
  } catch {
    return {}
  }
}

const writeInstallRecords = async(records: InstallRecords) => {
  await saveData(SOURCE_LIBRARY_INSTALLED_KEY, records)
}

/**
 * 计算每个库条目的本机状态。
 * 先用「索引 id → 本机源 id」映射判断，避免同作者多代音源 name 相同而互相误判；
 * 映射缺失时退回同名同版本匹配，兼容用户此前手动导入的源。
 */
export const buildList = async(index: SourceLibraryIndex, records?: InstallRecords): Promise<SourceLibraryListItem[]> => {
  const recs = records ?? await readInstallRecords()

  const localMap = new Map<string, { id: string, version: string }>()
  const nameMap = new Map<string, { id: string, version: string }>()
  for (const api of userApiState.list) {
    localMap.set(api.id, { id: api.id, version: api.version ?? '' })
    const key = normalizeName(api.name)
    if (!nameMap.has(key)) nameMap.set(key, { id: api.id, version: api.version ?? '' })
  }

  return index.sources.map(item => {
    const remoteVer = (item.version ?? '').trim()
    const mapped = recs[item.id] ? localMap.get(recs[item.id]) : undefined
    if (mapped) {
      const localVer = (mapped.version ?? '').trim()
      const state = remoteVer && localVer && remoteVer !== localVer ? 'outdated' as const : 'installed' as const
      return { ...item, state, localId: mapped.id, localVersion: mapped.version }
    }

    const same = nameMap.get(normalizeName(item.name))
    if (same) {
      const localVer = (same.version ?? '').trim()
      if (!remoteVer || !localVer || remoteVer === localVer) {
        return { ...item, state: 'installed' as const, localId: same.id, localVersion: same.version }
      }
    }
    return { ...item, state: 'notInstalled' as const }
  })
}

const downloadScript = async(item: SourceLibraryItem): Promise<string> => {
  const resp = await httpFetch(item.scriptUrl, { timeout: 20000 }).promise
  if (resp.statusCode >= 400) throw new Error(`HTTP ${resp.statusCode}`)
  const script = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body)
  if (!script.length) throw new Error('Empty script')
  if (script.length > SOURCE_LIBRARY_MAX_SCRIPT_SIZE) throw new Error(global.i18n.t('source_library_too_large'))

  if (item.size && Math.abs(script.length - item.size) > 2048) {
    throw new Error(global.i18n.t('source_library_size_mismatch'))
  }
  if (item.sha256 && script.length <= SOURCE_LIBRARY_HASH_LIMIT) {
    const hash = sha256Hex(script)
    if (hash.toLowerCase() !== item.sha256.trim().toLowerCase()) {
      throw new Error(global.i18n.t('source_library_hash_mismatch'))
    }
  }
  return script
}

/**
 * 安装或更新一个音源。返回 true 表示已写入源列表。
 * 已存在的同条目会先移除再导入，避免重复条目；映射表记录「索引 id → 本机源 id」。
 */
export const installItem = async(item: SourceLibraryItem): Promise<boolean> => {
  const records = await readInstallRecords()
  const current = (await buildList({ schema: 1, sources: [item] }, records))[0]
  const isUpdate = current.state === 'outdated' && !!current.localId
  if (!isUpdate && !current.localId && userApiState.list.length >= SOURCE_LIBRARY_MAX_COUNT) {
    throw new Error(global.i18n.t('source_library_max_count', { count: SOURCE_LIBRARY_MAX_COUNT }))
  }

  const script = await downloadScript(item)
  if (current.localId) await removeUserApi([current.localId])
  const info = await importUserApi(script)
  records[item.id] = info.id
  await writeInstallRecords(records)
  return true
}
