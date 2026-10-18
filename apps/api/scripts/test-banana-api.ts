const apiKey = process.env.KIE_API_KEY;

if (!apiKey) {
  console.error("Missing KIE_API_KEY. Add it to the repository .env file first.");
  process.exit(1);
}

const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "nano-banana-2-1",
    input: {
      prompt: "A simple ukiyo-e style blue wave, clean composition",
      aspect_ratio: "1:1",
      resolution: "1K",
      output_format: "jpg",
    },
  }),
});

const responseText = await response.text();
let body: unknown;

try {
  body = JSON.parse(responseText);
} catch {
  console.error(`API returned non-JSON content (HTTP ${response.status}).`);
  console.error(responseText.slice(0, 500));
  process.exit(1);
}

if (!response.ok) {
  console.error(`API request failed with HTTP ${response.status}.`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (
  typeof body !== "object" ||
  body === null ||
  !("code" in body) ||
  typeof body.code !== "number"
) {
  console.error("API returned an unexpected response shape.");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (body.code !== 200) {
  console.error(`API rejected the task with business code ${body.code}.`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const data =
  "data" in body && typeof body.data === "object" && body.data !== null
    ? body.data
    : null;
const taskId =
  data && "taskId" in data && typeof data.taskId === "string" ? data.taskId : null;

if (!taskId) {
  console.error("API reported success but did not return a task ID.");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log("Nano Banana API is reachable and accepted the task.");
console.log(`Task ID: ${taskId}`);
