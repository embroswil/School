import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Le compilateur React (babel-plugin-react-compiler) n'est plus utilise : il reorganisait
// certains calculs et provoquait en production des erreurs « null is not an object »
// introuvables dans le code. L'application est construite telle qu'elle est ecrite.
export default defineConfig({
  plugins: [react()],
})
