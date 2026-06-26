import { createServer } from "node:http";

import { createShareApp } from "./index.js";

const app = createShareApp({ publicBaseUrl: "http://localhost:8787" });

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const fetchResponse = await app.fetch(
    new Request(`http://localhost:8787${request.url ?? "/"}`, {
      method: request.method,
      headers: request.headers as HeadersInit,
      body
    })
  );

  const headers: Record<string, string> = {};
  fetchResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  response.writeHead(fetchResponse.status, headers);
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}).listen(8787, () => {
  console.log("share-server listening on http://localhost:8787");
});
