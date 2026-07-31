import { createHash } from 'node:crypto'

type ContentBlob = {
  content: string
  referenceCount: number
}

export class ContentStore {
  private readonly blobs = new Map<string, ContentBlob>()

  add(content: string) {
    const hash = createHash('sha256').update(content).digest('hex')
    const existing = this.blobs.get(hash)

    if (existing) {
      existing.referenceCount += 1
    } else {
      this.blobs.set(hash, { content, referenceCount: 1 })
    }

    return hash
  }

  get(hash: string) {
    const blob = this.blobs.get(hash)
    if (!blob) {
      throw new Error(`找不到内容 Blob：${hash}`)
    }
    return blob.content
  }

  getReferenceCount(hash: string) {
    return this.blobs.get(hash)?.referenceCount ?? 0
  }

  get size() {
    return this.blobs.size
  }
}
