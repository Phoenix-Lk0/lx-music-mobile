/**
 * 在线音源库 - 列表弹窗
 *
 * 布局约束（踩过的坑，勿随意改动）：
 * - 容器必须是 ConfirmAlert：它已验证可正常显示；Dialog 的百分比高度在居中容器里会算成 0 → 白屏
 * - 列表渲染必须用 map，不能用 FlatList：VirtualizedList 嵌在 ConfirmAlert 的 ScrollView 里会渲染空白
 * - 因此用分页控制单页条数，保证内容不超出弹窗可视高度，不需要滚动
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Input from '@/components/common/Input'
import Text from '@/components/common/Text'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useUserApiList } from '@/store/userApi'
import { buildList, fetchSourceLibraryIndex, installItem } from '@/core/sourceLibrary'
import { type SourceLibraryListItem } from '@/config/sourceLibrary'

export interface SourceLibraryType {
  show: () => void
}

// 单页条数：10 条 × 约 64px ≈ 640px，稳定落在弹窗可视区内
const PAGE_SIZE = 10

const formatVersion = (version?: string) => {
  if (!version) return ''
  return /^\d/.test(version) ? `v${version}` : version
}

export default forwardRef<SourceLibraryType, {}>((_props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  useUserApiList()

  const alertRef = useRef<ConfirmAlertType>(null)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SourceLibraryListItem[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)

  const load = useCallback(async(force = false) => {
    setLoading(true)
    setError('')
    try {
      const { index, fromCache } = await fetchSourceLibraryIndex(force)
      setItems(buildList(index))
      setNotice(index.notice ?? '')
      if (fromCache) setError(t('source_library_offline_cache'))
    } catch (err: any) {
      setItems([])
      setError(t('source_library_load_failed', { message: err?.message ?? 'unknown' }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useImperativeHandle(ref, () => ({
    show() {
      if (visible) {
        alertRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          alertRef.current?.setVisible(true)
        })
      }
      setPage(0)
      void load()
    },
  }))

  const handleInstall = async(item: SourceLibraryListItem) => {
    if (busyId) return
    if (item.status == 'dead') {
      toast(t('source_library_dead_tip'), 'long')
      return
    }
    setBusyId(item.id)
    try {
      await installItem(item)
      toast(t('source_library_install_success', { name: item.name }))
      await load(true)
    } catch (err: any) {
      toast(t('source_library_install_failed', { message: err?.message ?? 'unknown' }), 'long')
    } finally {
      setBusyId('')
    }
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const list = kw
      ? items.filter(i => (i.name + (i.author ?? '') + (i.description ?? '')).toLowerCase().includes(kw))
      : items
    return [...list].sort((a, b) => {
      const rank = (x: SourceLibraryListItem) => (x.status == 'dead' ? 2 : x.state == 'installed' ? 1 : 0)
      return rank(a) - rank(b)
    })
  }, [items, keyword])

  // 默认每个音源只显示最新版，避免同名多版本刷屏
  const display = useMemo(() => {
    if (showAll) return filtered
    const seen = new Set<string>()
    return filtered.filter(item => {
      const key = item.name.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [filtered, showAll])

  const pageCount = Math.max(1, Math.ceil(display.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = display.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    setPage(0)
  }, [keyword, showAll])

  const renderItem = (item: SourceLibraryListItem) => {
    const busy = busyId == item.id
    const installed = item.state == 'installed'
    const outdated = item.state == 'outdated'
    const dead = item.status == 'dead'
    const btnText = busy
      ? t('source_library_installing')
      : installed
        ? t('source_library_installed')
        : outdated
          ? t('source_library_update')
          : t('source_library_install')

    return (
      <View style={styles.item} key={item.id}>
        <View style={styles.itemInfo}>
          <Text size={15} numberOfLines={1}>
            {item.name}
            {item.version ? <Text size={12} color={theme['c-font-label']}>{ '  ' + formatVersion(item.version) }</Text> : null}
          </Text>
          {item.author ? <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{item.author}</Text> : null}
        </View>
        <TouchableOpacity
          style={{
            ...styles.btn,
            backgroundColor: dead || installed ? theme['c-primary-input-background'] : theme['c-button-background'],
          }}
          disabled={busy || installed || dead}
          onPress={() => { void handleInstall(item) }}
        >
          <Text size={13} color={dead ? theme['c-font-label'] : theme['c-button-font']}>
            {dead ? t('source_library_dead') : btnText}
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    visible
      ? <ConfirmAlert
          ref={alertRef}
          showConfirm={false}
          title={`${t('source_library')}  ${display.length}`}
          cancelText={t('close')}
          onHide={() => { setVisible(false) }}
        >
          <View style={styles.toolbar}>
            <Input
              value={keyword}
              onChangeText={setKeyword}
              placeholder={t('source_library_search')}
              style={{ ...styles.search, backgroundColor: theme['c-primary-input-background'] }}
              size={13}
            />
            <TouchableOpacity style={styles.smallBtn} onPress={() => { void load(true) }}>
              <Text size={12} color={theme['c-button-font']}>
                {loading ? t('source_library_loading') : t('source_library_refresh')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.toolbar}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => { setShowAll(v => !v) }}>
              <Text size={12} color={theme['c-button-font']}>
                {showAll ? t('source_library_unique_only') : t('source_library_all_versions')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smallBtn}
              disabled={currentPage <= 0}
              onPress={() => { setPage(p => Math.max(0, p - 1)) }}
            >
              <Text size={12} color={theme['c-button-font']}>{t('source_library_prev')}</Text>
            </TouchableOpacity>
            <Text size={12} color={theme['c-font-label']}>{` ${currentPage + 1}/${pageCount} `}</Text>
            <TouchableOpacity
              style={styles.smallBtn}
              disabled={currentPage >= pageCount - 1}
              onPress={() => { setPage(p => Math.min(pageCount - 1, p + 1)) }}
            >
              <Text size={12} color={theme['c-button-font']}>{t('source_library_next')}</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text size={12} color={theme['c-font-label']} style={styles.notice}>{error}</Text> : null}
          {notice ? <Text size={11} color={theme['c-font-label']} style={styles.notice} numberOfLines={2}>{notice}</Text> : null}
          {pageItems.length
            ? pageItems.map(renderItem)
            : <Text size={13} color={theme['c-font-label']} style={styles.empty}>{loading ? t('loading') : t('source_library_empty')}</Text>
          }
        </ConfirmAlert>
      : null
  )
})

const styles = createStyle({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
  },
  search: {
    flex: 1,
    height: 32,
    borderRadius: 4,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 13,
  },
  smallBtn: {
    marginLeft: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  notice: {
    paddingBottom: 4,
  },
  empty: {
    paddingTop: 30,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 7,
    paddingBottom: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  itemInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 10,
  },
  btn: {
    minWidth: 62,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
})
