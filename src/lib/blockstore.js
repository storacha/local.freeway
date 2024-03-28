import { readBlockHead, asyncIterableReader } from '@ipld/car/decoder'

/**
 * @typedef {import('multiformats').UnknownLink} UnknownLink
 * @typedef {import('dagula').Block} Block
 */

// 2MB (max safe libp2p block size) + typical block header length + some leeway
const MAX_ENCODED_BLOCK_LENGTH = (1024 * 1024 * 2) + 39 + 61

export class Blockstore {
  /**
   * @param {import('./api.js').Index} index
   */
  constructor (index) {
    this._idx = index
  }

  /** @param {UnknownLink} cid */
  async get (cid) {
    // console.log(`get ${cid}`)
    const entry = await this._idx.get(cid)
    if (!entry) return

    const res = await fetch(entry.location, {
      headers: {
        Range: `bytes=${entry.offset}-${entry.offset + MAX_ENCODED_BLOCK_LENGTH}`
      }
    })
    if (!res.ok || !res.body) return

    const reader = res.body.getReader()
    const bytesReader = asyncIterableReader((async function * () {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    })())

    const blockHeader = await readBlockHead(bytesReader)
    const bytes = await bytesReader.exactly(blockHeader.blockLength)
    reader.cancel()
    return { cid, bytes }
  }
}
