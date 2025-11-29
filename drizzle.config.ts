import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './resources/migrations',
  dialect: 'sqlite'
})
