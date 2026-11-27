import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Where `npm run dev` sends the API calls: the server of apps/server, started on this machine.
// `npm run dev:fake` needs no server at all (see src/fake).
const server = process.env.WR_SERVER ?? 'http://127.0.0.1:4600'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  server: {
    proxy: { '/api': server, '/files': server },
  },
})
