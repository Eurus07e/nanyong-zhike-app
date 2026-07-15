import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = options.length - 1
    else return

    event.preventDefault()
    onChange(options[nextIndex].value)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[nextIndex]?.focus()
  }

  return <div
    className={`segmented ${className}`.trim()}
    style={{ '--segment-count': options.length } as CSSProperties}
    data-active-index={activeIndex}
    role="tablist"
    aria-label={label}
  >
    <span className="segmented-indicator" aria-hidden="true" />
    {options.map((option, index) => {
      const selected = option.value === value
      return <button
        type="button"
        role="tab"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        className={selected ? 'active' : ''}
        onClick={() => onChange(option.value)}
        onKeyDown={(event) => handleKeyDown(event, index)}
        key={option.value}
      >
        {option.icon}
        {option.label}
      </button>
    })}
  </div>
}
