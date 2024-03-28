/* global ReadableStream */
import * as Link from 'multiformats/link'
import * as raw from 'multiformats/codecs/raw'
import * as Claims from '@web3-storage/content-claims/client'
import { MultihashIndexSortedReader } from 'cardex/multihash-index-sorted'
import { Map as LinkMap } from 'lnmap'
import { Set as LinkSet } from 'lnset'

/**
 * @typedef {import('multiformats').UnknownLink} UnknownLink
 * @typedef {import('./api.js').IndexEntry} IndexEntry
 * @typedef {import('./api.js').Index} Index
 */

/** @implements {Index} */
export class ContentClaimsIndex {
  /**
   * Cached index entries.
   * @type {Map<UnknownLink, IndexEntry>}
   */
  #cache
  /**
   * CIDs for which we have already fetched claims.
   *
   * Note: _only_ the CIDs which have been explicitly queried, for which we
   * have made a content claim request. Not using `this.#cache` because reading
   * a claim may cause us to add other CIDs to the cache that we haven't read
   * claims for.
   *
   * Note: implemented as a Map not a Set so that we take advantage of the
   * key cache that `lnmap` provides, so we don't duplicate base58 encoded
   * multihash keys.
   * @type {Map<UnknownLink, true>}
   */
  #claimFetched
  /**
   * @type {URL|undefined}
   */
  #serviceURL

  /** @param {URL} serviceURL */
  constructor (serviceURL) {
    this.#cache = new LinkMap()
    this.#claimFetched = new LinkMap()
    this.#serviceURL = serviceURL
  }

  /**
   * @param {UnknownLink} cid
   * @returns {Promise<IndexEntry | undefined>}
   */
  async get (cid) {
    // get the index data for this CID (CAR CID & offset)
    let indexItem = this.#cache.get(cid)

    // read the index for _this_ CID to get the index data for it's _links_.
    //
    // when we get to the bottom of the tree (raw blocks), we want to be able
    // to send back the index information without having to read claims for
    // each leaf. We can only do that if we read the claims for the parent now.
    if (indexItem) {
      // we found the index data! ...if this CID is raw, then there's no links
      // and no more index information to discover so don't read claims.
      if (cid.code !== raw.code) {
        await this.#readClaims(cid)
      }
    } else {
      // we not found the index data!
      await this.#readClaims(cid)
      // seeing as we just read the index for this CID we _should_ have some
      // index information for it now.
      indexItem = this.#cache.get(cid)
      // if not then, well, it's not found!
      if (!indexItem) return
    }
    return indexItem
  }

  /**
   * Read claims for the passed CID and populate the cache.
   * @param {import('multiformats').UnknownLink} cid
   */
  async #readClaims (cid) {
    if (this.#claimFetched.has(cid)) return

    const walkedClaims = await Claims.read(cid, { serviceURL: this.#serviceURL, walk: ['parts', 'includes'] })
    /** @type {Map<import('multiformats').UnknownLink, import('@web3-storage/content-claims/client/api').Claim[]>} */
    const claims = new LinkMap()
    for (const c of walkedClaims) {
      claims.set(c.content, (claims.get(c.content) ?? []).concat(c))
    }

    const parts = new LinkSet()
    for (const c of claims.get(cid) ?? []) {
      if (c.type === 'assert/partition') {
        for (const p of c.parts) {
          parts.add(p)
        }
      }
    }

    // collect locations
    /** @type {Map<import('multiformats').UnknownLink, URL>} */
    const locations = new LinkMap()
    for (const c of walkedClaims) {
      if (c.type === 'assert/location') {
        locations.set(c.content, new URL(c.location[0]))
      }
    }

    // need a inclusion claim for each part
    /** @type {Map<import('multiformats').UnknownLink, import('multiformats').Link>} */
    const inclusions = new LinkMap()
    for (const p of parts) {
      for (const c of claims.get(p) ?? []) {
        if (c.type === 'assert/inclusion') {
          inclusions.set(p, c.includes)
          break
        }
      }
    }

    // fetch indexes
    for (const [part, includes] of inclusions.entries()) {
      const partLocation = locations.get(part)
      if (!partLocation) {
        console.warn(`missing location claim for part: ${part}`)
        continue
      }

      const indexLocation = locations.get(includes)
      if (!indexLocation) {
        console.warn(`missing location claim for index: ${includes}`)
        continue
      }

      const res = await fetch(indexLocation)
      if (!res.ok || !res.body) {
        console.warn(`failed to fetch index: ${includes} from location: ${indexLocation}`)
        continue
      }

      const entries = await decodeIndex(partLocation, res.body)
      for (const entry of entries) {
        this.#cache.set(Link.create(raw.code, entry.multihash), entry)
      }
    }

    this.#claimFetched.set(cid, true)
  }
}

/**
 * Read a MultihashIndexSorted index for the passed location and return a
 * list of IndexEntry.
 * @param {URL} location
 * @param {ReadableStream<Uint8Array>} readable
 */
const decodeIndex = async (location, readable) => {
  const entries = []
  const reader = MultihashIndexSortedReader.createReader({ reader: readable.getReader() })
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    entries.push(/** @type {IndexEntry} */({ location, ...value }))
  }
  return entries
}
