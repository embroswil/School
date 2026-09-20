import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Empty, Loading, Note } from '../ui.jsx'
import { fmtNumber, fullName } from '../format.js'

function YearLine({ year }) {
  if (!year) {
    return (
      <p className="muted">
        Aucune année scolaire n’est en cours. <a href="#/annees">Définir l’année en cours</a>.
      </p>
    )
  }
  return (
    <p>
      {year.name}
      <span className="tag tag-now">en cours</span>
    </p>
  )
}

function Stat({ to, label, value }) {
  return (
    <li>
      <a className="row" href={`#${to}`}>
        <span className="row-title">{label}</span>
        <span className="figure">{value ?? '…'}</span>
      </a>
    </li>
  )
}

function AdminHome() {
  const year = useApi('/api/academic/current-year')
  const students = useApi('/api/users?role=student&limit=1')
  const teachers = useApi('/api/users?role=teacher&limit=1')
  const parents = useApi('/api/users?role=parent&limit=1')
  const classes = useApi('/api/classes')
  const error = year.error || students.error || classes.error

  return (
    <>
      <h2 className="section-title">Année scolaire</h2>
      {year.loading ? <Loading /> : <YearLine year={year.data} />}
      <div className="gap" />
      <h2 className="section-title">Effectifs</h2>
      <Note>{error}</Note>
      <ul className="rows">
        <Stat to="/utilisateurs" label="Élèves" value={students.meta && fmtNumber(students.meta.total)} />
        <Stat to="/utilisateurs" label="Enseignants" value={teachers.meta && fmtNumber(teachers.meta.total)} />
        <Stat to="/utilisateurs" label="Parents" value={parents.meta && fmtNumber(parents.meta.total)} />
        <Stat to="/classes" label="Classes actives" value={classes.data && fmtNumber(classes.data.length)} />
      </ul>
    </>
  )
}

function ChildRow({ child, yearId }) {
  const dashboard = useApi(yearId ? `/api/parent-portal/children/${child.id}/dashboard?academicYearId=${yearId}` : null)
  const balance = dashboard.data?.fees?.totalBalance
  const absent = dashboard.data?.attendance?.absentDays
  const className = dashboard.data?.enrollment?.class_name

  let sub = `Matricule ${child.admission_number ?? 'non renseigné'}`
  if (dashboard.data) {
    sub = className ?? 'Pas encore inscrit dans une classe'
    if (absent > 0) sub += `, ${absent} ${absent > 1 ? 'jours' : 'jour'} d’absence`
  }

  return (
    <li className="row">
      <div className="row-main">
        <span className="row-title">{fullName(child.first_name, child.last_name)}</span>
        <span className="row-sub">{dashboard.error || sub}</span>
      </div>
      {typeof balance === 'number' && (
        <div className="row-end">
          {balance > 0 ? (
            <>
              <span className="figure">{fmtNumber(balance)}</span>
              <span className="row-sub">à payer</span>
            </>
          ) : (
            <span className="figure figure-ok">Soldé</span>
          )}
        </div>
      )}
    </li>
  )
}

function ParentHome() {
  const year = useApi('/api/academic/current-year')
  const children = useApi('/api/parent-portal/children')

  return (
    <>
      <h2 className="section-title">Vos enfants</h2>
      <Note>{children.error}</Note>
      {children.loading && !children.data ? <Loading /> : null}
      {children.data?.length === 0 && (
        <Empty>Aucun enfant n’est encore rattaché à votre compte. Demandez à l’école de faire le lien.</Empty>
      )}
      <ul className="rows">
        {year.loading
          ? null
          : (children.data ?? []).map((child) => <ChildRow key={child.id} child={child} yearId={year.data?.id} />)}
      </ul>
    </>
  )
}

function StudentHome({ user }) {
  const year = useApi('/api/academic/current-year')
  const path = year.loading ? null : `/api/students/${user.id}/classes${year.data ? `?academicYearId=${year.data.id}` : ''}`
  const classes = useApi(path)

  return (
    <>
      <h2 className="section-title">Ma classe</h2>
      <Note>{classes.error}</Note>
      {classes.loading && !classes.data ? <Loading /> : null}
      {classes.data?.length === 0 && <Empty>Vous n’êtes inscrit dans aucune classe pour le moment.</Empty>}
      <ul className="rows">
        {(classes.data ?? []).map((c) => (
          <li className="row" key={c.id}>
            <div className="row-main">
              <span className="row-title">{c.class_name}</span>
              <span className="row-sub">
                {c.teacher_first_name
                  ? `Enseignant principal : ${fullName(c.teacher_first_name, c.teacher_last_name)}`
                  : 'Pas d’enseignant principal'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function TeacherHome() {
  return (
    <>
      <h2 className="section-title">Votre espace enseignant</h2>
      <p className="muted">
        Les présences, les notes et l’emploi du temps arrivent dans une prochaine version.
      </p>
    </>
  )
}

export default function Home() {
  const { user } = useAuth()
  return (
    <>
      <h1 className="page-title">Bonjour {user.firstName}</h1>
      {user.role === 'admin' && <AdminHome />}
      {user.role === 'parent' && <ParentHome />}
      {user.role === 'student' && <StudentHome user={user} />}
      {user.role === 'teacher' && <TeacherHome />}
    </>
  )
}
