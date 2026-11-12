/**
 * 在线音源库 - 列表弹窗
 *
 * 复用 ConfirmAlert 作为容器，不引入新的导航页面，
 * 因此不会与上游任何页面注册逻辑产生冲突。
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
  const [startIndex, setStartIndex] = useState(0)

  const load = useCallback(async(force = false) => {
    setLoading(true)
    setError('')
    try {
      const { index, fromCache } = await fetchSourceLibraryIndex(force)
      setItems(await buildList(index))
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

  const PAGE = 12
  const pageStart = startIndex >= items.length ? 0 : startIndex
  const pageItems = items.slice(pageStart, pageStart + PAGE)

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
      <View style={styles.item} key={`${startIndex}_${index}`}>
        <View style={styles.itemInfo}>
          <Text size={15}>
            {item.name}
            {item.version ? <Text size={12} color={theme['c-font-label']}>{ '  ' + formatVersion(item.version) }</Text> : null}
            {item.author ? <Text size={12} color={theme['c-font-label']}>{ '  ' + item.author }</Text> : null}
          </Text>
          {item.description ? <Text size={12} color={theme['c-font-label']} style={styles.desc}>{item.description}</Text> : null}
          {item.localVersion && outdated
            ? <Text size={12} color={theme['c-font-label']}>{ t('source_library_local_version', { version: formatVersion(item.localVersion) }) }</Text>
            : null}
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
          title={`${t('source_library')} ${items.length}`}
          cancelText={t('close')}
          onHide={() => { setVisible(false) }}
        >
          <View style={styles.header}>
            <Text size={12} color={theme['c-font-label']}>
              {loading ? t('source_library_loading') : t('source_library_count', { count: items.length })}
            </Text>
            <TouchableOpacity style={styles.refresh} disabled={loading} onPress={() => { void load(true) }}>
              <Text size={12} color={theme['c-button-font']}>{t('source_library_refresh')}</Text>
            </TouchableOpacity>
          </View>
          {notice ? <Text size={12} color={theme['c-font-label']} style={styles.notice}>{notice}</Text> : null}
          {error ? <Text size={12} color={theme['c-font-label']} style={styles.notice}>{error}</Text> : null}
          {!loading && !items.length && !error
            ? <Text size={13} color={theme['c-font-label']} style={styles.empty}>{t('source_library_empty')}</Text>
            : null}
          {pageItems.map((item, i) => renderItem(item, i))}
          {items.length > PAGE
            ? <TouchableOpacity style={styles.header} onPress={() => { setStartIndex((pageStart + PAGE) % items.length) }}>
                <Text size={12} color={theme['c-button-font']}>
                  {`${pageStart + 1}-${Math.min(pageStart + PAGE, items.length)} / ${items.length}  ${t('source_library_next')}`}
                </Text>
              </TouchableOpacity>
            : null}
        </ConfirmAlert>
      : null
  )
})

const styles = createStyle({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  refresh: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 3,
    paddingBottom: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  notice: {
    paddingBottom: 6,
  },
  empty: {
    paddingTop: 20,
    paddingBottom: 20,
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
