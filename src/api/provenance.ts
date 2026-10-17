import { z } from 'zod';

// Defaults preserve saved reports written before feed provenance was introduced.
export const feedProvenanceSchema = z.object({
  mode: z.enum(['replay', 'feed']).default('replay'),
  clock_mode: z.enum(['simulated', 'wall_utc']).default('simulated'),
  feed_source_id: z.string().nullable().default(null),
  feed_source_label: z.string().nullable().default(null),
  feed_data_digest: z.string().nullable().default(null),
});

// Internal legacy fixture contracts must retain their original shape when absent.
export const optionalFeedProvenanceSchema = z.object({
  mode: feedProvenanceSchema.shape.mode.removeDefault().optional(),
  clock_mode: feedProvenanceSchema.shape.clock_mode.removeDefault().optional(),
  feed_source_id: feedProvenanceSchema.shape.feed_source_id.removeDefault().optional(),
  feed_source_label: feedProvenanceSchema.shape.feed_source_label.removeDefault().optional(),
  feed_data_digest: feedProvenanceSchema.shape.feed_data_digest.removeDefault().optional(),
});
