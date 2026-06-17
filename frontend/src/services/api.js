import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('acon_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('acon_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// Leads
export const getLeads = (params) => api.get('/leads', { params });
export const getLead = (id) => api.get(`/leads/${id}`);
export const createLead = (data) => api.post('/leads', data);
export const updateLead = (id, data) => api.put(`/leads/${id}`, data);
export const deleteLead = (id) => api.delete(`/leads/${id}`);

// Pipeline
export const getKanban = () => api.get('/pipeline/kanban');
export const moveLead = (data) => api.put('/pipeline/move', data);

// Activities
export const getActivities = (leadId) => api.get(`/activities/lead/${leadId}`);
export const createActivity = (data) => api.post('/activities', data);

// WhatsApp
export const getConversation = (leadId) => api.get(`/whatsapp/conversations/${leadId}`);
export const sendWhatsApp = (data) => api.post('/whatsapp/send', data);
export const sendTemplate = (data) => api.post('/whatsapp/template', data);

// Email
export const sendEmail = (data) => api.post('/email/send', data);
export const getTemplates = () => api.get('/email/templates');

// Reports
export const getDashboard = () => api.get('/reports/dashboard');
export const getTeamReport = () => api.get('/reports/team');
export const getConversionReport = () => api.get('/reports/conversion');
export const rescoreAllLeads = () => api.post('/leads/rescore-all');
export const getAIInsights = () => api.get('/reports/ai-insights');
export const exportCSV = () => api.get('/reports/export', { responseType: 'blob' });

// Users
export const getUsers = () => api.get('/users');
export const updateUser = (id, data) => api.put(`/users/${id}`, data);

// Integrations
export const getIntegrations = () => api.get('/integrations/status');

// Config / Integraciones
export const getConfig = () => api.get('/config');
export const saveWhatsAppConfig = (d) => api.post('/config/whatsapp', d);
export const testWhatsApp = () => api.post('/config/whatsapp/test');
export const saveEmailConfig = (d) => api.post('/config/email', d);
export const testEmail = (d) => api.post('/config/email/test', d);
export const saveOpenAIConfig = (d) => api.post('/config/openai', d);
export const testOpenAI = () => api.post('/config/openai/test');
export const saveFBConfig = (d) => api.post('/config/facebook', d);
export const testFacebook = () => api.post('/config/facebook/test');

// AI Agents
export const draftEmail = (data) => api.post('/agents/draft-email', data);
export const rescoreLead = (id) => api.post(`/agents/rescore/${id}`);
