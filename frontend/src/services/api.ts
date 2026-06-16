import axios from 'axios'
import { defaultHeaders } from './headers'

// API endpoints
export const endpoints = {
  health: '/health',
  patients: '/patients',
  createPatient: '/createPatient',
  login: '/login',
  logout: '/logout',
  me: '/me',
  doctors: '/doctors',
  appointments: '/appointments',
  medicalRecords: '/medical-records',
  chat: '/chat',
  clearSession: '/clear-session',
  appointment: '/appointment'
}

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000',
  headers: defaultHeaders,
  withCredentials: true,
  timeout: 120000, // 120 second timeout to allow backend model loading time
})

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', {
      url: config.url,
      baseURL: config.baseURL,
      fullURL: (config.baseURL ?? '') + (config.url ?? ''),
      method: config.method,
    })
    return config
  },
  (error) => {
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log('API Response Success:', response.data)
    return response
  },
  (error) => {
    // Enhanced error logging for debugging
    const errorDetails: any = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
    }
    
    // Add user-friendly timeout message
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      errorDetails.userMessage = 'Request took too long. The model may still be loading. Please try again.'
    }
    
    console.error('API Response Error:', errorDetails)
    if (error.response?.status === 401) {
      console.error('Unauthorized access')
    }
    return Promise.reject(error)
  }
)

export default api

