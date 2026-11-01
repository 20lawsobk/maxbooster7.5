/** Public admission failures; messages contain no provider tokens or payloads. */
export class SocialPublishRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "SocialPublishRequestError";
  }
}
