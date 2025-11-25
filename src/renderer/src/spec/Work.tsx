import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption
} from '@/components/ui/table'
import { api } from '../lib/api'
import type { TaskItem } from '../types'

export default function WorkView() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [status, setStatus] = useState<string>('All')
  const [owner, setOwner] = useState<string>('All')
  const [priority, setPriority] = useState<string>('All')
  const [q, setQ] = useState<string>('')

  const owners = useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) if (t.owner) s.add(t.owner)
    return ['All', ...Array.from(s).sort()]
  }, [tasks])

  async function load() {
    const params = new URLSearchParams()
    if (status !== 'All') params.set('status', status)
    if (owner !== 'All') params.set('owner', owner)
    if (priority !== 'All') params.set('priority', priority)
    if (q.trim()) params.set('q', q.trim())
    const url = '/api/tasks/list' + (params.toString() ? `?${params.toString()}` : '')
    const arr = await api<TaskItem[]>(url)
    setTasks(arr)
  }

  useEffect(() => {
    load()
  }, [status, owner, priority, q])

  const statusOptions = ['All', 'backlog', 'in-progress', 'blocked', 'done', 'draft', 'accepted']

  const priorityOptions = ['All', 'P0', 'P1', 'P2']

  const renderStatus = (value?: string) => {
    if (!value) {
      return (
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Unknown
        </span>
      )
    }
    return (
      <span className="inline-flex rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
        {value}
      </span>
    )
  }

  const renderPriority = (value?: string) => {
    if (!value) return null
    const base = 'inline-flex rounded-full px-2 py-0.5 text-xs'
    if (value === 'P0') {
      return <span className={`${base} bg-red-500/20 text-red-400`}>{value}</span>
    }
    if (value === 'P1') {
      return <span className={`${base} bg-orange-500/20 text-orange-400`}>{value}</span>
    }
    return <span className={`${base} bg-muted text-muted-foreground`}>{value}</span>
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <Card className="px-4 py-3">
        <div className="mb-2 text-sm font-semibold">Filters</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-[200px]"
          />
        </div>
      </Card>
      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pb-2 text-sm font-semibold">Tasks</div>
        <div className="h-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.path}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{task.title || task.path}</span>
                      <span className="text-xs text-muted-foreground">{task.path}</span>
                    </div>
                  </TableCell>
                  <TableCell>{renderStatus(task.status)}</TableCell>
                  <TableCell>{task.owner || '-'}</TableCell>
                  <TableCell>{renderPriority(task.priority)}</TableCell>
                  <TableCell>{task.due || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {tasks.length === 0 && <TableCaption>No tasks found.</TableCaption>}
          </Table>
        </div>
      </Card>
    </div>
  )
}
