/**
 * 渲染错误边界：子组件渲染抛错时显示错误信息，避免整页白屏，
 * 同时写入 App 缓存目录的 error.log（release 版也生效），便于取证。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { View } from 'react-native'
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
    toast(`${this.props.label ?? ''}渲染失败：${error?.message ?? 'unknown'}`, 'long')
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
