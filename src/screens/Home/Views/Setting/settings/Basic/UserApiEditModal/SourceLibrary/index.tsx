/**
 * 在线音源库 - 全屏弹层
 *
 * 容器演进记录（前四版都白屏，勿回退）：
 * 1. ConfirmAlert：能显示但内容超高后滑不动（其内部 ScrollView 无高度约束）
 * 2. Dialog + height:'80%'：百分比高度在居中容器里算成 0 → 白屏
 * 3. ConfirmAlert + FlatList：VirtualizedList 嵌 ScrollView 渲染空白
 * 4. ConfirmAlert + map 分页：真机仍渲染失败
 *
 * 本版改为最底层组合：Modal + 固定像素面板 + 显式 flex:1 的 ScrollView，
 * 高度全部是算好的数字，不依赖任何父容器推算。
 */
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { View, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native'
import Modal, { type ModalType } from '@/components/common/Modal'
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

const SCREEN = Dimensions.get('window')
const PANEL_WIDTH = Math.round(SCREEN.width * 0.94)
const PANEL_HEIGHT = Math.round(SCREEN.height * 0.78)

const formatVersion = (version?: string) => {
  if (!version) return ''
  return /^\d/.test(version) ? `v${version}` : version
}

export default forwardRef<SourceLibraryType, {}>((_props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  useUserApiList()

  const modalRef = useRef<ModalType>(null)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SourceLibraryListItem[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [showAll, setShowAll] = useState(false)

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
      setVisible(true)
      requestAnimationFrame(() => {
        modalRef.current?.setVisible(true)
      })
      void load()
    },
  }))

  const close = () => {
    modalRef.current?.setVisible(false)
    setVisible(false)
  }

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

  const renderItem = (item: SourceLibraryListItem, index: number) => {
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
      <View style={styles.item} key={`${item.id}_${index}`}>
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

  if (!visible) return null

  return (
    <Modal ref={modalRef} bgHide={false} keyHide onHide={() => { setVisible(false) }}>
      <View style={styles.mask}>
        <View
          style={{
            ...styles.panel,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
            backgroundColor: theme['c-content-background'],
          }}
        >
          <View style={styles.titleRow}>
            <Text size={14} numberOfLines={1}>{`${t('source_library')}  ${list.length}`}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={close}>
              <Text size={13} color={theme['c-button-font']}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bar}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => { setShowAll(v => !v) }}>
              <Text size={12} color={theme['c-button-font']}>
                {showAll ? t('source_library_unique_only') : t('source_library_all_versions')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallBtn} onPress={() => { void load(true) }}>
              <Text size={12} color={theme['c-button-font']}>
                {loading ? t('source_library_loading') : t('source_library_refresh')}
              </Text>
            </TouchableOpacity>
          </View>
          {error ? <Text size={12} color={theme['c-font-label']}>{error}</Text> : null}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {list.length
              ? list.map((item, i) => renderItem(item, i))
              : <Text size={13} color={theme['c-font-label']} style={styles.empty}>{loading ? t('loading') : t('source_library_empty')}</Text>
            }
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
})

const styles = createStyle({
  mask: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    borderRadius: 6,
    paddingTop: 8,
    paddingLeft: 10,
    paddingRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  closeBtn: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.25)',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
  },
  smallBtn: {
    marginRight: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 12,
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
