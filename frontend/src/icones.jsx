// Icones (traits fins, style uniforme) pour la navigation et les actions
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }
const I = (chemins) =>
  function Icone({ size = 24, ...p }) {
    return (
      <svg {...base} width={size} height={size} aria-hidden="true" {...p}>
        {chemins}
      </svg>
    )
  }

export const IcAccueil = I(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>)
export const IcEleves = I(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></>)
export const IcPlus = I(<><path d="M12 5v14" /><path d="M5 12h14" /></>)
export const IcMessages = I(<><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></>)
export const IcProfil = I(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>)
export const IcCloche = I(<><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" /><path d="M10 20a2 2 0 0 0 4 0" /></>)
export const IcRetour = I(<><path d="M15 5l-7 7 7 7" /></>)
export const IcActus = I(<><path d="M4 9v6h3l6 4V5L7 9H4z" /><path d="M17 9a4 4 0 0 1 0 6" /></>)
export const IcCarte = I(<><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M7 15h3" /></>)
export const IcCoche = I(<><path d="M20 6 9 17l-5-5" /></>)
export const IcImport = I(<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>)
export const IcEcole = I(<><path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M10 21v-5h4v5" /><path d="M10 11h4" /></>)
export const IcClasses = I(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>)
export const IcSortie = I(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5" /><path d="M15 12H4" /></>)
export const IcCle = I(<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /></>)
export const IcAide = I(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><path d="M12 17.5v.01" /></>)
export const IcBouclier = I(<><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /></>)
export const IcChevron = I(<><path d="m9 6 6 6-6 6" /></>)
export const IcCrayon = I(<><path d="M4 20h4L19 9l-4-4L4 16z" /></>)
export const IcPhoto = I(<><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></>)
export const IcFamille = I(<><circle cx="8" cy="7" r="2.6" /><circle cx="16" cy="7" r="2.6" /><path d="M3.5 20v-3.5A3.5 3.5 0 0 1 7 13h2a3.5 3.5 0 0 1 3.5 3.5V20" /><path d="M12.5 16.5A3.5 3.5 0 0 1 16 13h1a3.5 3.5 0 0 1 3.5 3.5V20" /></>)
export const IcCasquette = I(<><path d="M2 9.5 12 5l10 4.5-10 4.5z" /><path d="M6 11.5V16c2 1.7 4 2.5 6 2.5s4-.8 6-2.5v-4.5" /><path d="M22 9.5v5" /></>)
export const IcTableau = I(<><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20l4-4 4 4" /><path d="M7 9h6" /><path d="M7 12h9" /></>)
export const IcGraphique = I(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>)
export const IcTelephone = I(<><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></>)
export const IcCadenas = I(<><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>)
export const IcDocument = I(<><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></>)

// Icones du menu « + » : chacune dit ce qu'elle fait
export const IcMegaphone = I(<><path d="M3 10v4h3l8 4V6L6 10H3z" /><path d="M17.5 8.5a5 5 0 0 1 0 7" /><path d="M6 14l1.2 5h2.6L9 15.5" /></>)
export const IcFichier = I(<><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>)
export const IcBillets = I(<><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 10v.01M18 14v.01" /></>)
export const IcAppel = I(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9z" /><path d="m9.5 11 3 3m0-3-3 3" /><path d="M9 17.5h6" /></>)
export const IcProf = I(<><rect x="2.5" y="3.5" width="19" height="9" rx="1.5" /><path d="M7 8h6" /><circle cx="12" cy="16" r="2.2" /><path d="M7.5 21c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" /></>)
export const IcListe = I(<><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M17 8h4M17 12h4M17 16h4" /></>)
