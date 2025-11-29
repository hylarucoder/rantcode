import { RunningTasksIndicator } from './RunningTasksIndicator'

/**
 * 底部状态栏
 * 显示全局状态信息，如运行中的任务、连接状态等
 */
export function StatusBar() {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/60 bg-background/95 px-3 text-[11px] text-muted-foreground">
      {/* 左侧区域 - 可以放其他状态信息 */}
      <div className="flex items-center gap-3">
        {/* 预留给未来的状态信息，如 git 分支、连接状态等 */}
      </div>

      {/* 右侧区域 - 运行任务指示器 */}
      <div className="flex items-center gap-3">
        <RunningTasksIndicator />
      </div>
    </div>
  )
}

