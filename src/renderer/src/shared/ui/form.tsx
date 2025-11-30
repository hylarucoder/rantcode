import * as React from 'react'
import {
  Controller,
  FormProvider,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  type UseFormReturn
} from 'react-hook-form'
import { cn } from '@/lib/utils'

export function Form<TFieldValues extends FieldValues>({
  form,
  className,
  children
}: {
  form: UseFormReturn<TFieldValues>
  className?: string
  children: React.ReactNode
}) {
  return (
    <FormProvider {...form}>
      <div className={className}>{children}</div>
    </FormProvider>
  )
}

export function FormField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  name,
  render
}: {
  control: UseFormReturn<TFieldValues>['control']
  name: TName
  render: (props: {
    field: ControllerRenderProps<TFieldValues, TName>
    fieldState: { error?: { message?: string } }
  }) => React.ReactNode
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => <>{render({ field, fieldState })}</>}
    />
  )
}

export function FormItem({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('space-y-2', className)} {...props} />
}

export function FormLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    />
  )
}

export function FormControl({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('space-y-1', className)} {...props} />
}

export function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />
}

export function FormMessage({
  className,
  children
}: {
  className?: string
  children?: React.ReactNode
}) {
  if (!children) return null
  return <p className={cn('text-xs text-red-500', className)}>{children}</p>
}
