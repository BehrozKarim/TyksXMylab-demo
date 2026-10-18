import type { IncomingMessage, ServerResponse } from 'node:http';
import { summaryRequestSchema } from '../src/summary/facts.js';
import { SummaryService, SummaryLimitError } from '../server/summary-service.js';

type Request = IncomingMessage & { body?: unknown };
const MAX_BODY_BYTES = 24000;
class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function readBody(request: Request) {
  if (Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES)
    throw new RequestError(413, 'Report is too large');
  let raw: string;
  if (request.body !== undefined)
    raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        request.resume();
        throw new RequestError(413, 'Report is too large');
      }
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new RequestError(413, 'Report is too large');
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestError(400, 'Send a JSON aggregate report');
  }
}

export function createSummaryHandler(
  options: { service?: SummaryService; env?: () => NodeJS.ProcessEnv } = {},
) {
  const service = options.service ?? new SummaryService();
  return async (request: Request, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        throw new RequestError(405, 'Use POST');
      }
      const origin = request.headers.origin;
      let host: string | undefined;
      try {
        host = origin ? new URL(origin).host : undefined;
      } catch {
        /* Invalid origin is denied. */
      }
      if (
        !host ||
        host !== request.headers.host ||
        request.headers['sec-fetch-site'] === 'cross-site'
      )
        throw new RequestError(403, 'Use this website to request a summary');
      if (
        String(request.headers['content-type'] ?? '')
          .split(';')[0]
          .trim()
          .toLowerCase() !== 'application/json'
      )
        throw new RequestError(415, 'Use application/json');
      const result = summaryRequestSchema.safeParse(await readBody(request));
      if (!result.success)
        throw new RequestError(422, 'The aggregate report is invalid or inconsistent');
      const env = options.env?.() ?? process.env;
      const ip = String(request.headers['x-real-ip'] ?? request.socket.remoteAddress ?? 'unknown');
      send(
        200,
        await service.summarize(result.data.report, ip, {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_SUMMARY_MODEL,
          enabled: env.AI_SUMMARY_ENABLED !== '0',
        }),
      );
    } catch (error) {
      if (error instanceof SummaryLimitError) {
        response.setHeader('Retry-After', '60');
        send(429, {
          error: {
            code: 'summary_rate_limited',
            message: 'Please wait a minute before requesting another AI summary.',
          },
        });
      } else if (error instanceof RequestError)
        send(error.status, { error: { code: 'invalid_summary_request', message: error.message } });
      else
        send(500, {
          error: { code: 'summary_unavailable', message: 'Could not prepare the AI summary.' },
        });
    }
  };
}

export default createSummaryHandler();
