/**
 * 在线音源库 - 列表弹窗（极简稳定版）
 *
 * 设计约束（三次白屏的结论，改前务必看）：
 * - 容器：ConfirmAlert（第 1 版验证可显示）
 * - 渲染：纯 map，不用 FlatList（第 2、3 版白屏）
 * - 不用 Input 搜索框（第 4 版仍白屏，怀疑是其引入）
 * - 不用 useMemo/useEffect，只在渲染中做纯计算
 * - 翻页用最简单的方式控制单页条数，保证内容不超高
 */
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
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

const PAGE_SIZE = 12

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
  const [busyId, setBusyId] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)

  const load = useCallback(async(force = false) => {
    setLoading(true)
    setError('')
    try {
      const { index, fromCache } = await fetchSourceLibraryIndex(force)
      setItems(buildList(index))
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

  // 纯计算：同源只留第一项（数据已按版本降序排好）
  let list = items
  if (!showAll) {
    const seen: Record<string, true> = {}
    list = items.filter(item => {
      const key = String(item.name ?? '').trim().toLowerCase()
      if (seen[key]) return false
      seen[key] = true
      return true
    })
  }

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = list.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

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
            {item.author ? <Text size={12} color={theme['c-font-label']}>{ '  ' + item.author }</Text> : null}
          </Text>
          {item.description ? <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{item.description}</Text> : null}
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
          title={`${t('source_library')} ${list.length}`}
          cancelText={t('close')}
          onHide={() => { setVisible(false) }}
        >
          <View style={styles.bar}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => { setShowAll(v => !v); setPage(0) }}>
              <Text size={12} color={theme['c-button-font']}>
                {showAll ? t('source_library_unique_only') : t('source_library_all_versions')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallBtn} onPress={() => { void load(true) }}>
              <Text size={12} color={theme['c-button-font']}>
                {loading ? t('source_library_loading') : t('source_library_refresh')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => { setPage(Math.max(0, currentPage - 1)) }}
            >
              <Text size={12} color={theme['c-button-font']}>{t('source_library_prev')}</Text>
            </TouchableOpacity>
            <Text size={12} color={theme['c-font-label']}>{`${currentPage + 1}/${pageCount}`}</Text>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => { setPage(Math.min(pageCount - 1, currentPage + 1)) }}
            >
              <Text size={12} color={theme['c-button-font']}>{t('source_library_next')}</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text size={12} color={theme['c-font-label']}>{error}</Text> : null}
          {pageItems.length
            ? pageItems.map(renderItem)
            : <Text size={13} color={theme['c-font-label']} style={styles.empty}>{loading ? t('loading') : t('source_library_empty')}</Text>
          }
        </ConfirmAlert>
      : null
  )
})

const styles = createStyle({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingBottom: 6,
  },
  smallBtn: {
    marginRight: 6,
    marginBottom: 4,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.18)',
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
