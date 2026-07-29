// ============================================
// Proveedores de IA soportados
// ============================================
//
// Los tres hablan el mismo protocolo que OpenAI (mismo endpoint de chat
// completions), así que se usa un único SDK cambiando `baseURL` y la clave.
//
// Las claves se guardan cifradas y solo el super admin las administra: la IA se
// revende, el cliente del CRM no elige proveedor.

const AI_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    keyHint: 'sk-...',
    docs: 'https://platform.openai.com/api-keys',
    // Prefijo con el que OpenRouter identifica a los modelos de este proveedor;
    // se usa para leer sus precios de referencia.
    openRouterPrefix: 'openai/',
    supportsAudio: true, // Whisper solo está aquí
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    keyHint: 'sk-or-...',
    docs: 'https://openrouter.ai/keys',
    openRouterPrefix: '',   // sus ids ya vienen completos (proveedor/modelo)
    supportsAudio: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    keyHint: 'sk-...',
    docs: 'https://platform.deepseek.com/api_keys',
    openRouterPrefix: 'deepseek/',
    supportsAudio: false,
  },
];

const PROVIDERS_BY_ID = Object.fromEntries(AI_PROVIDERS.map(p => [p.id, p]));

const getProvider = (id) => PROVIDERS_BY_ID[id] || PROVIDERS_BY_ID.openai;

const providerName = (id) => PROVIDERS_BY_ID[id]?.name || id;

// Claves de API de todos los proveedores; settingsService las marca como
// administrables solo por el super admin.
const PROVIDER_ENV_KEYS = AI_PROVIDERS.map(p => p.envKey);

// ¿Tiene clave configurada?
const isProviderReady = (id) => !!process.env[getProvider(id).envKey];

/**
 * Identificador del modelo en el catálogo de OpenRouter, que es de donde se
 * toman los precios de referencia para todos los proveedores.
 * Ej.: ('openai', 'gpt-4o-mini') → 'openai/gpt-4o-mini'
 */
function openRouterIdFor(providerId, model) {
  const provider = getProvider(providerId);
  if (!model) return '';
  if (model.includes('/')) return model;           // ya viene calificado
  return `${provider.openRouterPrefix}${model}`;
}

module.exports = {
  AI_PROVIDERS,
  PROVIDERS_BY_ID,
  PROVIDER_ENV_KEYS,
  getProvider,
  providerName,
  isProviderReady,
  openRouterIdFor,
};
