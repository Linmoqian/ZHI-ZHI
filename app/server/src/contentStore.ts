import { createHash } from 'node:crypto'

type ContentBlob = {
  content: string
  referenceCount: number
}

export type SerializedBlob = Omit<ContentBlob, never> & { hash: string }

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

  /** 从序列化的 Blob 列表恢复内容存储（用于会话快照恢复）。 */
  hydrate(blobs: SerializedBlob[]) {
    for (const blob of blobs) {
      this.blobs.set(blob.hash, {
        content: blob.content,
        referenceCount: blob.referenceCount,
      })
    }
  }

  /** 导出当前所有 Blob（用于会话快照序列化）。 */
  toSerializedBlobs(): SerializedBlob[] {
    return [...this.blobs.entries()].map(([hash, blob]) => ({
      hash,
      content: blob.content,
      referenceCount: blob.referenceCount,
    }))
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
