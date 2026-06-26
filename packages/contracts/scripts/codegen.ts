import { access, mkdir, writeFile } from "node:fs/promises";

const header = `// Generated contract marker.
// Real OpenAPI generation can replace this script without changing package consumers.
`;

await mkdir(new URL("../generated", import.meta.url), { recursive: true });
await access(new URL("../generated/types.ts", import.meta.url));
await access(new URL("../generated/client.ts", import.meta.url));
await writeFile(new URL("../generated/.codegen-stamp", import.meta.url), header);
