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

// Email (SMTP)
export const sendEmail = (data) => api.post('/email/send', data);
export const getTemplates = () => api.get('/email/templates');

// Gmail (OAuth)
export const getGmailMessages = (contactEmail, maxResults = 20) =>
  api.get('/gmail/messages', { params: { contactEmail, maxResults } });
export const sendGmailMessage = (data) => api.post('/gmail/send', data);

// Google Calendar
export const getCalendarEvents = (q) => api.get('/calendar/events', { params: { q } });
export const createCalendarEvent = (data) => api.post('/calendar/events', data);
export const deleteCalendarEvent = (eventId) => api.delete(`/calendar/events/${eventId}`);

// OAuth
export const getOAuthStatus = () => api.get('/oauth/status');
export const connectGoogle = () => api.get('/oauth/google/url');
export const disconnectOAuth = (provider) => api.delete(`/oauth/disconnect/${provider}`);

// Reports
export const getDashboard = () => api.get('/reports/dashboard');
export const getTeamReport = () => api.get('/reports/team');
export const getConversionReport = () => api.get('/reports/conversion');
export const rescoreAllLeads = () => api.post('/leads/rescore-all');
export const getAIInsights = () => api.get('/reports/ai-insights');
export const exportCSV = () => api.get('/reports/export', { responseType: 'blob' });
export const getOperationsSummary = () => api.get('/operations/summary');
export const getOperationsReport = () => api.get('/reports/operations');

// Users
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);
export const resetUserPassword = (id, newPassword) => api.put(`/users/${id}/reset-password`, { newPassword });

// Integrations / Config
export const getIntegrations = () => api.get('/integrations/status');
export const getConfig = () => api.get('/config');
export const saveWhatsAppConfig = (d) => api.post('/config/whatsapp', d);
export const testWhatsApp = () => api.post('/config/whatsapp/test');
export const saveEmailConfig = (d) => api.post('/config/email', d);
export const testEmail = (d) => api.post('/config/email/test', d);
export const saveOpenAIConfig = (d) => api.post('/config/openai', d);
export const testOpenAI = () => api.post('/config/openai/test');

// Operations
export const getOperations = (params) => api.get('/operations', { params });
export const createOperation = (data) => api.post('/operations', data);
export const updateOperation = (id, data) => api.put(`/operations/${id}`, data);
export const deleteOperation = (id) => api.delete(`/operations/${id}`);
export const updateOperationStatus = (id, status) => api.put(`/operations/${id}/status`, { status });

// Quotes
export const getQuotes = (params) => api.get('/quotes', { params });
export const createQuote = (data) => api.post('/quotes', data);
export const updateQuote = (id, data) => api.put(`/quotes/${id}`, data);
export const deleteQuote = (id) => api.delete(`/quotes/${id}`);

// Follow-ups
export const getFollowUps = () => api.get('/followups');
export const createFollowUp = (data) => api.post('/followups', data);
export const updateFollowUp = (id, data) => api.put(`/followups/${id}`, data);
export const deleteFollowUp = (id) => api.delete(`/followups/${id}`);

// AI
export const draftEmail = (data) => api.post('/agents/draft-email', data);
export const rescoreLead = (id) => api.post(`/leads/${id}/rescore`);
export const runCampaign = (data) => api.post('/agents/campaign', data);

// Templates
export const getTemplates2 = (params) => api.get('/templates', { params });
export const createTemplate = (data) => api.post('/templates', data);
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => api.delete(`/templates/${id}`);

// Import
export const importLeads = (data) => api.post('/leads/import', data);
