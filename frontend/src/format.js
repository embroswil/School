export const ROLE_LABEL = {
  admin: 'Administrateur',
  teacher: 'Enseignant',
  parent: 'Parent',
  student: 'Élève',
}

export const ENROLLMENT_LABEL = {
  active: 'Inscrit',
  transferred: 'Transféré',
  graduated: 'Diplômé',
  suspended: 'Suspendu',
}

// Les dates SQL arrivent en UTC : on les affiche en UTC pour éviter un décalage d'un jour.
export const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('fr-FR', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

export const fmtNumber = (value) => new Intl.NumberFormat('fr-FR').format(Number(value) || 0)

export const fullName = (first, last) => `${first ?? ''} ${last ?? ''}`.trim()
