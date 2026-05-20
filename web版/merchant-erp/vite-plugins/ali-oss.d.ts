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
  }
}
