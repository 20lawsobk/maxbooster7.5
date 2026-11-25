export {
  SOCIAL_URL_MAXCORE_ENDPOINT,
  buildSocialUrlMaxCoreRequest,
  normalizeSocialUrlMaxCoreResponse,
  isSocialUrlSourceRejection,
  classifySocialUrlGenerationFailure,
  generateSocialUrlWithMaxCore,
} from "./maxcoreGenerationService.js";
export type {
  SocialUrlGenerationOptions,
  SocialUrlMaxCoreVariant,
  SocialUrlGenerationFailure,
} from "./maxcoreGenerationService.js";
