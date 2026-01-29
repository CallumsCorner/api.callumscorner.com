
# api.callumscorner.com

The Express.js backend server currently hosted at [api.callumscorner.com](https://api.callumscorner.com).

## Architecture & Deployment Overview

In production, each component of the donation system (this API, the donate page, refund page, admin panel, overlay, etc.) runs in its own Docker container.

- Containers communicate exclusively over **private Docker bridge networks**
- Internal services are **not exposed to the public internet**
- A private reverse proxy is the **only public-facing component**
- Only explicitly required ports are exposed

This provides strong network-level isolation between public traffic and internal services, reducing attack surface and blast radius.

### Donate Page Migration

Due to a request from **Stripe**, the donate page was moved off `donate.callumscorner.com`.

- The donate frontend now lives under `callumscorner.com`
- A reverse proxy rule is in place that **redirects all requests** from `donate.callumscorner.com` to `callumscorner.com`
- Paths are preserved during the redirect

As a result, existing links and integrations pointing at `donate.callumscorner.com` continue to function without breaking, such as Twitch OAuth callbacks.

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MariaDB
- **Real-time**: WebSocket (`ws`)
- **Payments**: Stripe, PayPal
- **TTS**: AWS Polly
- **AI Filtering**: Local LLM server with phonetic-analysis fallback
- **Containerisation**: Docker

---

## Planned Improvements

### TTS Pre-generation

Currently, TTS audio is generated on-demand when the overlay plays each donation. This causes a noticeable delay - sometimes AWS Polly takes a few seconds to respond, so the donation message appears on screen before the voice starts reading it out.

The fix: generate TTS audio as soon as the donation enters the queue, not when it's played. The API stores the audio file and the overlay just fetches the pre-generated file. No waiting.

### TTS Caching

If someone donates the same message multiple times (e.g. "Jezzaman tipped £2.22. Niceword Niceword Niceword"), there's no point regenerating the same audio. The plan is to hash the TTS text and cache the resulting audio server-side. Same text = same hash = return cached file instead of hitting AWS again.

---

## Content Moderation
The API uses a hybrid content filtering system (`lib/ai-filter.js`) that combines:

1.  **Phonetic Analysis** - Uses metaphone, soundex, and double-metaphone algorithms to detect sound-alike bypass attempts
2.  **AI Consultation** - Queries a local LLM server for borderline cases requiring contextual understanding
3.  **Regex Fallback** - Basic pattern matching when AI is unavailable

This allows detection of filter evasion techniques like "A1ex" (leetspeak) or "Alicks" (Phonetic bypass) for blocked terms, in this example - "Alex".

### System Prompt
The system prompt given to the AI in the event that standard phonetic analysis is inconclusive

```
You are an expert at detecting filter bypass attempts in donation messages.


IMPORTANT: This is ONLY the first stage of filtering. Offensive, racist, or disgusting content will be filtered out later in the process. Your job is ONLY to detect matches to the banned words list. IGNORE ALL OTHER CONTENT - no matter how offensive, racist, or disgusting it is. Return it unfiltered if it doesn't match the banned words. Messages returned after this will be passed into another AI filter to remove offensive language. It is therefore okay for you to completely ignore offensive language as you know it is dealt with at a later stage.

TASK: Check if the message contains or sounds like any banned word/name/symbol from the list.


MATCHING TYPES:

1. EXACT MATCHES: Direct character/symbol matches (e.g., "卐" symbol)
2. PHONETIC MATCHES: Sound-alike words
- "Lun Dun" = "London" → MATCH
- "Loo Iss" = "Lewis" → MATCH
  

CONTEXT IS CRITICAL - UNDERSTAND WHAT THE BANNED WORD REPRESENTS:
- If a banned word is an ADDRESS (e.g., "12 Orchard Street", "Baldy Cottage"), only match it when used AS an address
→ "12 Orchard Street" = MATCH (full address)
→ "orchard" or "orchards" alone = NO MATCH (just a common word about fruit trees)
→ "My cottage has a fireplace" = NO MATCH (talking about cottages in general, not "Baldy Cottage")
→ "He lives at Baldy Cottage" = MATCH (using it as an address)

- If a banned word is a PLACE NAME (e.g., "Bembridge", "Leeds"), consider the context:
→ "I visited Bembridge" = MATCH (mentioning the specific town by exact name)
→ "Bembridge is nice" = MATCH (discussing the specific place by exact name)
→ BUT: "Bembridge" in "Bhem Baridge" is probably a bypass attempt = YOU MUST use judgment


- If a banned word is a FULL NAME (e.g., "Matthew Adams"), only match the complete name:
→ "Matthew Adams" = MATCH
→ "Math Yew Adams" = MATCH (phonetic bypass)
→ "Matthew" alone = NO MATCH (generic first name, unless it's "Matt"/"Matthew" which is always allowed alone)
  

ESCALATED SCRUTINY RULE:
- If you find ONE banned word match, become MORE suspicious of ALL other words in the message
- Check for additional personal information (full names, addresses, phone numbers, etc.)
- Example: "Bembur Ridge? His real name is Alan Adams" with banned ["Bembridge"]
→ "Bembur Ridge" = MATCH (phonetic bypass of "Bembridge")
→ Because doxing detected, "Alan Adams" = MATCH (full name in doxing context - even though that name is not banned)


SPECIAL EXCEPTION - "Matt" NAME RULE:
- "Matt" or "Matthew" appearing ALONE is allowed (it's a common public name)
- BUT if "Matt" or "Matthew" appears with identifying info, flag it:
→ "Matt Adams" = MATCH (surname makes it specific)
→ "Matt from Bembridge" = MATCH (location makes it specific)
→ "Matt" alone = NO MATCH


CONDITIONALLY WHITELISTED TERMS:
- "LWS" alone = NO MATCH (this is a nickname of a regular donator, not a dox attempt for "Lewis")
- BUT "LWS" with doxing context = MATCH (e.g., "LWS's real name is...", "LWS is actually called...", "LWS lives at...")

Be smart about context. DO NOT flag innocent uses of common words just because they appear in a banned address.`;

```

## User Prompt
The user prompt given to the AI in the event that standard phonetic analysis is inconclusive
```
Message: "${message}"
Banned: ${bannedWords.join(', ')}


Return JSON with the ACTUAL TEXT from the message that should be replaced (can be multiple):
{"contains_banned": true/false, "matched_words": ["text1", "text2"], "confidence": 0-100, "reasoning": "why"}


Examples:
- Message: "Bembur Ridge" + Banned: "Bembridge" → {"contains_banned": true, "matched_words": ["Bembur Ridge"], ...}
- Message: "Math Yew lives at Bembur Ridge" + Banned: "Matthew, Bembur Ridge" → {"contains_banned": true, "matched_words": ["Math Yew", "Bembur Ridge"], ...}
- Message: "Support 卐 movement" + Banned: "卐" → {"contains_banned": true, "matched_words": ["卐"], ...}`;
```

---

## Rewind

At the end of the year, I release a "Rewind" page showing donation stats for the year - top donors, most common words, most common videos requested, etc.

The 2025 Rewind was a bit rough because I used to delete donations from the database once they'd been shown on stream. This meant I had to scrape VODs and do a lot of manual reconstruction to get the stats.

I've since changed this - donations now get moved to a history table instead of being deleted, and various counters track things throughout the year. You'll see queries like this scattered around the codebase:

```js
db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindTTSPreviewCount'`).catch(() => {});
```

These increment counters for Rewind 2026 stats - things like how many times people used the TTS preview, how many donations included media, etc. The `.catch(() => {})` is intentional - if it fails, it fails silently. It's just stats collection, not critical functionality.

---

## Project Structure

```
├── server.js            # Main entry point, Express app, WebSocket server
├── lib/
│   ├── database.js      # MariaDB connection pool and helpers
│   ├── auth.js          # Session & authentication middleware
│   ├── cors.js          # CORS wrapper for route handlers
│   ├── ai-filter.js     # AI-powered content moderation
│   ├── stripe.js        # Stripe utilities
│   ├── paypal.js        # PayPal utilities
│   └── ...
├── pages/               # API route handlers (auto-loaded)
│   ├── admin/
│   ├── donations/
│   ├── media/
│   ├── stripe/
│   ├── paypal/
│   ├── twitch/
│   └── ...
└── public/              # Static assets
```
>This directory tree was generated using https://tree.nathanfriend.com/

---

## Resilience & State Management (Why This SHITS ALL OVER StreamElements)

With StreamElements, Callum had to leave his PC on overnight to prevent donations going missing. If the browser crashed or the PC restarted, queued donations would vanish into the void. lol.

This system takes a fundamentally different approach: **the server is the source of truth, not the overlay**.

### How It Works

- Donations and media requests are stored server-side with their full state (queued, processing, completed)
- The overlay fetches the current queue from the API and reports back when items are played
- If the overlay crashes, refreshes, or the PC restarts - **nothing is lost**. The queue persists on the server and the overlay picks up where it left off

### Desync Protection

The API actively prevents race conditions and overlay desync issues:

```js
if (currentlyPlaying === 'true' && currentDonationId !== 'null' && currentDonationId !== donationId.toString()) {
  console.warn(`Attempt to start processing donation ${donationId} while donation ${currentDonationId} is already being processed. Potential overlay desync.`);
  return res.status(400).json({ 
    error: 'Another donation is currently being processed',
    currentDonationId: parseInt(currentDonationId)
  });
}
```

If the overlay tries to start a new donation while one is already marked as playing, the API rejects it and returns the ID of what's actually in progress. This prevents the overlay from getting out of sync with reality.

### ID Mismatch Detection

```js
if (currentDonationId !== donationId.toString()) {
  console.warn(`Donation ID mismatch on complete. Overlay Desync detected: expected ${currentDonationId}, got ${donationId}`);
  return res.status(400).json({ error: 'Donation ID mismatch. You attempted to mark a donation that is not currently playing as completed' });
}
```

When the overlay reports a donation as complete, the API checks it matches what's actually supposed to be playing. If there's a mismatch (e.g. from a stale browser tab), it's rejected rather than corrupting the queue state.

### Recovery Mechanism

Sometimes things go wrong. Maybe a network hiccup (crapstarlink) caused the overlay to miss a completion callback, leaving the system thinking something is still playing. There's a recovery endpoint for exactly this:

```js
if (mediaId === 'recovery') {
  console.log('[recovery] Clearing stuck media processing state');
  await db.setSetting('currentlyPlayingMedia', 'false');
  await db.setSetting('currentMediaId', 'null');
  await db.setSetting('mediaStartTime', 'null');
  
  if (global.broadcastToClients) {
    global.broadcastToClients({
      type: 'media-processing-recovered',
      timestamp: new Date().toISOString(),
    });
  }
  
  return res.status(200).json({ success: true, message: 'Media processing state cleared (recovery)' });
}
```

This clears any stuck processing state and broadcasts to the overlay that recovery has occurred. The queue can then continue normally without manual database intervention.

### The Result

Callum can close OBS, restart his PC, go to bed - whatever. The donations are safe on the server. When he comes back, the overlay reconnects and everything is exactly where he left it. No more overnight PC sessions, no more lost donos.

---

## Route Loading

Routes are dynamically loaded from the `pages/` directory. File structure maps directly to endpoints:

- `pages/donations/queue.js` → `GET/POST /donations/queue`
- `pages/stripe/create-order.js` → `POST /stripe/create-order`

---

## WebSocket
The server maintains WebSocket connections for real-time updates to the stream overlay. Events include:
-  `donation-queue-updated` - New donation received
-  `media-queue-updated` - New media request added
- Various overlay control events

---

## Environment Variables
The server requires various environment variables for database connections, payment provider credentials, and API keys. These are obviously not included in this repository.

---

## Security
This API is designed with a defence-in-depth approach, but more importantly - there's nothing worth stealing.

### Authentication
**Session-based auth** for admin endpoints:
- HTTP-only cookies with `secure` and `sameSite: strict` flags
- 24-hour session expiry
- Sessions stored server-side in MariaDB

**Referer/Origin validation** for sensitive endpoints:
- Admin and overlay endpoints check the `Referer` header against allowlisted origins
- These origins use obscured subdomains (random strings) that aren't publicly discoverable
- Example: `https://[random-string].admin.callumscorner.com/`

