/**
 * 渲染错误边界：子组件渲染抛错时显示错误信息，避免整页白屏、
 * 并按 Ctrl 堆栈写日志，便于定位问题。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { View } from 'react-native'
import Text from '@/components/common/Text'
import { toast } from '@/utils/tools'

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
    console.error(`[${this.props.label ?? 'ErrorBoundary'}] render error:`, error?.message, info?.componentStack)
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
