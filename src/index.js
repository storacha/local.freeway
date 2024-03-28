import http from 'node:http'
import { handler } from './handler.js'

const port = parseInt(process.env.PORT ?? '9000')
http.createServer(handler).listen(port, () => console.log(`Listening on :${port}`))
