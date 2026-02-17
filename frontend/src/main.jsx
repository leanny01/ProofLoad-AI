import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'

// Production: use backend URL from env. Dev: relative paths go through Vite proxy.
const apiBase = import.meta.env.VITE_API_URL || '';
axios.defaults.baseURL = apiBase;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
