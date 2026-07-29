import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ============================================
// Build del frontend
// ============================================
//
// Se migró de Create React App a Vite. CRA está descontinuado: arrastraba unas
// 65 vulnerabilidades de severidad alta en su cadena de dependencias de build
// (nth-check, postcss, serialize-javascript, underscore) que ya no se van a
// parchear nunca.
//
// El código de la aplicación no cambia: las variables REACT_APP_* se siguen
// leyendo como `process.env.REACT_APP_*`, sustituidas en tiempo de compilación
// por el bloque `define` de abajo.

export default defineConfig(({ mode }) => {
  // Solo se exponen las variables con el prefijo de siempre. Cualquier otra
  // cosa del entorno del servidor de build (claves, tokens) NO debe acabar
  // dentro del bundle.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith('REACT_APP_')),
  );

  return {
    plugins: [react()],

    // CRA servía la carpeta public/ tal cual; Vite hace lo mismo.
    publicDir: 'public',

    define: {
      'process.env': JSON.stringify(env),
    },

    build: {
      // nginx.conf ya cachea /static/ de forma agresiva: se mantiene esa ruta
      // para no tener que tocar la configuración del servidor.
      outDir: 'build',
      assetsDir: 'static',
      sourcemap: false, // no publicar el mapa del código en producción
      chunkSizeWarningLimit: 900,
    },

    server: {
      port: 3000,
      // Equivalente al "proxy" que tenía CRA en package.json.
      proxy: {
        '/api': { target: 'http://localhost:5001', changeOrigin: true },
      },
    },
  };
});
