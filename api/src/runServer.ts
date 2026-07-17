import { startServer } from './index.js'

startServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
