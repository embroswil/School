// Classeur facon tableur pour les conseils : le tableau calcule par Sùkûl (base) + les modifications de
// l'etablissement (cellules, lignes et colonnes ajoutees ou retirees, titres), enregistrees a part
// (/api/classeurs/:cle) et reappliquees a chaque ouverture.
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { useApi } from './hooks.js'
import { Note } from './ui.jsx'
import { BoutonExcel, exporterExcel } from './export.jsx'
import { imprimer } from './impression.js'

const lettre = (i) => (i < 26 ? String.fromCharCode(65 + i) : lettre(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)))
const nouvelId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const VIDE = { cells: {}, cols: [], rows: [], hideCols: [], hideRows: [], titres: {}, textes: {} }

// colonnes : [{ id, titre, type: 'texte' | 'choix', options: [[valeur, libelle]], nom: true (colonne figee) }]
// lignes : [{ id, cells: { [colId]: valeur } }]
export default function Classeur({ cle, nom, colonnes, lignes, zonesTexte = [], imprimerHtml, onEnregistre, lectureSeule = false }) {
  const s = useApi(`/api/classeurs/${cle}`)
  const [modifs, setModifs] = useState(null)
  const [sel, setSel] = useState({ r: 0, c: 0 })
  const [edition, setEdition] = useState(null) // { r, c, valeur } ou { titre: c, valeur }
  const [sale, setSale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const cadre = useRef(null)
  useEffect(() => {
    if (s.data && !modifs) setModifs({ ...VIDE, ...(s.data.modifs || {}) })
  }, [s.data, modifs])
  const m = modifs || VIDE

  // grille finale = base + modifications
  const cols = useMemo(
    () => [...colonnes.filter((c) => !m.hideCols.includes(c.id)), ...m.cols].map((c) => ({ ...c, titre: m.titres[c.id] ?? c.titre })),
    [colonnes, m]
  )
  const rows = useMemo(() => [...lignes.filter((l) => !m.hideRows.includes(l.id)), ...m.rows.map((r) => ({ id: r.id, cells: {} }))], [lignes, m])
  const valeur = (row, col) => {
    const v = m.cells[row.id]?.[col.id]
    return v !== undefined ? v : (row.cells[col.id] ?? '')
  }
  const modifiee = (row, col) => m.cells[row.id]?.[col.id] !== undefined
  const affiche = (col, v) => (col.type === 'choix' ? (col.options.find(([k]) => k === v)?.[1] ?? v) : v)

  const changer = (fn) => {
    setModifs((x) => fn({ ...VIDE, ...x }))
    setSale(true)
    setOk('')
  }
  const ecrire = (r, c, v) => {
    const row = rows.at(r)
    const col = cols.at(c)
    if (!row || !col) return
    changer((x) => ({ ...x, cells: { ...x.cells, [row.id]: { ...x.cells[row.id], [col.id]: v } } }))
  }
  const ajouterLigne = () => changer((x) => ({ ...x, rows: [...x.rows, { id: nouvelId('l') }] }))
  const ajouterColonne = () => changer((x) => ({ ...x, cols: [...x.cols, { id: nouvelId('c'), titre: `Colonne ${lettre(cols.length)}`, type: 'texte' }] }))
  const supprimerLigne = () => {
    const row = rows.at(sel.r)
    if (!row || !window.confirm(`Supprimer la ligne ${sel.r + 1} ?`)) return
    changer((x) => (x.rows.some((l) => l.id === row.id) ? { ...x, rows: x.rows.filter((l) => l.id !== row.id) } : { ...x, hideRows: [...x.hideRows, row.id] }))
    setSel({ r: Math.max(0, sel.r - 1), c: sel.c })
  }
  const supprimerColonne = () => {
    const col = cols.at(sel.c)
    if (!col || col.nom || !window.confirm(`Supprimer la colonne « ${col.titre} » ?`)) return
    changer((x) => (x.cols.some((k) => k.id === col.id) ? { ...x, cols: x.cols.filter((k) => k.id !== col.id) } : { ...x, hideCols: [...x.hideCols, col.id] }))
    setSel({ r: sel.r, c: Math.max(0, sel.c - 1) })
  }
  const retablir = () => {
    if (!window.confirm('Revenir au tableau calculé par Sùkûl ? Vos modifications seront effacées.')) return
    changer(() => ({ ...VIDE }))
  }

  async function enregistrer() {
    setBusy(true)
    setError('')
    try {
      await api.put(`/api/classeurs/${cle}`, { modifs: m })
      if (onEnregistre) await onEnregistre({ cols, rows: rows.map((r) => ({ id: r.id, cells: Object.fromEntries(cols.map((c) => [c.id, valeur(r, c)])) })) })
      setSale(false)
      setOk('Classeur enregistré.')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const tableau = () => rows.map((r) => Object.fromEntries(cols.map((c) => [c.titre, affiche(c, valeur(r, c))])))
  const excel = () => exporterExcel(nom, [{ nom: nom.slice(0, 31), lignes: tableau() }])

  // ---------------------------------------------------------------- saisie au clavier et collage
  const commencer = (r, c, initiale) => {
    if (lectureSeule) return
    const col = cols.at(c)
    const row = rows.at(r)
    if (!col || !row) return
    setEdition({ r, c, valeur: initiale ?? valeur(row, col) })
  }
  const valider = (dr = 0, dc = 0) => {
    if (!edition) return
    if (edition.titre !== undefined) {
      const col = cols.at(edition.titre)
      if (col && edition.valeur.trim()) changer((x) => ({ ...x, titres: { ...x.titres, [col.id]: edition.valeur.trim() } }))
    } else if (edition.valeur !== valeur(rows.at(edition.r), cols.at(edition.c))) ecrire(edition.r, edition.c, edition.valeur)
    setEdition(null)
    if (edition.titre === undefined) setSel({ r: Math.min(rows.length - 1, Math.max(0, edition.r + dr)), c: Math.min(cols.length - 1, Math.max(0, edition.c + dc)) })
    cadre.current?.focus()
  }
  const clavier = (e) => {
    if (edition) return
    const bouger = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Tab: [0, e.shiftKey ? -1 : 1] }[e.key]
    if (bouger) {
      e.preventDefault()
      setSel({ r: Math.min(rows.length - 1, Math.max(0, sel.r + bouger[0])), c: Math.min(cols.length - 1, Math.max(0, sel.c + bouger[1])) })
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      commencer(sel.r, sel.c)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !lectureSeule) {
      e.preventDefault()
      ecrire(sel.r, sel.c, '')
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && cols.at(sel.c)?.type !== 'choix') {
      e.preventDefault()
      commencer(sel.r, sel.c, e.key)
    }
  }
  const coller = (e) => {
    if (edition || lectureSeule) return
    const texte = e.clipboardData?.getData('text/plain')
    if (!texte) return
    e.preventDefault()
    const bloc = texte.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    changer((x) => {
      const suite = { ...x, cells: { ...x.cells }, rows: [...x.rows], cols: [...x.cols] }
      let lignesDispo = [...rows]
      let colsDispo = [...cols]
      while (lignesDispo.length < sel.r + bloc.length) {
        const n = { id: nouvelId('l') }
        suite.rows.push(n)
        lignesDispo = [...lignesDispo, { id: n.id, cells: {} }]
      }
      const larg = Math.max(...bloc.map((l) => l.length))
      while (colsDispo.length < sel.c + larg) {
        const n = { id: nouvelId('c'), titre: `Colonne ${lettre(colsDispo.length)}`, type: 'texte' }
        suite.cols.push(n)
        colsDispo = [...colsDispo, n]
      }
      bloc.forEach((ligne, i) =>
        ligne.forEach((v, j) => {
          const row = lignesDispo.at(sel.r + i)
          const col = colsDispo.at(sel.c + j)
          suite.cells[row.id] = { ...suite.cells[row.id], [col.id]: v.trim() }
        })
      )
      return suite
    })
  }

  if (s.error) return <Note>{s.error}</Note>
  if (!modifs) return <p className="muted">Chargement du classeur…</p>
  const colSel = cols.at(sel.c)

  return (
    <div className="cls">
      <div className="cls-outils">
        {!lectureSeule && (
          <>
            <button type="button" className="btn btn-quiet" onClick={ajouterLigne}>
              + Ligne
            </button>
            <button type="button" className="btn btn-quiet" onClick={ajouterColonne}>
              + Colonne
            </button>
            <button type="button" className="btn btn-quiet" onClick={supprimerLigne} disabled={!rows.length}>
              − Ligne
            </button>
            <button type="button" className="btn btn-quiet" onClick={supprimerColonne} disabled={!colSel || colSel.nom}>
              − Colonne
            </button>
          </>
        )}
        <span className="cls-espace" />
        {imprimerHtml && (
          <button type="button" className="btn btn-quiet" onClick={() => imprimer(imprimerHtml({ cols, rows: tableau(), textes: m.textes }), 'a4-paysage')}>
            Imprimer
          </button>
        )}
        <BoutonExcel onClick={excel} />
      </div>
      <div className="cls-barre-formule" data-brut>
        <b>{`${colSel ? lettre(sel.c) : ''}${sel.r + 1}`}</b>
        <span>{rows.at(sel.r) && colSel ? affiche(colSel, valeur(rows.at(sel.r), colSel)) || ' ' : ' '}</span>
      </div>
      <div className="cls-cadre" ref={cadre} tabIndex={0} onKeyDown={clavier} onPaste={coller} role="grid" aria-label={nom}>
        <table className="cls-table">
          <thead>
            <tr className="cls-lettres">
              <th className="cls-coin" />
              {cols.map((c, j) => (
                <th key={c.id} className={j === sel.c ? 'sel' : ''}>
                  {lettre(j)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="cls-num">#</th>
              {cols.map((c, j) => (
                <th
                  key={c.id}
                  className={`cls-titre ${c.nom ? 'fige' : ''} ${j === sel.c ? 'sel' : ''}`}
                  onClick={() => (j === sel.c && !lectureSeule ? setEdition({ titre: j, valeur: c.titre }) : setSel({ r: sel.r, c: j }))}
                  onDoubleClick={() => !lectureSeule && setEdition({ titre: j, valeur: c.titre })}
                >
                  {edition?.titre === j ? (
                    <input autoFocus value={edition.valeur} onChange={(e) => setEdition({ ...edition, valeur: e.target.value })} onBlur={() => valider()} onKeyDown={(e) => (e.key === 'Enter' ? valider() : e.key === 'Escape' && setEdition(null))} />
                  ) : (
                    <span data-brut>{c.titre}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id}>
                <th className={`cls-num ${i === sel.r ? 'sel' : ''}`} onClick={() => setSel({ r: i, c: sel.c })}>
                  {i + 1}
                </th>
                {cols.map((col, j) => {
                  const actif = i === sel.r && j === sel.c
                  const enEdition = edition && edition.r === i && edition.c === j
                  const v = valeur(row, col)
                  return (
                    <td
                      key={col.id}
                      className={`${col.nom ? 'fige' : ''} ${actif ? 'actif' : ''} ${modifiee(row, col) ? 'modifiee' : ''} ${col.num ? 'num' : ''}`}
                      onClick={() => (actif ? commencer(i, j) : setSel({ r: i, c: j }))}
                      onDoubleClick={() => commencer(i, j)}
                    >
                      {enEdition ? (
                        col.type === 'choix' ? (
                          <select autoFocus value={edition.valeur} onChange={(e) => (ecrire(i, j, e.target.value), setEdition(null), cadre.current?.focus())} onBlur={() => setEdition(null)}>
                            <option value="">—</option>
                            {col.options.map(([k, t]) => (
                              <option key={k} value={k}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            value={edition.valeur}
                            onChange={(e) => setEdition({ ...edition, valeur: e.target.value })}
                            onBlur={() => valider()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') valider(1, 0)
                              else if (e.key === 'Tab') (e.preventDefault(), valider(0, e.shiftKey ? -1 : 1))
                              else if (e.key === 'Escape') (setEdition(null), cadre.current?.focus())
                            }}
                          />
                        )
                      ) : (
                        <span data-brut>{affiche(col, v)}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cls-aide">Touchez une cellule pour la choisir, puis touchez-la encore pour la modifier. Sur ordinateur : flèches, Entrée, Tab, et collage depuis Excel. Les cellules modifiées sont marquées d’un coin bleu.</p>

      {zonesTexte.map((z) => (
        <label key={z} className="cls-zone">
          <b>{z}</b>
          <textarea className="input" rows={3} readOnly={lectureSeule} value={m.textes[z] || ''} onChange={(e) => changer((x) => ({ ...x, textes: { ...x.textes, [z]: e.target.value } }))} />
        </label>
      ))}

      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      {!lectureSeule && (
        <div className="cls-enregistrer">
          <button type="button" className="btn btn-quiet" onClick={retablir}>
            Revenir aux calculs
          </button>
          <button type="button" className="btn" disabled={busy || !sale} onClick={enregistrer}>
            {busy ? 'Enregistrement…' : sale ? 'Enregistrer' : 'Enregistré'}
          </button>
        </div>
      )}
    </div>
  )
}
