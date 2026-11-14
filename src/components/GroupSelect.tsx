import { useId } from 'react'
import { data } from '../data'

interface Props {
  value: string
  onChange: (groupId: string) => void
  label?: string
  hint?: string
}

/** Category (AKC group, or Mixed & Designer) chooser. An empty value means "not sorted yet". */
export function GroupSelect({ value, onChange, label = 'Category', hint }: Props) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not sorted yet (Other breeds)</option>
        {data.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  )
}
