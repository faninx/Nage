"use client"

import * as React from "react"
import { zhCN } from "date-fns/locale"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { DayPicker, useDayPicker } from "react-day-picker"
import "react-day-picker/style.css"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function CaptionNav({
  displayMonth,
}: {
  displayMonth: Date
}) {
  const { goToMonth, nextMonth, previousMonth } = useDayPicker()
  const year = displayMonth.getFullYear()
  const month = displayMonth.getMonth()

  return (
    <div className="flex items-center justify-between gap-1">
      <button
        type="button"
        aria-label="上一年"
        onClick={() => goToMonth(new Date(year - 1, month, 1))}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "size-7 p-0 rounded-md"
        )}
      >
        <ChevronsLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="上一月"
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "size-7 p-0 rounded-md"
        )}
      >
        <ChevronLeft className="size-4" />
      </button>
      <div className="text-sm font-medium tabular-nums select-none">
        {year} 年 {month + 1} 月
      </div>
      <button
        type="button"
        aria-label="下一月"
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "size-7 p-0 rounded-md"
        )}
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        type="button"
        aria-label="下一年"
        onClick={() => goToMonth(new Date(year + 1, month, 1))}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "size-7 p-0 rounded-md"
        )}
      >
        <ChevronsRight className="size-4" />
      </button>
    </div>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={zhCN}
      className={cn("rdp p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] flex-1",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-sm flex-1",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal aria-selected:opacity-100 rounded-md"
        ),
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md",
        today: "bg-accent text-accent-foreground rounded-md",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_start: "rounded-l-md bg-primary",
        range_middle:
          "rounded-none aria-selected:bg-accent aria-selected:text-accent-foreground",
        range_end: "rounded-r-md bg-primary",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        MonthCaption: ({ calendarMonth }) => (
          <CaptionNav displayMonth={calendarMonth.date} />
        ),
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
