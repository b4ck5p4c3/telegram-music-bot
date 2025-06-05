import {Telegraf} from "telegraf";
import dotenv from "dotenv";
import {AVInput, AVMedia, AVStatus, AVStatusMessage} from "./types";
import {it} from "node:test";
import {LRUCache} from "lru-cache";

dotenv.config({
    path: ".env.local"
});
dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "1337008:B4CKSP4CEB4CKSP4CEB4CKSP4CEB4CKSP4C";
const TELEGRAM_API_ROOT = process.env.TELEGRAM_API_ROOT ?? "";
const TELEGRAM_WEBHOOK_PORT = parseInt(process.env.TELEGRAM_WEBHOOK_PORT ?? "8080")
const TELEGRAM_WEBHOOK_DOMAIN = process.env.TELEGRAM_WEBHOOK_DOMAIN ?? "";
const YNCA_SERVICE_URL = process.env.YNCA_SERVICE_URL ?? "";
const SWYNCA_URL = process.env.SWYNCA_URL ?? "https://swynca.bksp.in";
const SWYNCA_API_KEY = process.env.SWYNCA_API_KEY ?? "";

const bot = new Telegraf(TELEGRAM_BOT_TOKEN, TELEGRAM_API_ROOT ? {
    telegram: {
        apiRoot: TELEGRAM_API_ROOT
    }
} : {});

async function getNowPlaying(): Promise<AVStatusMessage> {
    return await (await fetch(`${YNCA_SERVICE_URL}/now-playing`)).json();
}

type MembersResponse = {
    id: string;
    username: string;
    telegramMetadata?: {
        telegramId: string,
        telegramName?: string
    }
}[];

async function getMembers(): Promise<MembersResponse> {
    return await (await fetch(`${SWYNCA_URL}/api/members`, {
        headers: {
            authorization: `Bearer ${SWYNCA_API_KEY}`
        }
    })).json();
}

interface ITunesResponse {
    results: {
        trackViewUrl: string
    }[];
}

async function findTrackOnITunes(track: string): Promise<string | undefined> {
    const queryParams = new URLSearchParams();
    queryParams.set("term", track);
    queryParams.set("country", "RU");
    queryParams.set("entity", "song");
    const response = await (await fetch(`https://itunes.apple.com/search?${queryParams}`, {
        headers: {
            referer: "https://odesli.co/" // sorry :(
        }
    })).json() as ITunesResponse;

    if (response.results.length === 0) {
        return undefined;
    }
    if (!response.results[0].trackViewUrl) {
        return undefined;
    }
    return response.results[0].trackViewUrl;
}

const trackNotFound: unique symbol = Symbol("track-not-found");

const cache = new LRUCache<string, string | typeof trackNotFound>({
    max: 1000
});

interface SongLinkResponse {
    pageUrl: string;
}

async function findSongLinkTrack(track: string): Promise<string | typeof trackNotFound> {
    const cacheHit = cache.get(track);
    if (cacheHit) {
        return cacheHit;
    }
    const itunesLink = await findTrackOnITunes(track);
    if (!itunesLink) {
        cache.set(track, trackNotFound);
        return trackNotFound;
    }
    const songLinkResponse = await (await fetch(
        `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(itunesLink)}`)).json() as SongLinkResponse;
    if (!songLinkResponse.pageUrl) {
        cache.set(track, trackNotFound);
        return trackNotFound;
    }
    cache.set(track, songLinkResponse.pageUrl);
    return songLinkResponse.pageUrl;
}

bot.command("music", async (ctx) => {
    // const members = await getMembers();
    //
    // const telegramUserId = ctx.message.chat.id;
    // if (!members.find(member => parseInt(member.telegramMetadata?.telegramId ?? "0")
    //     === telegramUserId)) {
    //     return;
    // }

    const nowPlaying = await getNowPlaying();

    let message = "";

    switch (nowPlaying.input) {
        case AVInput.Bluetooth:
            message += "🟦";
            break;
        case AVInput.AirPlay:
            message += "🍏";
            break;
        case AVInput.Spotify:
            message += "🟢";
            break;
        case AVInput.Other:
            message += "🎵";
            break;
    }

    switch (nowPlaying.status) {
        case AVStatus.Playing:
            message += "▶️";
            break;
        case AVStatus.Pause:
            message += "⏸️";
            break;
        case AVStatus.Standby:
            message += "⏹️";
            break;
    }

    message += "\n";

    message += `\`${nowPlaying.media.artist || "N/A"} - ${nowPlaying.media.title || "N/A"}\``;

    const sentMessage = await ctx.sendMessage(message + "\nSearching track\\.\\.\\.", {
        parse_mode: "MarkdownV2",
        link_preview_options: {
            is_disabled: true
        }
    });

    message += "\n";

    try {
        const trackLink = await findSongLinkTrack(`${nowPlaying.media.artist} - ${nowPlaying.media.title}`);
        if (trackLink === trackNotFound) {
            message += "Sorry, but track not found :(";
        } else {
            message += `[SongLink](${trackLink})`;
        }
    } catch (e) {
        message += `Failed to find track: \`${e}\``;
    }

    await ctx.telegram.editMessageText(sentMessage.chat.id, sentMessage.message_id, undefined, message, {
        parse_mode: "MarkdownV2",
        link_preview_options: {
            is_disabled: true
        }
    });
});

bot.launch(TELEGRAM_WEBHOOK_DOMAIN ? {
    webhook: {
        domain: TELEGRAM_WEBHOOK_DOMAIN,
        port: TELEGRAM_WEBHOOK_PORT,
        path: "/"
    }
} : {}).catch(e => {
    console.error(e);
});

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
