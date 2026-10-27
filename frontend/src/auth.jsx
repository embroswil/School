import { createContext, useContext, useEffect, useState } from 'react'
import { api, session } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.get()?.user ?? null)

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('school:logout', onLogout)
    return () => window.removeEventListener('school:logout', onLogout)
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

  return <AuthContext.Provider value={{ user, login, logout, signup, majUser }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
