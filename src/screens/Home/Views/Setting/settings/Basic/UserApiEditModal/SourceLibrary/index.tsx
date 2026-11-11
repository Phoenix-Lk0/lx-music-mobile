/**
 * 在线音源库 - 列表弹窗
 *
 * 容器用 ConfirmAlert（已验证可正常显示），内部列表用「固定像素高度 + FlatList」：
 * - ConfirmAlert 的 ScrollView 只有 flexGrow:0，内容超高会被裁剪且滑不动
 * - 给列表区一个确定的像素高度，FlatList 才能正确滚动并虚拟化
 * 不注册新导航页面，避免与上游页面注册逻辑冲突。
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { View, TouchableOpacity, FlatList, StyleSheet, Dimensions, type ListRenderItemInfo } from 'react-native'
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

// 列表区固定高度：屏幕高度的 48%，保证 FlatList 有确定边界
const LIST_HEIGHT = Math.round(Dimensions.get('window').height * 0.48)

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

  const renderItem = ({ item }: ListRenderItemInfo<SourceLibraryListItem>) => {
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
          {item.description ? <Text size={12} color={theme['c-font-label']} numberOfLines={2} style={styles.desc}>{item.description}</Text> : null}
          {item.failedOver ? <Text size={11} color={theme['c-font-label']}>{t('source_library_mirror_in_use')}</Text> : null}
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
          title={`${t('source_library')}  ${display.length}/${items.length}`}
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
            <TouchableOpacity style={styles.toggle} onPress={() => { setShowAll(v => !v) }}>
              <Text size={12} color={theme['c-button-font']}>
                {showAll ? t('source_library_unique_only') : t('source_library_all_versions')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.refresh} disabled={loading} onPress={() => { void load(true) }}>
              <Text size={12} color={theme['c-button-font']}>
                {loading ? t('source_library_loading') : t('source_library_refresh')}
              </Text>
            </TouchableOpacity>
          </View>
          {error ? <Text size={12} color={theme['c-font-label']} style={styles.notice}>{error}</Text> : null}
          {notice ? <Text size={11} color={theme['c-font-label']} style={styles.notice} numberOfLines={2}>{notice}</Text> : null}
          <View style={{ height: LIST_HEIGHT }}>
            <FlatList
              data={display}
              renderItem={renderItem}
              keyExtractor={item => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              ListEmptyComponent={
                <Text size={13} color={theme['c-font-label']} style={styles.empty}>
                  {loading ? t('loading') : t('source_library_empty')}
                </Text>
              }
            />
          </View>
        </ConfirmAlert>
      : null
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
  toggle: {
    marginLeft: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  refresh: {
    marginLeft: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
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
    paddingBottom: 8,
  },
  empty: {
    paddingTop: 30,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  itemInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 10,
  },
  desc: {
    marginTop: 2,
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
