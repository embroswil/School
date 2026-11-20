import { api } from './api.js'
import { envoyer } from './pages/Documents.jsx'

// Envoie un document (PDF, photo, Excel, CSV, Word) au serveur pour lecture, et renvoie le resultat
export async function lireDocumentEcole(fichier, route, extra = {}) {
  let corps
  if (/\.(xlsx|xls|csv)$/i.test(fichier.name)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
    corps = { texte: wb.SheetNames.map((n) => `Feuille « ${n} »\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n') }
  } else if (/\.docx$/i.test(fichier.name)) {
    // Word : le texte est extrait sur le telephone
    const { preparerDocument } = await import('./lecture-fichier.js')
    corps = { texte: (await preparerDocument([fichier])).texte }
  } else {
    const env = await envoyer(fichier)
    corps = { url: env.url, mime: env.mime }
  }
  // tableur ou texte : la lecture ne coute rien et peut etre relancee si la connexion se coupe
  return (await api.post(route, { ...corps, nom: fichier.name, ...extra }, corps.texte ? { rejouable: true, delai: 60000 } : undefined)).data
}
