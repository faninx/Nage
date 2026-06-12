"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type DatePickerProps = {
  /** ISO date string `yyyy-MM-dd`；null 表示未选 */
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  placeholder?: string
  id?: string
  /** 设为 name 则同步渲染同名 hidden input（用于表单提交） */
  name?: string
  className?: string
}

function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "选择日期",
  id,
  name,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const date = value ? parseISO(value) : undefined

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal h-8 px-2.5",
              !date && "text-muted-foreground",
              className
            )}
          >
            <CalendarIcon className="mr-2 size-4" />
            {date ? format(date, "yyyy-MM-dd") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              onChange(d ? format(d, "yyyy-MM-dd") : null)
              setOpen(false)
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
    </>
  )
}

export { DatePicker }