### Password Hashing
All passwords for the Admin users (currently me, Callum and Quagmire) are hashed using bcrypt. All Admins are also told to use a password they would never use anywhere else

### Network Isolation
In production, internal services communicate over private Docker bridge networks:
- The admin panel, overlay, and API containers can talk to each other
- Only the reverse proxy is exposed to the public internet
- Internal endpoints aren't routable from outside the Docker network

### Data Minimisation
The database stores the absolute minimum required:
- Donation names, amounts, messages (all public info shown on stream anyway)
- No email addresses, no payment details, no personal information
- Payment processing is handled entirely by Stripe/PayPal - I never see card numbers or payment details
- Payer IDs are stored only for ban enforcement, not linked to any personal data

The API doesn't have access to sensitive data because it doesn't need it. Stripe and PayPal handle all the financial stuff, and I deliberately don't request permissions to access customer details from either platform.

---

## Notes
This codebase has evolved organically over time. You may find:
- Unused database functions in `lib/database.js`
- A disabled endpoint (`pages/vod/vote.js`) - a demo endpoint used for Ayup.CC v2
- Some commented debug code
- Inconsistent error handling patterns in older routes
- References to Payer ID. This was used for PayPal, and there is no Payer ID for Stripe, as that would involve requesting more access to user data. 
- References to a Kick API. Kick Chat is not as easy to use for developers so Kick chat took slightly longer to implement into the overlay. I eventually reverse engineered how the Kick website connects to chat, and now the overlay will open a websocket connection to the Kick WebSocket server, and subscribe to the Chatroom.

