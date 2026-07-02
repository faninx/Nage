"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { RequiredMark } from "@/components/ui/required-mark"
import { toast } from "sonner"
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react"
import {
  createMcpTokenAction,
  revokeMcpTokenAction,
} from "@/lib/actions/mcp-tokens"
import type { ActionState, McpTokenListItem } from "@/lib/actions/types"

type CreateState = ActionState & {
  token?: string
  tokenId?: number
  lastFour?: string
}

type Props = {
  initial: McpTokenListItem[]
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          toast.success("已复制到剪贴板")
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("复制失败")
        }
      }}
      aria-label="复制令牌"
      title="复制令牌"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  )
}

export function McpTokensClient({ initial }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  // 拿到新 token 后展示一次；用户点"我已复制"才关弹窗
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [, startRevoke] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [createState, createFormAction, createPending] = useActionState<
    CreateState | undefined,
    FormData
  >(createMcpTokenAction, undefined)

  useEffect(() => {
    if (createState?.ok && createState.token) {
      setIssuedToken(createState.token)
      setCreateOpen(false)
    } else if (createState?.error) {
      toast.error(createState.error)
    }
  }, [createState])

  async function handleRevoke(t: McpTokenListItem) {
    if (
      !(await confirm({
        title: `撤销令牌「${t.name}」？`,
        description: "使用此令牌的 AI 客户端会立即无法连接 Nage。此操作不可撤销。",
        destructive: true,
        confirmText: "撤销",
      }))
    )
      return
    setRevokingId(t.id)
    const fd = new FormData()
    fd.append("id", String(t.id))
    startRevoke(async () => {
      const res = await revokeMcpTokenAction(fd)
      setRevokingId(null)
      if (res.error) toast.error(res.error)
      else toast.success("令牌已撤销")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground">{initial.length}</span> 个令牌
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(o) => {
            // 已发出新 token 后，禁止通过点空白处关弹窗（避免误关丢 token）
            if (!o && issuedToken) return
            setCreateOpen(o)
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" disabled={issuedToken != null}>
              <Plus className="size-4" />
              新建令牌
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建 MCP 令牌</DialogTitle>
              <DialogDescription>
                给令牌起个名字（例如&ldquo;Claude Desktop on MBP&rdquo;），方便以后识别。
              </DialogDescription>
            </DialogHeader>
            <form action={createFormAction} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-name">名称<RequiredMark /></Label>
                <Input
                  id="t-name"
                  name="name"
                  required
                  minLength={1}
                  maxLength={50}
                  autoFocus
                  placeholder="例如：Cursor on 笔记本"
                  disabled={createPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-scope">作用域</Label>
                <Select name="scope" defaultValue="reader">
                  <SelectTrigger className="w-full" id="t-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reader">只读（reader）</SelectItem>
                    <SelectItem value="editor">可写（editor）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  只读：仅查询数据；可写：能新增/修改/删除物品。建议给自动 agent 用只读，需要记账再发可写。
                </p>
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={createPending}>
                  {createPending ? "生成中…" : "生成"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>作用域</TableHead>
              <TableHead>令牌尾号</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>最后使用</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  还没有令牌。点击右上角&ldquo;新建令牌&rdquo;创建第一个。
                </TableCell>
              </TableRow>
            ) : (
              initial.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    {t.scope === "editor" ? (
                      <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/20">
                        可写
                      </Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-border hover:bg-muted/80">
                        只读
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    …{t.lastFour}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(t.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(t.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRevoke(t)}
                      disabled={revokingId === t.id}
                      aria-label="撤销"
                      title="撤销"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 新建后展示明文 token 一次 */}
      <Dialog
        open={issuedToken != null}
        onOpenChange={(o) => {
          if (!o) setIssuedToken(null)
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              令牌已生成（仅显示一次）
            </DialogTitle>
            <DialogDescription>
              请立即复制并妥善保存。关闭此弹窗后将无法再次查看完整令牌。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Token 框 + 复制按钮内嵌（标准模式：GitHub PAT / Vercel API key） */}
            <div className="relative">
              <div className="rounded-md border bg-muted/50 pl-3 pr-12 py-2 font-mono text-xs break-all select-all min-h-9">
                {issuedToken}
              </div>
              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                {issuedToken && <CopyButton value={issuedToken} />}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              粘贴到 AI 客户端的 MCP 配置里（Authorization header 或客户端表单）。
            </div>
            {/* 关闭按钮：普通按钮，放底部 */}
            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setIssuedToken(null)}>
                已保存，关闭
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  )
}