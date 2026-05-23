import { serve } from "@hono/node-server"
import { measure } from "./carbon/index.js"
import { createGateway } from "./gateway/index.js"
import { createFromEnv } from "./inference/index.js"
import { createRouting } from "./routing/index.js"
import { createCallLog } from "./storage/index.js"

const dbPath = process.env.JOULE_DB_PATH ?? "./joule.db"
const port = Number(process.env.JOULE_PORT ?? 3001)

const storage = createCallLog(dbPath)
const inference = createFromEnv()
const routing = createRouting({ inference })
const app = createGateway({
  routing,
  inference,
  carbon: measure,
  storage,
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[joule] listening on http://localhost:${info.port}`)
})
