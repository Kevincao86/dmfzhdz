/** 与 lib 同源，避免 context / pages 双份漂移 */
export {
  DH_SEEDANCE_SEGMENT_SEC,
  DH_SEEDANCE_MAX_SEGMENTS,
  chunkScriptForSeedanceVideo,
  estimateDhTargetDurationSec,
  buildDhSeedanceSegmentPrompt,
} from '../lib/digitalHumanSeedancePrompt'
