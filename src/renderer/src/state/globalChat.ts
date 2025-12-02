import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * 全局对话面板状态
 *
 * 管理右侧抽屉式对话面板的状态，包括：
 * - 面板打开/关闭状态
 * - 当前选中的项目 ID（用于对话上下文）
 * - 面板宽度（用户可调整）
 * - 引用文件路径（从看板等地方跳转时设置）
 * - 初始提示词（从看板新建任务时设置）
 */
interface GlobalChatState {
  /** 面板是否打开 */
  isOpen: boolean
  /** 当前选中的项目 ID，对话会基于这个项目执行 */
  selectedProjectId: string | null
  /** 面板宽度（像素），用户可拖拽调整 */
  panelWidth: number
  /** 引用的文件路径，用于在输入框中预填 @agent-docs/路径 */
  referenceFilePath: string | null
  /** 初始提示词，用于预填完整的提示词内容 */
  initialPrompt: string | null
  /** 打开面板 */
  open: () => void
  /** 关闭面板 */
  close: () => void
  /** 切换面板状态 */
  toggle: () => void
  /** 设置当前项目 */
  setSelectedProjectId: (projectId: string | null) => void
  /** 设置面板宽度 */
  setPanelWidth: (width: number) => void
  /** 设置引用文件路径（打开面板时会自动填充到输入框） */
  setReferenceFilePath: (path: string | null) => void
  /** 清除引用文件路径 */
  clearReferenceFilePath: () => void
  /** 设置初始提示词（打开面板时会自动填充到输入框） */
  setInitialPrompt: (prompt: string | null) => void
  /** 清除初始提示词 */
  clearInitialPrompt: () => void
}

export const useGlobalChatStore = create<GlobalChatState>()(
  persist(
    (set) => ({
      isOpen: false,
      selectedProjectId: null,
      panelWidth: 420,
      referenceFilePath: null,
      initialPrompt: null,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false, referenceFilePath: null, initialPrompt: null }), // 关闭时清除引用和提示词
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setSelectedProjectId: (projectId) => set({ selectedProjectId: projectId }),
      setPanelWidth: (width) => set({ panelWidth: Math.max(320, Math.min(800, width)) }),
      setReferenceFilePath: (path) => set({ referenceFilePath: path }),
      clearReferenceFilePath: () => set({ referenceFilePath: null }),
      setInitialPrompt: (prompt) => set({ initialPrompt: prompt }),
      clearInitialPrompt: () => set({ initialPrompt: null })
    }),
    {
      name: 'rantcode.global-chat',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedProjectId: state.selectedProjectId,
        panelWidth: state.panelWidth
        // isOpen、referenceFilePath 和 initialPrompt 不持久化
      })
    }
  )
)

/**
 * 全局快捷键 hook
 * 监听 Cmd+/ (Mac) 或 Ctrl+/ (其他) 切换对话面板
 */
export function useGlobalChatKeyboard() {
  const toggle = useGlobalChatStore((s) => s.toggle)

  // 这个 hook 在 AppShell 中使用，注册全局快捷键
  return { toggle }
}
