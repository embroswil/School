export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function Note({ kind = 'error', children }) {
  if (!children) return null
  return (
    <p className={`note note-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function Loading() {
  return <p className="muted">Chargement…</p>
}

export function Empty({ children }) {
  return <p className="muted">{children}</p>
}
