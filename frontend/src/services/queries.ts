import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { endpoints } from './api'

// Types (you can move these to a separate types file)
export interface Patient {
  id: number
  first_name: string
  last_name: string
  date_of_birth: string
  email?: string
  password?: string
  phone?: string
  address?: string
  created_at: string
  updated_at: string
}

export interface Appointment {
  id: number
  patient_id: number
  doctor_id: number
  appointment_date: string
  duration_minutes: number
  status: 'scheduled' | 'cancelled' | 'completed' | 'rescheduled'
  notes?: string
  created_at: string
  doctor_first_name?: string
  doctor_last_name?: string
  specialty?: string
}

export interface Doctor {
  id: number
  first_name: string
  last_name: string
  specialty?: string
  license_number: string
  email?: string
  phone?: string
  hire_date: string
  is_active: boolean
}

// Query Keys
export const queryKeys = {
  patients: ['patients'] as const,
  patient: (id: number) => ['patients', id] as const,
  doctors: ['doctors'] as const,
  doctor: (id: number) => ['doctors', id] as const,
  currentUser: ['me'] as const,
  appointments: ['appointments'] as const,
  medicalRecords: ['medical-records'] as const,
  currentUserAppointments: ['me', 'appointments'] as const,
}

// Current user query - restores session on mount/refresh
export const useCurrentUser = () => {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: async () => {
      try {
        const response = await api.get(endpoints.me)
        return response.data
      } catch (error) {
        // If not logged in, return null instead of throwing
        return null
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false, // Don't retry on 401/403
  })
}

export const useCurrentUserAppointments = () => {
  return useQuery({
    queryKey: queryKeys.currentUserAppointments,
    queryFn: async (): Promise<Appointment[]> => {
      try {
        const response = await api.get(endpoints.appointments)
        return response.data
      } catch (error) {
        console.error('Error fetching current user appointments:', error)
        return []
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false, // Don't retry on 401/403
  })
}

// Health check query
export const useHealthCheck = () => {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => { 
      try {
        console.log('Health check - fetching from:', api.defaults.baseURL + endpoints.health)
        const response = await api.get(endpoints.health)
        console.log('Health check - response:', response.data)
        return response.data
      } catch (error) {
        console.error('Health check - error:', error)
        throw error
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

// Patients queries
export const usePatients = () => {
  return useQuery({
    queryKey: queryKeys.patients,
    queryFn: async (): Promise<Patient[]> => {
      const response = await api.get(endpoints.patients)
      return response.data
    },
  })
}

export const usePatient = (id: number) => {
  return useQuery({
    queryKey: queryKeys.patient(id),
    queryFn: async (): Promise<Patient> => {
      const response = await api.get(`${endpoints.patients}/${id}`)
      return response.data
    },
    enabled: !!id,
  })
}

// Doctors queries
export const useDoctors = () => {
  return useQuery({
    queryKey: queryKeys.doctors,
    queryFn: async (): Promise<Doctor[]> => {
      const response = await api.get(endpoints.doctors)
      return response.data
    },
  })
}

// Mutations
export const useCreatePatient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patientData: Omit<Patient, 'id' | 'created_at' | 'updated_at'>) => {
      const response = await api.post(endpoints.createPatient, patientData)
      return response.data
    },
    onSuccess: () => {
      // Invalidate and refetch patients list
      queryClient.invalidateQueries({ queryKey: queryKeys.patients })
    },
  })
}

export const useLogin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patientData: { email: string; password: string }) => {
      console.log('LOGIN ===================')
      console.log('useLogin - mutationFn called with:', patientData)
      const response = await api.post(endpoints.login, patientData, { withCredentials: true })
      return response.data
    },
    onSuccess: (data) => {
      console.log('useLogin - onSuccess called with data:', data)
      console.log('useLogin - setting query data for currentUser:', data.user)
      queryClient.setQueryData(queryKeys.currentUser, data.user)
    },
  })
}

export const useLogout = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await api.post(endpoints.logout, {}, { withCredentials: true })
      return response.data
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.currentUser })
    },
  })
}

export const useChat = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ message, sessionId }: { message: string; sessionId?: string }) => {
      const response = await api.post(endpoints.chat, { message, sessionId })
      return response.data as {
        response: string
        sessionId: string
        action?: string
        actionData?: Record<string, any>
      }
    },
    onSuccess: (data) => {
      if (data.action === 'appointments_updated') {
        queryClient.invalidateQueries({ queryKey: queryKeys.currentUserAppointments })
      }
    },
  })
}

export const useUpdatePatient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patientData }: Partial<Patient> & { id: number }) => {
      const response = await api.put(`${endpoints.patients}/${id}`, patientData)
      return response.data
    },
    onSuccess: (data) => {
      // Update the specific patient in cache
      queryClient.setQueryData(queryKeys.patient(data.id), data)
      // Invalidate patients list
      queryClient.invalidateQueries({ queryKey: queryKeys.patients })
    },
  })
}

export const useDeletePatient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${endpoints.patients}/${id}`)
      return id
    },
    onSuccess: (id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: queryKeys.patient(id) })
      // Invalidate patients list
      queryClient.invalidateQueries({ queryKey: queryKeys.patients })
    },
  })

}