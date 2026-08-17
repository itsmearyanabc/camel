// Relative import on purpose: consistent with the other shared lib modules.
import { prisma } from "./db";

/**
 * Public Telegram links: the customer-support bot and the channel directory.
 *
 * The two are configured in different places on purpose.
 *
 * Channels are edited by an admin in the control panel and live in the Setting
 * table, so publishing one is a form submission rather than an SSH session -
 * and takes effect immediately, with no restart and no deploy.
 *
 * The support bot username stays in the environment because it is deployment
 * wiring rather than content, and it sits next to the bot token that pairs
 * with it. It is deliberately NOT a `NEXT_PUBLIC_*` value: those are inlined
 * into the client bundle at `next build` and frozen, so editing one on the VPS
 * would do nothing until the next rebuild.
 *
 * Nothing in this module reads a bot TOKEN. The support link only needs a
 * username, so no second long-poller is ever created here - Telegram allows
 * exactly one poller per token, and a second one 409s until neither serves
 * customers. The shop bot in src/instrumentation.ts is untouched by any of it.
 */

/** Setting row the admin-managed channel list is stored in. */
export const TELEGRAM_CHANNELS_SETTING_KEY = "TELEGRAM_CHANNELS";

/** Ceilings so one paste cannot make the channels page unusable. */
export const MAX_CHANNELS = 30;
const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 140;

/** Hosts a Telegram link is allowed to point at. */
const TELEGRAM_HOSTS = new Set([
  "t.me",
  "www.t.me",
  "telegram.me",
  "www.telegram.me",
  "telegram.dog",
  "www.telegram.dog",
]);

/** Telegram's own rule for a public username. */
const USERNAME_PATTERN = /^[A-Za-z0-9_]{4,32}$/;

export interface TelegramChannel {
  name: string;
  /** Always an absolute https://t.me/... URL. */
  url: string;
  /** "@name" for a public channel, null for a private +invite link. */
  handle: string | null;
  description: string | null;
}

