import { hc } from 'hono/client'

// This will be imported from the backend once we have the type exports set up
// For now, we'll define the base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

// Create the Hono RPC client
// In production, this would import the AppType from the backend
export const apiClient = hc(API_BASE_URL)

// Helper function to get auth headers
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// API client with auth
export function createAuthenticatedClient() {
  return hc(API_BASE_URL, {
    headers: getAuthHeaders()
  })
}