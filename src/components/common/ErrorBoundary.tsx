/**
 * 渲染错误边界：子组件渲染抛错时显示错误信息，避免整页白屏，
 * 同时写入 App 缓存目录的 error.log（release 版也生效），便于取证。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { View, Alert } from 'react-native'
import Text from '@/components/common/Text'
import { toast } from '@/utils/tools'
import { log } from '@/utils/log'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const detail = [
      `[${this.props.label ?? 'ErrorBoundary'}] render error`,
      `message: ${error?.message ?? 'unknown'}`,
      `name: ${error?.name ?? ''}`,
      `stack: ${error?.stack ?? ''}`,
      `componentStack: ${info?.componentStack ?? ''}`,
    ].join('\n')
    log.error(detail)
    const msg = `${error?.name ?? 'Error'}: ${error?.message ?? 'unknown'}\n\n${String(error?.stack ?? '').slice(0, 600)}`
    toast(`${this.props.label ?? ''}渲染失败`, 'long')
    // 系统对话框不会被 toast 截断，便于直接截图取证
    Alert.alert(`${this.props.label ?? ''}渲染错误`, msg)
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ padding: 16 }}>
          <Text size={13}>{`渲染失败：${this.state.error.message}`}</Text>
        </View>
      )
    }
    return this.props.children
  }
}
