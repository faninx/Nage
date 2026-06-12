"use client"

import { Suspense, useActionState } from "react"
import { useSearchParams } from "next/navigation"
import { loginAction, type LoginState } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? ""
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(
    loginAction,
    undefined
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={32}
          autoFocus
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          maxLength={128}
          disabled={pending}
        />
      </div>
      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "登录中…" : "登录"}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">纳格</CardTitle>
          <CardDescription>登录以管理你的收纳空间</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-32" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
