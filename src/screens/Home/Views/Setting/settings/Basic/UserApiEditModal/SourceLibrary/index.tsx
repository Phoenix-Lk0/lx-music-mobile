/**
 * 在线音源库 - 列表弹窗
 *
 * 容器说明（真机验证过程，勿随意改动）：
 * - ConfirmAlert 能正常显示，但其内部 ScrollView 是 flexGrow:0，
 *   内容超高后被弹窗 maxHeight 裁掉且无法滚动（截图确认的"划不动"现象）
 * - 因此改用 ConfirmAlert 的父组件 Dialog，并传入**数字**高度：
 *   传 '80%' 这类百分比时，在居中容器内与 maxHeight 冲突会被算成 0 导致白屏
 * - 高度固定后，内部 ScrollView 用 flex:1 即可正常滚动
 */
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { View, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
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

// 必须是数字：百分比在 Dialog 的居中容器里会与 maxHeight 冲突
const PANEL_HEIGHT = Math.round(Dimensions.get('window').height * 0.75)

const formatVersion = (version?: string) => {
  if (!version) return ''
  return /^\d/.test(version) ? `v${version}` : version
}

export default forwardRef<SourceLibraryType, {}>((_props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  useUserApiList()

  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SourceLibraryListItem[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

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
        dialogRef.current?.setVisible(true)
      })
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
          {item.description ? <Text size={12} color={theme['c-font-label']} numberOfLines={2}>{item.description}</Text> : null}
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
    <Dialog
      ref={dialogRef}
      title={`${t('source_library')} ${items.length}`}
      height={PANEL_HEIGHT}
      onHide={() => { setVisible(false) }}
    >
      <View style={styles.body}>
        <View style={styles.bar}>
          <Text size={12} color={theme['c-font-label']}>
            {loading ? t('source_library_loading') : `${items.length}`}
          </Text>
          <TouchableOpacity style={styles.smallBtn} onPress={() => { void load(true) }}>
            <Text size={12} color={theme['c-button-font']}>{t('source_library_refresh')}</Text>
          </TouchableOpacity>
        </View>
        {error ? <Text size={12} color={theme['c-font-label']}>{error}</Text> : null}
        {/* 高度已由 Dialog 固定，此处 flex:1 才能滚动 */}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {items.length
            ? items.map(renderItem)
            : <Text size={13} color={theme['c-font-label']} style={styles.empty}>{loading ? t('loading') : t('source_library_empty')}</Text>
          }
        </ScrollView>
      </View>
    </Dialog>
  )
})

const styles = createStyle({
  body: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  smallBtn: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
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
