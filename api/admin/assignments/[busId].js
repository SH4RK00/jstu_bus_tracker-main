import handler from '../../_lib/serverless-api.js';

export default async function (req, res) {
  // Preserve original URL and dispatch to central handler
  return handler(req, res);
}
