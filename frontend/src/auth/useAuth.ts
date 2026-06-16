import { useState } from 'react'
import type { PageType } from '../pages'
import { useCurrentUser, useLogout } from '../services/queries'

export function useAuth() {
  const [page, setPage] = useState<PageType>('home')
  const { data: user } = useCurrentUser()
  const logoutMutation = useLogout()

  const isLoggedIn = !!user

  const logout = () => {
    console.log('useAuth - logout called')
    logoutMutation.mutate()
  }

  return {
    user,
    isLoggedIn,
    page,
    setPage,
    logout,
  }
}