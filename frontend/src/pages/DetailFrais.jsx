import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { comparerClasses, niveauClasse } from '../classes.js'
import { fcfa, MODES_PAIEMENT } from '../recus.js'

const nb = (n) => Number(n || 0).toLocaleString('fr-FR')
const taux = (e, a) => (Number(a) > 0 ? Math.round((Number(e) / Number(a)) * 100) : 0)
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const COULEURS_MODES = { mobile_money: '#2f6bff', especes: '#12b76a', banque: '#7c4dff', autre: '#98a2b3' }

function Barre({ valeur }) {
  return (
    <span className="suivi-barre" aria-hidden="true">
      <i style={{ width: `${Math.min(100, valeur)}%` }} className={valeur >= 80 ? '' : valeur >= 50 ? 'moyen' : 'faible'} />
    </span>
  )
}

// Detail d'un frais de scolarite : recouvrement, situation des eleves, mois, moyens de paiement, classes
export default function DetailFrais({ id, onRetour }) {
  const d = useApi(`/api/scolarite/comptabilite/frais/${id}`)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { frais: f, classes: brutes, mois, modes } = d.data
  const classes = [...brutes].sort((a, b) => comparerClasses(a.classe, b.classe))
  const somme = (k) => classes.reduce((t, c) => t + Number(c[k] || 0), 0)
  const attendu = somme('attendu')
  const encaisseDu = somme('encaisse')
  const encaisse = modes.reduce((t, m) => t + Number(m.total), 0)
  const reste = somme('reste')
  const eleves = somme('eleves')
  const soldes = somme('soldes')
  const partiels = somme('partiels')
  const rien = somme('rien')
  const t = taux(encaisseDu, attendu)
  const maxMois = Math.max(1, ...mois.map((m) => Number(m.total)))

  // classes regroupees par niveau, avec sous-totaux
  const niveaux = []
  for (const c of classes) {
    const nom = niveauClasse(c.classe)
    let n = niveaux[niveaux.length - 1]
    if (!n || n.nom !== nom) niveaux.push((n = { nom, classes: [], eleves: 0, attendu: 0, encaisse: 0, reste: 0 }))
    n.classes.push(c)
    n.eleves += Number(c.eleves)
    n.attendu += Number(c.attendu)
    n.encaisse += Number(c.encaisse)
    n.reste += Number(c.reste)
  }

  return (
    <div className="df">
      <button type="button" className="back" onClick={onRetour}>
        ← Tous les frais
      </button>
      <h2 className="df-titre">{f.nom}</h2>
      <p className="muted df-sous">
        {[`${fcfa(f.montant)} par élève`, f.echeance ? `avant le ${jour(f.echeance)}` : '', f.obligatoire ? `${nb(eleves)} élèves concernés` : 'Facultatif']
          .filter(Boolean)
          .flatMap((x, i) => (i ? [' · ', <span key={i}>{x}</span>] : [<span key={i}>{x}</span>]))}
      </p>

      <div className="df-hero">
        {f.obligatoire && attendu > 0 ? (
          <>
            <div className="df-hero-tete">
              <span>Recouvrement</span>
              <b>{t} %</b>
            </div>
            <Barre valeur={t} />
            <div className="df-hero-pied">
              <span>
                Encaissé <b>{fcfa(encaisse)}</b>
              </span>
              <span>
                Attendu <b>{fcfa(attendu)}</b>
              </span>
              <span>
                Reste <b className={reste ? 'rouge' : ''}>{fcfa(reste)}</b>
              </span>
            </div>
          </>
        ) : (
          <div className="df-hero-tete">
            <span>Encaissé</span>
            <b>{fcfa(encaisse)}</b>
          </div>
        )}
      </div>

      {f.obligatoire && eleves > 0 && (
        <section className="df-bloc">
          <h3>Situation des élèves</h3>
          <div className="df-pile" aria-hidden="true">
            <i className="vert" style={{ width: `${(soldes / eleves) * 100}%` }} />
            <i className="orange" style={{ width: `${(partiels / eleves) * 100}%` }} />
            <i className="rouge" style={{ width: `${(rien / eleves) * 100}%` }} />
          </div>
          <div className="df-legende">
            <span className="vert">
              <b>{nb(soldes)}</b> soldé ({taux(soldes, eleves)} %)
            </span>
            <span className="orange">
              <b>{nb(partiels)}</b> partiel ({taux(partiels, eleves)} %)
            </span>
            <span className="rouge">
              <b>{nb(rien)}</b> rien payé ({taux(rien, eleves)} %)
            </span>
          </div>
        </section>
      )}

      {mois.length > 0 && (
        <section className="df-bloc">
          <h3>Encaissements par mois</h3>
          <div className="df-mois">
            {mois.map((m) => {
              const [a, n] = m.mois.split('-')
              return (
                <div key={m.mois}>
                  <small className="df-mois-val">{Number(m.total) >= 1e6 ? `${(Number(m.total) / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : `${Math.round(Number(m.total) / 1000)} k`}</small>
                  <span>
                    <i style={{ height: `${(Number(m.total) / maxMois) * 100}%` }} />
                  </span>
                  <small>{`${MOIS[Number(n) - 1]} ${a.slice(2)}`}</small>
                </div>
              )
            })}
          </div>
          <p className="df-note">{`${nb(mois.reduce((t2, m) => t2 + m.nb, 0))} paiements · ${fcfa(encaisse)}`}</p>
        </section>
      )}

      {modes.length > 0 && (
        <section className="df-bloc">
          <h3>Moyens de paiement</h3>
          <div className="df-pile" aria-hidden="true">
            {modes.map((m) => (
              <i key={m.mode} style={{ width: `${taux(m.total, encaisse)}%`, background: COULEURS_MODES[m.mode] || '#98a2b3' }} />
            ))}
          </div>
          <ul className="df-modes">
            {modes.map((m) => (
              <li key={m.mode}>
                <i style={{ background: COULEURS_MODES[m.mode] || '#98a2b3' }} />
                <span>{MODES_PAIEMENT[m.mode] || m.mode}</span>
                <small>{`${nb(m.nb)} reçus`}</small>
                <b>{fcfa(m.total)}</b>
                <em>{`${taux(m.total, encaisse)} %`}</em>
              </li>
            ))}
          </ul>
        </section>
      )}

      {niveaux.length > 0 && (
        <section className="df-bloc">
          <h3>Par classe</h3>
          <div className="tab-cadre">
            <table className="tab-pro">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th className="nombre col-ordi">Élèves</th>
                  <th className="nombre col-ordi">Encaissé</th>
                  <th className="nombre">Reste</th>
                  <th className="nombre">Taux</th>
                  <th className="nombre col-ordi">Rien payé</th>
                </tr>
              </thead>
              {niveaux.map((n) => (
                <tbody key={n.nom}>
                  <tr className="tab-niveau">
                    <td>{n.nom}</td>
                    <td className="nombre col-ordi">{nb(n.eleves)}</td>
                    <td className="nombre col-ordi">{nb(n.encaisse)}</td>
                    <td className="nombre">{nb(n.reste)}</td>
                    <td className="nombre">{`${taux(n.encaisse, n.attendu)} %`}</td>
                    <td className="nombre col-ordi">{nb(n.classes.reduce((t2, c) => t2 + c.rien, 0))}</td>
                  </tr>
                  {n.classes.map((c) => {
                    const tc = taux(c.encaisse, c.attendu)
                    return (
                      <tr key={c.classe}>
                        <td>{c.classe}</td>
                        <td className="nombre col-ordi">{nb(c.eleves)}</td>
                        <td className="nombre col-ordi">{nb(c.encaisse)}</td>
                        <td className={`nombre ${Number(c.reste) ? '' : 'vert'}`}>{Number(c.reste) ? nb(c.reste) : '—'}</td>
                        <td className="nombre">
                          <span className="tab-taux">
                            {tc} %
                            <Barre valeur={tc} />
                          </span>
                        </td>
                        <td className={`nombre col-ordi ${c.rien ? 'rouge' : ''}`}>{c.rien ? nb(c.rien) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <p className="tab-unite">Montants en FCFA</p>
        </section>
      )}
    </div>
  )
}
