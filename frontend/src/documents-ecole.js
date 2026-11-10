import { api } from './api.js'
import { envoyer } from './pages/Documents.jsx'

// Envoie un document (PDF, photo, Excel, CSV) au serveur pour lecture, et renvoie le resultat
export async function lireDocumentEcole(fichier, route, extra = {}) {
  let corps
  if (/\.(xlsx|xls|csv)$/i.test(fichier.name)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
    corps = { texte: wb.SheetNames.map((n) => `Feuille « ${n} »\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n') }
  } else {
    const env = await envoyer(fichier)
    corps = { url: env.url, mime: env.mime }
  }
  return (await api.post(route, { ...corps, ...extra })).data
}
