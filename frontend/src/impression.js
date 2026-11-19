// impression.js
// Impression directe depuis l'application (recus de caisse, brouillard de caisse) : le document est
// place dans une zone dediee, seule visible a l'impression, au format choisi (ticket 80 mm, A5 ou A4).
import { code128Svg } from './code128.js'
import { qrSvg } from './qr.js'
import { enLettres, fcfa, lienVerification, MODES_PAIEMENT } from './recus.js'

const CLE = 'sukul-impression'
export const FORMATS = { ticket: 'Ticket 80 mm', a5: 'Feuille A5' }

export function lireReglagesImpression() {
  try {
    const r = JSON.parse(localStorage.getItem(CLE) || '{}')
    return { format: FORMATS[r.format] ? r.format : 'a5', copies: r.copies === 2 ? 2 : 1, auto: Boolean(r.auto) }
  } catch {
    return { format: 'a5', copies: 1, auto: false }
  }
}
export function ecrireReglagesImpression(r) {
  try {
    localStorage.setItem(CLE, JSON.stringify(r))
  } catch {
    /* stockage indisponible */
  }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const dateHeure = (d) =>
  new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const jourLong = (d) => majuscule(new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

// Recu d'un encaissement (une ou plusieurs lignes). op : donnees de /api/scolarite/encaissements/:op
export function recuHtml(op, { format = 'a5', exemplaire = '', logo = '' } = {}) {
  const premier = op.lignes[0]
  const ligne = (k, v) => (v ? `<div class="ri-l"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : '')
  const plus = op.lignes.length > 1 ? ` (+${op.lignes.length - 1})` : ''
  return `
<article class="ri ri-${format}">
  <header class="ri-tete">
    ${logo ? `<img class="ri-logo" src="${esc(logo)}" alt="" />` : `<span class="ri-logo ri-initiale">${esc(String(op.ecole.nom || '?').charAt(0))}</span>`}
    <div><b>${esc(op.ecole.nom)}</b><small>${esc([op.ecole.ville, op.annee && `Année ${op.annee}`].filter(Boolean).join(' · '))}</small></div>
  </header>
  <div class="ri-titre"><b>REÇU DE CAISSE</b><span>N° ${esc(premier.numero)}${plus}</span><small>${esc(dateHeure(op.date))}</small></div>
  ${exemplaire ? `<p class="ri-exemplaire">${esc(exemplaire)}</p>` : ''}
  <section class="ri-bloc">
    ${ligne('Élève', `${op.eleve.nom} ${op.eleve.prenom}`)}
    ${ligne('Classe', op.eleve.classe || '—')}
    ${ligne('Matricule', op.eleve.matricule)}
  </section>
  <table class="ri-table">
    <thead><tr><th>Objet</th><th>Montant</th></tr></thead>
    <tbody>
      ${op.lignes
        .map(
          (l) => `<tr><td>${esc(l.frais)}<small>${esc(l.numero)} · reste ${esc(fcfa(l.reste))}</small></td><td>${esc(fcfa(l.montant))}</td></tr>`,
        )
        .join('')}
    </tbody>
    <tfoot><tr><td>TOTAL REÇU</td><td>${esc(fcfa(op.total))}</td></tr></tfoot>
  </table>
  <p class="ri-lettres">Arrêté à la somme de ${esc(enLettres(op.total))} francs CFA</p>
  <section class="ri-bloc">
    ${ligne('Mode de paiement', MODES_PAIEMENT[op.mode] || op.mode)}
    ${ligne(op.mode === 'banque' ? 'N° du bordereau' : op.mode === 'mobile_money' ? 'N° de transaction' : 'N° du reçu papier', op.recuExterne)}
    ${ligne('Versé par', [op.versePar, op.telephone].filter(Boolean).join(' · '))}
    ${ligne('Caissier', op.caissier)}
  </section>
  <section class="ri-situation">
    <div><span>Total de l’année</span><b>${esc(fcfa(op.situation.total))}</b></div>
    <div><span>Déjà payé</span><b>${esc(fcfa(op.situation.paye))}</b></div>
    <div><span>Reste à payer</span><b>${esc(fcfa(op.situation.reste))}</b></div>
  </section>
  <footer class="ri-pied">
    <div class="ri-codes">
      <div class="ri-barres">${code128Svg(premier.numero, 40)}<small>${esc(premier.numero)}</small></div>
      ${format === 'a5' ? `<div class="ri-qr">${qrSvg(lienVerification(premier.numero, premier.code), 92)}<small>Code ${esc(premier.code)}</small></div>` : ''}
    </div>
    ${format === 'a5' ? '<div class="ri-signature"><span>Cachet et signature de l’intendance</span></div>' : ''}
    <p>Reçu Sùkûl vérifiable par l’établissement (code-barres). Conservez-le.</p>
  </footer>
</article>`
}

// Brouillard de caisse d'une journee. c : donnees de /api/scolarite/caisse
export function brouillardHtml(c) {
  const modes = Object.entries(c.parMode || {})
  return `
<article class="bc">
  <header class="bc-tete">
    <div><b>${esc(c.ecole?.nom || '')}</b><small>${esc(c.ecole?.ville || '')}</small></div>
    <div class="bc-titre"><b>BROUILLARD DE CAISSE</b><span>${esc(jourLong(c.date))}</span></div>
  </header>
  <table class="bc-table">
    <thead><tr><th>Heure</th><th>N° reçu</th><th>Élève</th><th>Classe</th><th>Objet</th><th>Mode</th><th>Montant</th></tr></thead>
    <tbody>
      ${
        c.operations.length
          ? [...c.operations]
              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) // ordre chronologique
              .map(
                (o) =>
                  `<tr><td>${esc(heure(o.created_at))}</td><td>${esc(o.numero)}</td><td>${esc(`${o.nom} ${o.prenom}`)}</td><td>${esc(o.classe || '—')}</td><td>${esc(o.frais)}</td><td>${esc(MODES_PAIEMENT[o.mode] || o.mode)}</td><td>${esc(fcfa(o.montant))}</td></tr>`,
              )
              .join('')
          : '<tr><td colspan="7">Aucun encaissement ce jour.</td></tr>'
      }
    </tbody>
  </table>
  <div class="bc-totaux">
    <table>
      <tbody>
        ${modes.map(([m, v]) => `<tr><td>${esc(MODES_PAIEMENT[m] || m)}</td><td>${esc(fcfa(v))}</td></tr>`).join('')}
        <tr class="bc-general"><td>TOTAL (${c.nb} encaissement${c.nb > 1 ? 's' : ''})</td><td>${esc(fcfa(c.total))}</td></tr>
      </tbody>
    </table>
    <table>
      <tbody>${(c.parFrais || []).map((f) => `<tr><td>${esc(f.nom)}</td><td>${esc(fcfa(f.total))}</td></tr>`).join('')}</tbody>
    </table>
  </div>
  <p class="bc-lettres">Arrêté le présent brouillard à la somme de ${esc(enLettres(c.total))} francs CFA.</p>
  <div class="bc-signatures"><span>Le caissier</span><span>L’intendant</span><span>Le chef d’établissement</span></div>
</article>`
}

// Imprime un document HTML au format voulu (ticket : 80 mm de large ; a5 ; a4)
export function imprimer(html, format = 'a5') {
  let zone = document.getElementById('zone-impression')
  if (!zone) {
    zone = document.createElement('div')
    zone.id = 'zone-impression'
    document.body.appendChild(zone)
  }
  // format de page place en dernier dans le document : il passe avant celui des autres impressions (A4)
  let page = document.getElementById('page-impression')
  if (!page) {
    page = document.createElement('style')
    page.id = 'page-impression'
  }
  document.body.appendChild(page)
  zone.className = `impression-${format}`
  zone.innerHTML = html
  let taille = format === 'a4' ? 'A4 portrait' : 'A5 portrait'
  if (format === 'ticket') {
    // ticket : 80 mm de large, hauteur du recu (mesuree hors ecran)
    zone.style.cssText = 'display:block;position:absolute;left:-10000px;top:0;width:74mm'
    const h = Math.max(...[...zone.querySelectorAll('.ri')].map((a) => a.getBoundingClientRect().height), 300)
    zone.style.cssText = ''
    taille = `80mm ${Math.ceil((h * 25.4) / 96) + 8}mm`
  }
  page.textContent = `@page { size: ${taille}; margin: ${format === 'ticket' ? '3mm' : '8mm'}; }`
  document.documentElement.classList.add('impression-active')
  const fin = () => {
    document.documentElement.classList.remove('impression-active')
    window.removeEventListener('afterprint', fin)
  }
  window.addEventListener('afterprint', fin)
  // images (photo de l'etablissement) chargees avant l'impression
  const images = [...zone.querySelectorAll('img')].filter((i) => !i.complete)
  Promise.all(images.map((i) => new Promise((ok) => ((i.onload = ok), (i.onerror = ok), setTimeout(ok, 2500))))).then(() =>
    setTimeout(() => window.print(), 60),
  )
}
