/**
 * 在线音源库 - 列表弹窗
 *
 * 性能与容器约束（真机验证过程，改动前必读）：
 * - 容器用 Dialog + **数字**高度：百分比高度会与 maxHeight 冲突被算成 0（白屏）
 * - 列表用 FlatList：Dialog 给了确定高度，body 与 FlatList 均 flex:1，虚拟化生效
 *   （早期把 FlatList 塞进 ConfirmAlert 的 ScrollView 里会嵌套虚拟列表，渲染空白）
 * - buildList 是 async，必须 await，否则 items 是 Promise（length 为 undefined）
 * - 安装后只做局部状态更新，不重新拉取索引，避免整表重渲染
 * - 默认折叠同名多版本，减少首屏渲染量
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { View, TouchableOpacity, FlatList, StyleSheet, Dimensions, type ListRenderItemInfo } from 'react-native'
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

const PANEL_HEIGHT = Math.round(Dimensions.get('window').height * 0.75)

const formatVersion = (version?: string) => {
  if (!version) return ''
  return /^\d/.test(version) ? `v${version}` : version
}

const keyExtractor = (item: SourceLibraryListItem) => item.id

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
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async(force = false) => {
    setLoading(true)
    setError('')
    try {
      const { index, fromCache } = await fetchSourceLibraryIndex(force)
      setItems(await buildList(index))
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

  const handleInstall = useCallback(async(item: SourceLibraryListItem) => {
    setBusyId(item.id)
    try {
      await installItem(item)
      // 局部更新，避免重新拉取索引导致整表重渲染
      setItems(prev => prev.map(x => x.id == item.id
        ? { ...x, state: 'installed', localVersion: item.version }
        : x))
      toast(t('source_library_install_success', { name: item.name }))
    } catch (err: any) {
      toast(t('source_library_install_failed', { message: err?.message ?? 'unknown' }), 'long')
    } finally {
      setBusyId('')
    }
  }, [t])

  // 默认每个音源只显示最新版（数据已按版本降序），减少首屏渲染量
  const display = useMemo(() => {
    if (showAll) return items
    const seen = new Set<string>()
    return items.filter(item => {
      const key = String(item.name ?? '').trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [items, showAll])

  const renderItem = useCallback(({ item }: ListRenderItemInfo<SourceLibraryListItem>) => {
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
      <View style={styles.item}>
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
  }, [busyId, handleInstall, t, theme])

  if (!visible) return null

  return (
    <Dialog
      ref={dialogRef}
      title={`${t('source_library')} ${display.length}`}
      height={PANEL_HEIGHT}
      onHide={() => { setVisible(false) }}
    >
      <View style={styles.body}>
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
        {error ? <Text size={12} color={theme['c-font-label']} style={styles.notice}>{error}</Text> : null}
        <FlatList
          data={display}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={
            <Text size={13} color={theme['c-font-label']} style={styles.empty}>
              {loading ? t('loading') : t('source_library_empty')}
            </Text>
          }
        />
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
    paddingBottom: 6,
  },
  smallBtn: {
    marginRight: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  notice: {
    paddingBottom: 4,
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
