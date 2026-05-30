declare module 'ali-oss' {
  export default class OSS {
    constructor(options: {
      region: string
      accessKeyId: string
      accessKeySecret: string
      bucket: string
    })
    signatureUrl(
      name: string,
      options?: Record<string, string | number | undefined>,
    ): string
    put(
      name: string,
      file: Buffer,
      options?: { headers?: Record<string, string> },
    ): Promise<unknown>
    initMultipartUpload(
      name: string,
      options?: { headers?: Record<string, string> },
    ): Promise<{ uploadId?: string }>
    uploadPart(
      name: string,
      uploadId: string,
      partNo: number,
      file: Buffer,
    ): Promise<{ etag?: string; res?: { headers?: { etag?: string } } }>
    completeMultipartUpload(
      name: string,
      uploadId: string,
      parts: { number: number; etag: string }[],
    ): Promise<unknown>
    delete(name: string): Promise<unknown>
  }
}