function readEnv(key: string): string {
  // Values pasted into a .env on a server routinely arrive wrapped in quotes.
  return (process.env[key] || "").trim().replace(/^["']|["']$/g, "").trim();
}

/**
 * Normalise anything that identifies a Telegram account into a bare username.
 *
 * Accepts "name", "@name", "t.me/name" and "https://t.me/name" because all four
 * are what someone actually pastes out of Telegram. Returns null for anything
 * that is not a valid username, so a typo hides the link instead of rendering
 * one that dead-ends.
 */
export function normaliseTelegramUsername(raw: string | undefined | null): string | null {
  let value = (raw || "").trim().replace(/^["']|["']$/g, "").trim();
  if (!value) return null;

  value = value.replace(/^https?:\/\//i, "").replace(/^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, "");
  value = value.replace(/^@/, "").split(/[/?#]/)[0].trim();

  return USERNAME_PATTERN.test(value) ? value : null;
}

/**
 * Turn one channel reference into an absolute, safe Telegram URL.
 *
 * Only https Telegram hosts are accepted - the value comes from a file edited
 * by hand on the server, and a stray `javascript:` would otherwise be rendered
 * straight into an href.
 */
function toChannelUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") return null;
      if (!TELEGRAM_HOSTS.has(parsed.hostname.toLowerCase())) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // Bare "t.me/x", "@x", "x" or a private "+invite" code.
  const stripped = value
    .replace(/^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, "")
    .replace(/^@/, "")
    .trim();
  if (!stripped) return null;

  if (stripped.startsWith("+")) {
    // Private invite: the code after "+" is opaque, so only reject whitespace.
    return /^\+[A-Za-z0-9_-]+$/.test(stripped) ? `https://t.me/${stripped}` : null;
  }

  return USERNAME_PATTERN.test(stripped) ? `https://t.me/${stripped}` : null;
}

/** "@name" for a public channel; null for a private +invite link. */
function handleFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/^\//, "").split("/")[0];
    if (!path || path.startsWith("+")) return null;
    return USERNAME_PATTERN.test(path) ? `@${path}` : null;
  } catch {
    return null;
  }
}

/**
 * Validate and normalise one channel into its stored/rendered shape.
 *
 * Returns null for anything that is not a usable Telegram link, which is what
 * lets both the admin form and the stored-value parser reject bad rows through
 * exactly the same rules.
 */
export function buildChannel(
  name: string,
  urlish: string,
  description: string
): TelegramChannel | null {
  const url = toChannelUrl(urlish);
  if (!url) return null;

  const handle = handleFromUrl(url);
  const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

  return {
    // A missing name falls back to the handle so a card is never blank.
    name: trimmedName || handle || "Telegram channel",
    url,
    handle,
    description: description.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null,
  };
}

/**
 * Parse the TELEGRAM_CHANNELS environment variable.
 *
 * Two formats are accepted, because this is edited by hand in a .env on a
 * server and JSON quoting there is easy to get wrong:
 *
 *   JSON:   [{"name":"Drops","url":"https://t.me/x","description":"..."}]
 *   Simple: Drops | https://t.me/x | Restock alerts
 *           Reviews | @camel_reviews
 *
 * Simple-format entries are separated by newlines or semicolons. Malformed
 * entries are skipped rather than throwing - one bad line must not take the
 * whole channels page down.
 */
export function parseTelegramChannels(raw: string | undefined | null): TelegramChannel[] {
  const value = (raw || "").trim();
  if (!value) return [];

  const out: TelegramChannel[] = [];

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entry || typeof entry !== "object") continue;
          const channel = buildChannel(
            typeof entry.name === "string" ? entry.name : "",
            typeof entry.url === "string" ? entry.url : typeof entry.handle === "string" ? entry.handle : "",
            typeof entry.description === "string" ? entry.description : ""
          );
          if (channel) out.push(channel);
        }
        return dedupe(out);
      }
    } catch {
      // Fall through to the simple format - a JSON typo should not mean "no
      // channels at all" if the value happens to still be readable line by line.
    }
  }

  for (const line of value.split(/[\n;]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name = "", urlish = "", description = ""] = trimmed.split("|").map((p) => p.trim());
    // A single-field line is just a link, with no name in front of it.
    const channel = urlish ? buildChannel(name, urlish, description) : buildChannel("", name, "");
    if (channel) out.push(channel);
  }

  return dedupe(out);
}

/** Same channel listed twice renders as two identical cards, so collapse them. */
function dedupe(channels: TelegramChannel[]): TelegramChannel[] {
  const seen = new Set<string>();
  return channels.filter((c) => {
    const key = c.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Serialise a validated list for the Setting row. */
export function serialiseChannels(channels: TelegramChannel[]): string {
  return JSON.stringify(
    channels.map((c) => ({ name: c.name, url: c.url, description: c.description ?? "" }))
  );
}

/**
 * The channel list an admin has published, from the Setting table.
 *
 * Re-validated on read rather than trusted: the row can also be edited straight
 * in the database, and the storefront must never render an href that did not
 * come back through toChannelUrl.
 *
 * Never throws - a settings read that fails must not take the dashboard down,
 * so it degrades to "no channels", which simply hides the strip.
 */
export async function getTelegramChannels(): Promise<TelegramChannel[]> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: TELEGRAM_CHANNELS_SETTING_KEY },
    });
    return parseTelegramChannels(row?.value).slice(0, MAX_CHANNELS);
  } catch (err) {
    console.error("getTelegramChannels error:", err);
    return [];
  }
}

export interface TelegramLinksConfig {
  /** Bare username of the customer-support bot, or null when not configured. */
  supportBotUsername: string | null;
  channels: TelegramChannel[];
}

/** The public Telegram links this deployment currently offers. */
export async function getTelegramLinksConfig(): Promise<TelegramLinksConfig> {
  return {
    supportBotUsername: normaliseTelegramUsername(readEnv("TELEGRAM_SUPPORT_BOT_USERNAME")),
    channels: await getTelegramChannels(),
  };
}
