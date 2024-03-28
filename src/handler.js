import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import dotenv from 'dotenv'
import Worker from './worker.js'

/** @type {import('http').RequestListener} */
export async function handler (req, res) {
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const headers = new Headers()
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1])
  }
  const { method } = req
  const body = ['GET', 'HEAD'].includes(method ?? '') ? undefined : Readable.toWeb(req)
  // @ts-expect-error
  const request = new Request(url, { method, headers, body })

  const env = { DEBUG: process.env.DEBUG ?? 'false', ...dotenv.config().parsed }
  const ctx = { waitUntil: () => {} }
  // @ts-expect-error
  const response = await Worker.fetch(request, env, ctx)

  res.statusCode = response.status
  res.statusMessage = response.statusText
  response.headers.forEach((v, k) => res.setHeader(k, v))
  if (!response.body) {
    res.end()
    return
  }

  // @ts-expect-error
  await pipeline(Readable.fromWeb(response.body), res)
}
