/** 必填标记：红色 *（与暗色主题兼容） */
export function RequiredMark() {
  return (
    <span className="text-red-500 dark:text-red-400 ml-0.5" aria-hidden>
      *
    </span>
  )
}
