import { UnknownLink } from 'multiformats/link'
import { MultihashIndexItem } from 'cardex/multihash-index-sorted/api'

export interface IndexEntry extends MultihashIndexItem {
  location: URL
}

export interface Index {
  get (c: UnknownLink): Promise<IndexEntry|undefined>
}
