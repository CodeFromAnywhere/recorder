Attempt to create a screen recorder from browser that streams the recording to cloud storage for later processing.

TODO:

- ✅ Got it to stream and store result in chunks of up to 10MB in R2
- Figure out if it's possible to `append` a chunk to another chunk
- Figure out the encoding format so the generated mp4 can always be played
- Make ux nicer with better configuration options (such as toggle audio, toggle video, toggle camera, resolution). Also per video allow public/unlisted.
- Put this behind a github login so recordings get put behind github user ID and are accessible via a public (unlisted) URL. On cloudrecorder.com/[owner] we could list all public videos of a person or also private if you're logged in.

This is basically a great way to collect your own personal work 24/7 via a browser. AI processing could analyze the video to see what you're doing througout the day. This could all happen in the cloud.