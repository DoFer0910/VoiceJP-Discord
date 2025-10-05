/// <reference types="node" />

import { EndBehaviorType, VoiceConnection } from "@discordjs/voice";
import type { BaseGuildTextChannel, GuildMember, Webhook } from "discord.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import prism from "prism-media";
import shell from "shelljs";
import { nodewhisper } from "nodejs-whisper";

interface WhisperRecognitionOptions {
    connection: VoiceConnection;
    guildId: string;
    member: GuildMember;
    channel: BaseGuildTextChannel;
    onLog?: (message: string, ...optionalParams: unknown[]) => void;
}

export interface WhisperRecognitionSession {
    member: GuildMember;
    webhook: Webhook;
    dispose: () => Promise<void>;
}

const TEMP_DIR = path.join(__dirname, "..", "temp", "whisper");
const MINIMUM_PCM_LENGTH = 96_000; // 約0.5秒分 (48000Hz * 2byte)
const MAX_MESSAGE_LENGTH = 1_000;

const whisperModel = process.env.WHISPER_MODEL ?? "large-v3-turbo";
const whisperLanguage = process.env.WHISPER_LANGUAGE ?? "ja";
const whisperWithCuda = process.env.WHISPER_WITH_CUDA === "true";

function ensureTempDir(guildId: string, memberId: string): string {
    const dir = path.join(TEMP_DIR, guildId, memberId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function writePcmFile(buffer: Buffer, dir: string): Promise<{ pcmPath: string; wavPath: string }> {
    const uuid = crypto.randomUUID();
    const pcmPath = path.join(dir, `${uuid}.pcm`);
    const wavPath = path.join(dir, `${uuid}.wav`);
    await fs.promises.writeFile(pcmPath, buffer);

    const command = `ffmpeg -y -f s16le -ar 48000 -ac 1 -i "${pcmPath}" "${wavPath}"`;
    const result = shell.exec(command, { silent: true });
    if (result.code !== 0) {
        throw new Error(`Failed to convert PCM to WAV: ${result.stderr}`);
    }

    return { pcmPath, wavPath };
}

function cleanupFiles(...filePaths: string[]): void {
    for (const filePath of filePaths) {
        void fs.promises.unlink(filePath).catch(() => undefined);
    }
}

function normalizeTranscription(text: string): string | null {
    const cleaned = text.replace(/(?=\[).*?(?<=\])\s\s/g, "").replace(/\s+/g, " ").trim();
    if (cleaned.length < 2) return null;
    if (cleaned.length > MAX_MESSAGE_LENGTH) {
        return `${cleaned.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
    }
    return cleaned;
}

async function transcribe(wavPath: string): Promise<string | null> {
    try {
        const result = await nodewhisper(wavPath, {
            modelName: whisperModel,
            autoDownloadModelName: whisperModel,
            withCuda: whisperWithCuda,
            removeWavFileAfterTranscription: false,
            logger: console,
            whisperOptions: {
                language: whisperLanguage,
                translateToEnglish: false,
                wordTimestamps: false,
            },
        } as unknown as Parameters<typeof nodewhisper>[1]);
        return typeof result === "string" ? normalizeTranscription(result) : null;
    } catch (error) {
        console.error("[whisper] Transcription failed", error);
        return null;
    }
}

export async function createWhisperRecognitionSession({ connection, guildId, member, channel, onLog }: WhisperRecognitionOptions): Promise<WhisperRecognitionSession> {
    const log = onLog ?? console.log;
    const webhook = await channel.createWebhook({
        name: `${member.displayName}[VoiceJP]`,
        avatar: member.user.displayAvatarURL({ extension: "png", size: 1024, forceStatic: false }),
        reason: "VoiceJP Whisper Recognition",
    });

    const tempDir = ensureTempDir(guildId, member.id);
    let disposed = false;
    let currentProcessing: Promise<void> = Promise.resolve();
    let activeDecoder: prism.opus.Decoder | undefined;
    let activeOpus: ReturnType<VoiceConnection["receiver"]["subscribe"]> | undefined;

    const processBuffer = async (buffer: Buffer): Promise<void> => {
        if (buffer.length < MINIMUM_PCM_LENGTH) return;
        const { pcmPath, wavPath } = await writePcmFile(buffer, tempDir);
        const transcription = await transcribe(wavPath);
        cleanupFiles(pcmPath, wavPath);
        if (!transcription) return;
        await webhook.send(transcription);
    };

    const subscribe = () => {
        if (disposed) return;
        const opusStream = connection.receiver.subscribe(member.id, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000,
            },
        });
        const decoder = new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 });
        activeDecoder = decoder;
        activeOpus = opusStream;

        const chunks: Buffer[] = [];
        decoder.on("data", (data: Buffer) => {
            chunks.push(Buffer.from(data));
        });

        const finalize = () => {
            decoder.removeAllListeners();
            opusStream.removeAllListeners();
            const buffer = Buffer.concat(chunks);
            currentProcessing = (async () => {
                try {
                    if (!disposed) await processBuffer(buffer);
                } catch (error) {
                    console.error("[whisper] Failed to process buffer", error);
                } finally {
                    if (!disposed) subscribe();
                }
            })();
        };

        opusStream.once("end", finalize);
        opusStream.once("close", finalize);
        opusStream.once("error", (error: unknown) => {
            console.error("[whisper] Opus stream error", error);
            finalize();
        });

        opusStream.pipe(decoder);
        log(`[whisper] Subscribed to ${member.displayName}`);
    };

    subscribe();

    return {
        member,
        webhook,
        dispose: async () => {
            disposed = true;
            activeDecoder?.destroy();
            activeOpus?.destroy();
            await currentProcessing.catch(() => undefined);
            await webhook.delete().catch(() => undefined);
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
            log(`[whisper] Disposed session for ${member.displayName}`);
        },
    };
}
