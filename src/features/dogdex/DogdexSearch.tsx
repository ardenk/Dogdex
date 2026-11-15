import { useId } from 'react'

/** The search box on the Dogdex and category pages. The text lives in the page address (?q=) so Back keeps your search. */
export function DogdexSearch({ value, onChange, label = 'Search breeds' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCapitalize="words"
        placeholder="Search breeds (try “lab”)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