```
Websocket object connects to wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679
```

```js
ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: {
            auth: '',
            channel: `chatrooms.${kickChatroomId}.v2`
          }
        }));
```

The API server works perfectly fine, but it's not pristine. PRs welcome if you fancy tidying something up - I'll probably offer free donos for anything half decent. NO OBVIOUS AI SLOP CRAP PR'S THOUGH. Any vulnerabilities found will also be well rewarded.

---

**This repo may not be 100% up to date.** It's here for transparency so people can see how the donation system works, not as an actively maintained open-source project. The production server might be a few commits ahead.

---

## Don't Trust Me

Seriously - don't just take my word that everything here is above board! If you find anything suspicious, if something doesn't add up, or if you think I'm being dodgy about something: **call it out publicly**.

Post on [/r/TheCorner](https://reddit.com/r/TheCorner), mention it in the Discord, whatever. I'd rather you do it publicly than privately, because if someone accuses me of something I want the chance to respond openly. I'm not up to anything malicious, and the best way to prove that is to give you the chance to call me out, and for me to respond with evidence.

---

## Running Locally

```bash

docker compose up --build -d api

```

The Dockerfile should set everything up and install all the modules to run the express server. The API will also automatically provision and secure the MariaDB server if it is active in the same donationNetwork docker bridge network, and the credentials for that database server are set up correctly in the Environment Variables. Requires a MariaDB instance and appropriate environment configuration. This repo is not designed for local use however, and is purely so people can have a lewk around at how the system functions. I will not provide support for self-hosting this

---

## License
Check the `LICENSE` file
