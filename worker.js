export default {
  async fetch(request, env, ctx) {
    console.log("Entered worker");
    if (request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket(request, env, ctx);
    }
    return new Response("Expected WebSocket", { status: 426 });
  },
};

function handleWebSocket(request, env, ctx) {
  const { pathname } = new URL(request.url);
  console.log("Upgraded to websocket");

  // Accept the WebSocket connection
  const [client, server] = Object.values(new WebSocketPair());

  // Generate a unique recording ID
  const timestamp = new Date().toISOString();
  const recordingId = `recording-${timestamp}`;

  // Buffer to accumulate chunks
  let currentChunk = [];
  let currentChunkSize = 0;
  let chunkCounter = 0;
  const CHUNK_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB in bytes

  // Handle incoming messages
  server.accept();
  let recordingStartTime = Date.now();

  server.addEventListener("message", async (event) => {
    try {
      // Add the new data to the current chunk
      currentChunk.push(event.data);
      currentChunkSize += event.data.size;

      // If we've accumulated enough data, upload it
      if (currentChunkSize >= CHUNK_SIZE_THRESHOLD) {
        await uploadChunk();
      }
    } catch (error) {
      console.error("Error processing chunk:", error);
      server.close(1011, "Error processing video chunk");
    }
  });

  server.addEventListener("close", async () => {
    try {
      // Upload any remaining data
      if (currentChunk.length > 0) {
        await uploadChunk();
      }

      // Create a manifest file with metadata
      await env.screen_recordings.put(
        `${recordingId}/manifest.json`,
        JSON.stringify({
          recordingId,
          startTime: timestamp,
          duration: Date.now() - recordingStartTime,
          totalChunks: chunkCounter,
          contentType: "video/webm",
          status: "completed",
        }),
      );
    } catch (error) {
      console.error("Error finalizing recording:", error);
    }
  });

  server.addEventListener("error", (event) => {
    console.error("WebSocket error:", event);
  });

  // Helper function to upload accumulated chunks
  async function uploadChunk() {
    console.log("uploading chunk");
    const chunkNumber = chunkCounter++;
    const blob = new Blob(currentChunk, { type: "video/webm" });
    // Clear the current chunk buffer
    currentChunk = [];
    currentChunkSize = 0;

    try {
      await env.screen_recordings.put(
        `${recordingId}/chunk-${chunkNumber.toString().padStart(5, "0")}.webm`,
        blob,
        {
          customMetadata: {
            recordingId,
            chunkNumber: chunkNumber.toString(),
            timestamp: new Date().toISOString(),
          },
        },
      );
      console.log("done");
    } catch (error) {
      console.error("R2 upload error:", error);
      server.close(1011, "Error storing video chunk");
    }
  }

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// API endpoint to list recordings
async function handleListRecordings(env) {
  try {
    const list = await env.screen_recordings.list({
      prefix: "recording-",
      delimiter: "/",
    });

    // Get manifests for all recordings
    const recordings = await Promise.all(
      list.objects.map(async (obj) => {
        const manifest = await env.screen_recordings.get(
          `${obj.name}/manifest.json`,
        );
        return manifest ? await manifest.json() : null;
      }),
    );

    return new Response(JSON.stringify(recordings.filter(Boolean)), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to list recordings" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// API endpoint to get a specific recording's metadata
async function handleGetRecording(env, recordingId) {
  try {
    const manifest = await env.screen_recordings.get(
      `${recordingId}/manifest.json`,
    );
    if (!manifest) {
      return new Response(JSON.stringify({ error: "Recording not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const metadata = await manifest.json();

    // List all chunks for this recording
    const chunks = await env.screen_recordings.list({
      prefix: `${recordingId}/chunk-`,
      delimiter: "/",
    });

    metadata.chunks = chunks.objects.map((obj) => obj.key);

    return new Response(JSON.stringify(metadata), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to get recording metadata" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
