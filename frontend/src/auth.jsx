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

  return <AuthContext.Provider value={{ user, login, logout, signup }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
