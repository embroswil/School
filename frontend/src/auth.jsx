import { createContext, useContext, useEffect, useState } from 'react'
import { api, renewSession, session } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.get()?.user ?? null)

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('school:logout', onLogout)
    return () => window.removeEventListener('school:logout', onLogout)
  }, [])

  // Session ouverte avant l'arrivee des espaces : on complete le profil une fois
  useEffect(() => {
    const s = session.get()
    if (!s?.user || s.user.peutChangerEspace !== undefined) return
    api
      .get('/api/auth/me')
      .then(({ data }) => {
        const s2 = session.get()
        if (!s2?.user || !data) return
        session.set({ ...s2, user: { ...s2.user, ...data } })
        setUser((u) => (u ? { ...u, ...data } : u))
      })
      .catch(() => {})
  }, [])

  async function login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password }, { auth: false })
    session.set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
    setUser(data.user)
  }

  async function signup(donnees) {
    const res = await api.post('/api/inscriptions', donnees, { auth: false })
    return res
  }

  // Met a jour l'utilisateur garde en memoire (ex. email confirme)
  function majUser(champs) {
    const s = session.get()
    if (s?.user) session.set({ ...s, user: { ...s.user, ...champs } })
    setUser((u) => (u ? { ...u, ...champs } : u))
  }

  // Administrateur d'etablissement aussi parent : passer de l'espace de l'etablissement a l'espace parent
  async function changerEspace(espace) {
    const refreshToken = session.get()?.refreshToken
    const { data } = await api.post('/api/auth/espace', { espace, refreshToken })
    session.set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
    window.location.hash = '/'
    setUser(data.user)
    window.scrollTo(0, 0)
  }

  // Enseignant dans plusieurs etablissements : ouvrir un autre de ses etablissements
  async function changerEtablissement(schoolId) {
    const refreshToken = session.get()?.refreshToken
    const { data } = await api.post('/api/auth/etablissement', { schoolId, refreshToken })
    session.set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
    window.location.hash = '/'
    setUser(data.user)
    window.scrollTo(0, 0)
  }

  // Profil relu depuis le serveur (ex. enseignant accepte par un etablissement)
  async function actualiser() {
    if (await renewSession()) setUser(session.get()?.user ?? null)
  }

  async function logout() {
    const refreshToken = session.get()?.refreshToken
    try {
      await api.post('/api/auth/logout', { refreshToken })
    } catch {
      // Déconnexion locale quoi qu'il arrive.
    }
    session.clear()
    setUser(null)
    window.location.hash = '/'
  }

  return <AuthContext.Provider value={{ user, login, logout, signup, majUser, changerEspace, changerEtablissement, actualiser }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
