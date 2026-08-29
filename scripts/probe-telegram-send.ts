/**
 * Print exactly what Telegram says when the old bot tries to SEND.
 *
 * WHY THIS EXISTS
 * diagnose-telegram-reach.ts showed 35 of 36 chats are alive (getChat returns
 * OK), yet the broadcast could not deliver a single message. Reads working while
 * writes fail is a specific condition, and broadcast-bot-migration.ts discarded
 * the evidence: it bucketed every failure as "unreachable" without recording
 * Telegram's wording.
 *
 * This sends ONE real message to ONE chat id you choose and dumps the raw HTTP
 * status and JSON body. That single response identifies the cause:
 *
 *   "bot was blocked by the user"       - that one customer blocked it.
 *   "Forbidden: bot is ... restricted"  - the bot is restricted account-wide,
 *                                         probably from the owner deletion.
 *   "Too Many Requests"                 - anti-spam throttle; it will pass.
 *   ok: true                            - sending works, and the broadcast's
 *                                         classification was at fault.
 *
 * THIS SENDS A REAL MESSAGE. Point it at your own Telegram id first.
 *
 *   npx tsx --env-file=.env scripts/probe-telegram-send.ts --chat=884xxxxxxx
 *
 * Flags:
 *   --chat=<id>     Telegram id to message. Required.
 *   --token=<tok>   Bot to send from. Defaults to TELEGRAM_BOT_2_TOKEN (old bot).
 *   --text=<msg>    Override the default test message.
 */

const clean = (v: string | undefined) => (v || "").trim().replace(/^["']|["']$/g, "");

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function call(token: string, method: string, payload?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function main() {
  const token = clean(arg("token") || process.env.TELEGRAM_BOT_2_TOKEN);
  const chat = clean(arg("chat"));
  const text = arg("text") || "Test message - please ignore.";

  if (!token) {
    console.error("No token. Set TELEGRAM_BOT_2_TOKEN or pass --token=<token>.");
    process.exit(1);
  }
  if (!chat) {
    console.error("No target. Pass --chat=<telegram id>. Use your own id first.");
    process.exit(1);
  }

  const me = await call(token, "getMe");
  console.log(`\n--- getMe ---`);
  console.log(JSON.stringify(me, null, 2));

  const chatInfo = await call(token, "getChat", { chat_id: chat });
  console.log(`\n--- getChat (${chat}) ---`);
  console.log(JSON.stringify(chatInfo, null, 2));

  console.log(`\n--- sendMessage (${chat}) --- THIS SENDS A REAL MESSAGE`);
  const sent = await call(token, "sendMessage", { chat_id: chat, text });
  console.log(JSON.stringify(sent, null, 2));

  console.log(`\n--- verdict ---`);
  const body = sent.body as any;
  if (body?.ok) {
    console.log(`Sending WORKS. The broadcast's failure classification was wrong,`);
    console.log(`not the bot. Re-run the broadcast with --reset to try again.`);
  } else {
    console.log(`HTTP ${sent.status}: ${body?.description || "no description"}`);
    console.log(`\nThat description is the real reason the broadcast delivered nothing.`);
  }
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
