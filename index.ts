/* VoiceJP Main Script */

import "./includes/folder_manager";
import "./includes/web";

import {
    ActionRowBuilder, ActivityType, BaseGuildTextChannel, ButtonBuilder, ButtonStyle, ChannelType,
    ChatInputCommandInteraction, Client, Collection, Colors, EmbedBuilder, GuildMember,
    IntentsBitField, Message, PermissionFlagsBits, REST, Routes, SlashCommandBuilder,
    SlashCommandChannelOption, SlashCommandStringOption, SlashCommandSubcommandBuilder, VoiceState,
    Webhook
} from "discord.js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import * as prism from "prism-media";
import * as vosk from "vosk";

import {
    createAudioPlayer, createAudioResource, EndBehaviorType, joinVoiceChannel, StreamType,
    VoiceConnectionStatus
} from "@discordjs/voice";

import nrCheck from "./includes/blocked_user_check";
import generateVoice from "./includes/speech";
import { createWhisperRecognitionSession } from "./includes/whisper_recognition";
import FillSilenceStream from "./models/fill_silence_stream";

dotenv.config();

const voiceModels = JSON.parse(fs.readFileSync(path.join(__dirname, "voice_models/models.json"), "utf-8"));
const voskModel = new vosk.Model(path.join(__dirname, "vosk_models", process.env.VOSK_MODEL as string));
const token = process.env.TOKEN as string;
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildVoiceStates,
        IntentsBitField.Flags.MessageContent
    ]
});
const restClient = new REST({ version: "10" }).setToken(token);

const helpPages = [
    () => {
        return new EmbedBuilder()
            .setTitle("使い方")
            .setDescription("VoiceJPをお使いいただきありがとうございます。\nVoiceJPでは、日本語で音声読み上げと文字起こしができます。\n\n詳しい使用方法は、次のページをご覧ください。")
            .setColor(Colors.LuminousVividPink)
            .setFooter({
                "text": "VoiceJP 使い方 1/5"
            });
    },
    async () => {
        return new EmbedBuilder()
            .setTitle("使い方 - コマンド")
            .setDescription("VoiceJPには、シンプルで簡単なコマンドが4つあります。\nこのページでは、VoiceJPをボイスチャットに入れる方法について説明します。")
            .setColor(Colors.LuminousVividPink)
            .setFields(
                {
                    "name": `</join:${(await client.application?.commands.fetch())?.find((command) => command.name === "join")?.id}>`,
                    "value": "このコマンドを使用して、VoiceJPをボイスチャットに入れることができます。"
                },
                {
                    "name": `</leave:${(await client.application?.commands.fetch())?.find((command) => command.name === "leave")?.id}>`,
                    "value": "このコマンドを使用して、VoiceJPをボイスチャットから出すことができます。"
                })
            .setFooter({
                "text": "VoiceJP 使い方 2/5"
            });
    },
    async () => {
        return new EmbedBuilder()
            .setTitle("使い方 - 音声読み上げ")
            .setDescription("VoiceJPでは、聞き専のための読み上げを行うことができます。\nこのページでは、音声読み上げについて説明します。")
            .setColor(Colors.LuminousVividPink)
            .setFields(
                {
                    "name": `</speech synthesis:${(await client.application?.commands.fetch())?.find((command) => command.name === "speech")?.id}>`,
                    "value": "このコマンドを使用して、音声読み上げを設定することができます。\nもう一度実行すると、音声読み上げを解除します。"
                },
                {
                    "name": `</speech synthesis:${(await client.application?.commands.fetch())?.find((command) => command.name === "speech")?.id}> voice-id:`,
                    "value": "音声IDを設定します。"
                },
                {
                    "name": `</speech synthesis:${(await client.application?.commands.fetch())?.find((command) => command.name === "speech")?.id}> speed:`,
                    "value": "速度を設定します。\nデフォルトでは、1.25が設定されています。"
                },
                {
                    "name": `</speech synthesis:${(await client.application?.commands.fetch())?.find((command) => command.name === "speech")?.id}> tone:`,
                    "value": "音程を設定します。この設定では、声の高さが変わります。\nデフォルトでは、1が設定されています。"
                },
                {
                    "name": `</speech synthesis:${(await client.application?.commands.fetch())?.find((command) => command.name === "speech")?.id}> intonation:`,
                    "value": "抑揚を設定します。この設定では、声の抑揚が変わります。\nデフォルトでは、1が設定されています。"
                },
                {
                    "name": `</speech synthesis:${(await client.application?.commands.fetch())?.find((command) => command.name === "speech")?.id}> volume:`,
                    "value": "音量を設定します。\nデフォルトでは、0dBが設定されています。"
                })
            .setFooter({
                "text": "VoiceJP 使い方 3/5"
            });
    },
    async () => {
        return new EmbedBuilder()
            .setTitle("使い方 - 音声認識")
            .setDescription("VoiceJPでは、音声認識を行うことができます。\nこのページでは、音声認識について説明します。")
            .setColor(Colors.LuminousVividPink)
            .setFields(
                {
                    "name": `</speech recognition:${(await client.application?.commands.fetch())?.find((command) => command.name === "speech")?.id}>`,
                    "value": "このコマンドを使用して、音声認識を開始することができます。\nこのコマンドを実行すると、その実行したチャンネルで各メンバーのWebhookが作成されます。\nもう一度実行すると、音声認識を解除します。"
                })
            .setFooter({
                "text": "VoiceJP 使い方 4/5"
            });
    },
    () => {
        return new EmbedBuilder()
            .setTitle("使い方 - おわり")
            .setDescription("VoiceJPの使い方は以上です。\n何かご不明な点がございましたら、[開発者Discordサーバー](https://discord.gg/VSHknmX7C4)または[ホームページ](https://renorari.net/contact.html)よりお問い合わせください。\n\n利用規約とプライバシポリシは以下のリンクより、ご覧ください。\n[利用規約 - VoiceJP公式ウェブサイト](https://voicejp.renorari.net/terms.html)\n[プライバシポリシ - renorari.net](https://renorari.net/privacy.html)")
            .setColor(Colors.LuminousVividPink)
            .setFooter({
                "text": "VoiceJP 使い方 5/5"
            });
    }
];
const soundEffects = {
    "join": () => {
        return createAudioResource(path.join(__dirname, "sound_effects", "join.wav"), { inputType: StreamType.Arbitrary });
    },
    "enable": () => {
        return createAudioResource(path.join(__dirname, "sound_effects", "enable.wav"), { inputType: StreamType.Arbitrary });
    },
    "disable": () => {
        return createAudioResource(path.join(__dirname, "sound_effects", "disable.wav"), { inputType: StreamType.Arbitrary });
    },
    "error": () => {
        return createAudioResource(path.join(__dirname, "sound_effects", "error.wav"), { inputType: StreamType.Arbitrary });
    }
};
const voiceChannels = new Map();

type RecognitionEngine = "vosk" | "whisper";

interface RecognitionSession {
    member: GuildMember;
    webhook: Webhook;
    dispose: () => Promise<void>;
}

function setActivity() {
    client.user?.setActivity({
        "name": `/help | ${client.guilds.cache.size}servers | joining ${voiceChannels.size}channels | ${client.ws.ping}ms`,
        "type": ActivityType.Custom
    });
}

client.on("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    try {
        await restClient.put(Routes.applicationCommands(client.application?.id as string), {
            body: [
                new SlashCommandBuilder()
                    .setName("ping")
                    .setDescription("Replies with Pong!")
                    .setDescriptionLocalization("ja", "Pong! と返信します。"),
                new SlashCommandBuilder()
                    .setName("help")
                    .setDescription("Shows help.")
                    .setDescriptionLocalization("ja", "ヘルプを表示します。"),
                new SlashCommandBuilder()
                    .setName("join")
                    .setDescription("Joins the voice channel.")
                    .setDescriptionLocalization("ja", "ボイスチャンネルに参加します。")
                    .addChannelOption(
                        new SlashCommandChannelOption()
                            .setName("channel")
                            .setDescription("The channel to join.")
                            .setDescriptionLocalization("ja", "参加するチャンネル。")
                            .addChannelTypes(ChannelType.GuildVoice)
                            .setRequired(true)
                    )
                    .setDMPermission(false)
                    .setDefaultMemberPermissions(PermissionFlagsBits.Connect),
                new SlashCommandBuilder()
                    .setName("leave")
                    .setDescription("Leaves the voice channel.")
                    .setDescriptionLocalization("ja", "ボイスチャンネルから退出します。")
                    .setDMPermission(false)
                    .setDefaultMemberPermissions(PermissionFlagsBits.Connect),
                new SlashCommandBuilder()
                    .setName("speech")
                    .setDescription("set speech functions.")
                    .setDescriptionLocalization("ja", "音声機能を設定します。")
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("synthesis")
                            .setDescription("set synthesis.")
                            .setDescriptionLocalization("ja", "音声合成を設定します。")
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setName("voice-id")
                                    .setDescription("set voice id.")
                                    .setDescriptionLocalization("ja", "音声IDを設定します。")
                                    .setChoices(...voiceModels.map((voiceModel: { id: string; name: string; }) => ({ value: voiceModel.id, name: voiceModel.name })))
                            )
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setName("speed")
                                    .setDescription("set speed.")
                                    .setDescriptionLocalization("ja", "速度を設定します。")
                            )
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setName("tone")
                                    .setDescription("set tone.")
                                    .setDescriptionLocalization("ja", "音程を設定します。")
                            )
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setName("intonation")
                                    .setDescription("set intonation.")
                                    .setDescriptionLocalization("ja", "抑揚を設定します。")
                            )
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setName("volume")
                                    .setDescription("set volume.")
                                    .setDescriptionLocalization("ja", "音量を設定します。")
                            )
                    )
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("recognition")
                            .setDescription("set recognition.")
                            .setDescriptionLocalization("ja", "音声認識を設定します。")
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setName("engine")
                                    .setDescription("select recognition engine.")
                                    .setDescriptionLocalization("ja", "使用する音声認識エンジンを選択します。")
                                    .setChoices(
                                        { name: "Vosk", value: "vosk" },
                                        { name: "Whisper", value: "whisper" }
                                    )
                            )
                    )
            ]
        });
    } catch (error) {
        console.error(error);
    }

    setActivity();
    setInterval(setActivity, 1000 * 10);
});

async function disableVoice(guildId: string) {
    if (!voiceChannels.has(guildId)) return;
    clearInterval(voiceChannels.get(guildId).checker);
    await disableSpeechRecognition(guildId);
    await disableSpeechSynthesis(guildId);
    voiceChannels.get(guildId).connection.destroy();
    voiceChannels.delete(guildId);
}
async function disableSpeechSynthesis(guildId: string) {
    if (!voiceChannels.has(guildId) || !voiceChannels.get(guildId).synthesis) return;
    voiceChannels.get(guildId).player.play(soundEffects.disable());
    client.off("messageCreate", voiceChannels.get(guildId).synthesis.messageCreate);
    voiceChannels.get(guildId).synthesis = null;
}
async function disableSpeechRecognition(guildId: string) {
    if (!voiceChannels.has(guildId) || !voiceChannels.get(guildId).recognition) return;
    const recognitionState = voiceChannels.get(guildId).recognition;
    await Promise.all(recognitionState.recognizing.map(async (session: RecognitionSession) => {
        try {
            await session.dispose();
        } catch (error) {
            console.error("[recognition] Failed to dispose session", error);
        }
    }));
    client.off("voiceStateUpdate", recognitionState.onVoiceStateUpdate);
    voiceChannels.get(guildId).recognition = null;
}

const interactionCommands = new Map<string, (interaction: ChatInputCommandInteraction) => void>();
interactionCommands.set("ping", async (interaction: ChatInputCommandInteraction) => {
    await interaction.reply({
        content: "ポン!",
        embeds: [{
            title: "ポン!",
            description: `レイテンシ: ${client.ws.ping}m秒`,
            color: Colors.LuminousVividPink
        }]
    });
});
interactionCommands.set("help", async (interaction: ChatInputCommandInteraction) => {
    await interaction.reply({
        content: "VoiceJPの使い方を表示します。",
        embeds: [await helpPages[0]()],
        components: [
            new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("help-0")
                        .setLabel("前へ")
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId("help-1")
                        .setLabel("次へ")
                        .setStyle(ButtonStyle.Primary)
                )
        ]
    });
});
interactionCommands.set("join", async (interaction: ChatInputCommandInteraction) => {
    const channel = await interaction.guild?.channels.fetch(interaction.options.get("channel")?.value as string);
    if (!channel) {
        await interaction.reply({
            "content": "エラーが発生しました。",
            "embeds": [{
                "title": "エラー",
                "description": "チャンネルが見つかりません。",
                "color": Colors.Red
            }],
            "ephemeral": true
        });
        return;
    }
    if (channel.type !== ChannelType.GuildVoice) {
        await interaction.reply({
            "content": "エラーが発生しました。",
            "embeds": [{
                "title": "エラー",
                "description": "ボイスチャンネルを指定してください。",
                "color": Colors.Red
            }],
            "ephemeral": true
        });
        return;
    } else if (!channel.joinable) {
        await interaction.reply({
            "content": "エラーが発生しました。",
            "embeds": [{
                "title": "エラー",
                "description": "参加できません。",
                "color": Colors.Red
            }],
            "ephemeral": true
        });
        return;
    }
    await disableVoice(interaction.guildId as string);
    await Promise.all((await channel.fetchWebhooks()).map(async (webhook: Webhook) => {
        if (webhook.name.endsWith("[VoiceJP]")) {
            await webhook.delete();
        }
    }));
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });
    const player = createAudioPlayer();
    connection.subscribe(player);
    voiceChannels.set(interaction.guildId as string, { connection, player, channel, synthesis: null, recognition: null });
    connection.on(VoiceConnectionStatus.Ready, () => {
        player.play(soundEffects.join());
        const checker = setInterval(async () => {
            if ((channel?.members as Collection<string, GuildMember>).size <= 1) {
                clearInterval(checker);
                await disableVoice(interaction.guildId as string);
                interaction.channel?.send({
                    "content": "ボイスチャンネルから退出しました。",
                    "embeds": [{
                        "title": "退出",
                        "description": "ボイスチャンネルから退出しました。",
                        "color": Colors.Yellow
                    }]
                });
            }
        }, 5000);
        voiceChannels.get(interaction.guildId as string).checker = checker;
    });
    await interaction.reply({
        "content": "ボイスチャンネルに参加しました。",
        "embeds": [{
            "title": "参加",
            "description": `${channel.name}に参加しました。`,
            "color": Colors.Green
        }]
    });
});
interactionCommands.set("leave", async (interaction: ChatInputCommandInteraction) => {
    if (!voiceChannels.has(interaction.guildId as string)) {
        await interaction.reply({
            "content": "エラーが発生しました。",
            "embeds": [{
                "title": "エラー",
                "description": "ボイスチャンネルに参加していません。",
                "color": Colors.Red
            }],
            "ephemeral": true
        });
        return;
    }
    await disableVoice(interaction.guildId as string);
    await interaction.reply({
        "content": "ボイスチャンネルから退出しました。",
        "embeds": [{
            "title": "退出",
            "description": "ボイスチャンネルから退出しました。",
            "color": Colors.Green
        }]
    });
});

async function createVoskRecognitionSession(member: GuildMember, guildId: string, channel: BaseGuildTextChannel): Promise<RecognitionSession> {
    const state = voiceChannels.get(guildId);
    if (!state) throw new Error("Voice channel state not found");
    const connection = state.connection;
    const webhook = await channel.createWebhook({
        name: `${member.displayName}[VoiceJP]`,
        avatar: member.user.displayAvatarURL({ "extension": "png", "size": 1024, "forceStatic": false }),
        reason: "VoiceJP Voice Recognition",
    });

    const voice = connection.receiver.subscribe(member.id, {
        end: {
            behavior: EndBehaviorType.Manual,
        },
    }).pipe(new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 }));

    const recognizer = new vosk.Recognizer({
        model: voskModel,
        sampleRate: 48000,
    });
    const filledSilence = new FillSilenceStream();
    voice.pipe(filledSilence);

    const handleData = (data: Buffer) => {
        if (!recognizer.acceptWaveform(data)) return;
        const result = recognizer.result().text.replace(/ /g, "").replace(/。/g, "。\n").trim();
        if (result === "") return;
        const message = result.slice(0, 1000) + (result.length > 1000 ? "…" : "");
        void webhook.send(message).catch((error) => console.error("[vosk] Failed to send transcription", error));
    };

    filledSilence.on("data", handleData);

    return {
        member,
        webhook,
        dispose: async () => {
            filledSilence.off("data", handleData);
            filledSilence.destroy();
            recognizer.free();
            voice.destroy();
            await webhook.delete().catch(() => undefined);
        },
    };
}

async function createRecognitionSession(engine: RecognitionEngine, member: GuildMember, guildId: string, channel: BaseGuildTextChannel): Promise<RecognitionSession> {
    const state = voiceChannels.get(guildId);
    if (!state) throw new Error("Voice channel state not found");

    if (engine === "whisper") {
        return createWhisperRecognitionSession({
            connection: state.connection,
            guildId,
            member,
            channel,
        });
    }

    return createVoskRecognitionSession(member, guildId, channel);
}

async function removeRecognitionMember(guildId: string, memberId?: string) {
    if (!memberId) return;
    const recognitionState = voiceChannels.get(guildId)?.recognition;
    if (!recognitionState) return;
    const sessionIndex = recognitionState.recognizing.findIndex((session: RecognitionSession) => session.member.id === memberId);
    if (sessionIndex === -1) return;
    const [session] = recognitionState.recognizing.splice(sessionIndex, 1);
    await session.dispose();
}

interactionCommands.set("speech", async (interaction: ChatInputCommandInteraction) => {
    if (!voiceChannels.has(interaction.guildId as string)) {
        await interaction.reply({
            "content": "エラーが発生しました。",
            "embeds": [{
                "title": "エラー",
                "description": "ボイスチャンネルに参加していません。",
                "color": Colors.Red
            }],
            "ephemeral": true
        });
        return;
    }
    const subCommand = interaction.options.getSubcommand();
    if (subCommand === "synthesis") {
        if (voiceChannels.get(interaction.guildId as string).synthesis) {
            await disableSpeechSynthesis(interaction.guildId as string);
            if (!interaction.options.get("voice-id")?.value && !interaction.options.get("speed")?.value && !interaction.options.get("tone")?.value && !interaction.options.get("intonation")?.value && !interaction.options.get("volume")?.value) {
                await interaction.reply({
                    "content": "音声合成を解除しました。",
                    "embeds": [{
                        "title": "音声合成",
                        "description": "音声合成を解除しました。",
                        "color": Colors.Green
                    }]
                });
                return;
            }
        }
        const voiceModel = voiceModels.find((voiceModel: { id: string; }) => voiceModel.id === (interaction.options.get("voice-id")?.value ?? voiceModels[0].id));
        if (!voiceModel) {
            await interaction.reply({
                "content": "エラーが発生しました。",
                "embeds": [{
                    "title": "エラー",
                    "description": "音声IDが見つかりません。",
                    "color": Colors.Red
                }],
                "ephemeral": true
            });
            return;
        }
        const onMessageCreate = async (message: Message) => {
            if (nrCheck(message.author.id) || nrCheck(message.guildId as string)) return;
            if (message.author.bot) return;
            if (message.channel.id !== voiceChannels.get(interaction.guildId as string)?.synthesis?.channel) return;
            if (message.content.length > 100 || message.content == "") return;
            const filePath = path.join(__dirname, "temp", `${message.id}`);
            const username = message.member?.displayName ? message.member.displayName : message.author.username;
            const generatedVoice = await generateVoice(
                // eslint-disable-next-line no-useless-escape
                `${username.slice(0, 5)}。${message.cleanContent.replace(/https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/g, "ユーアールエル省略")}`,
                filePath,
                path.join(__dirname, "voice_models", voiceModel.file),
                voiceChannels.get(interaction.guildId as string).synthesis.speed,
                voiceChannels.get(interaction.guildId as string).synthesis.tone,
                voiceChannels.get(interaction.guildId as string).synthesis.intonation,
                voiceChannels.get(interaction.guildId as string).synthesis.volume,
                0.25
            ).catch((error) => {
                console.error(error);
            });
            if (!generatedVoice) return;
            const resource = createAudioResource(generatedVoice, { inputType: StreamType.Arbitrary });
            voiceChannels.get(interaction.guildId as string).player.play(resource);
        };
        voiceChannels.get(interaction.guildId as string).synthesis = {
            "channel": interaction.channel?.id as string,
            "voiceModel": voiceModel,
            "speed": interaction.options.get("speed")?.value as number ?? 1.25,
            "tone": interaction.options.get("tone")?.value as number ?? 1,
            "intonation": interaction.options.get("intonation")?.value as number ?? 1,
            "volume": interaction.options.get("volume")?.value as number ?? 0,
            "messageCreate": onMessageCreate
        };
        client.on("messageCreate", onMessageCreate);
        voiceChannels.get(interaction.guildId as string).player.play(soundEffects.enable());
        await interaction.reply({
            "content": "音声合成を設定しました。",
            "embeds": [{
                "title": "音声合成",
                "description": `音声: ${voiceModel.name}\n速度: ${voiceChannels.get(interaction.guildId as string).synthesis.speed}\n音程: ${voiceChannels.get(interaction.guildId as string).synthesis.tone}\n抑揚: ${voiceChannels.get(interaction.guildId as string).synthesis.intonation}\n音量: ${voiceChannels.get(interaction.guildId as string).synthesis.volume}`,
                "color": Colors.Green
            }]
        });
    } else if (subCommand === "recognition") {
        const engine = (interaction.options.getString("engine") as RecognitionEngine | null) ?? "vosk";
        const state = voiceChannels.get(interaction.guildId as string);
        if (state.recognition) {
            await disableSpeechRecognition(interaction.guildId as string);
            state.player.play(soundEffects.disable());
            await interaction.reply({
                "content": "音声認識を解除しました。",
                "embeds": [{
                    "title": "音声認識",
                    "description": "音声認識を解除しました。",
                    "color": Colors.Green
                }]
            });
            return;
        }

        const recognitionMembers: GuildMember[] = [];
        state.channel.members.forEach((member: GuildMember) => {
            if (member.user.bot) return;
            recognitionMembers.push(member);
        });

        if (recognitionMembers.length > 10) {
            await interaction.reply({
                "content": "エラーが発生しました。",
                "embeds": [{
                    "title": "エラー",
                    "description": "音声認識の上限(10人)を超えています。",
                    "color": Colors.Red
                }],
                "ephemeral": true
            });
            return;
        }

        const textChannel = interaction.channel as BaseGuildTextChannel;
        const existingWebhooks = await textChannel.fetchWebhooks();
        if (existingWebhooks.size + recognitionMembers.length > 10) {
            await interaction.reply({
                "content": "エラーが発生しました。",
                "embeds": [{
                    "title": "エラー",
                    "description": "Webhookの上限に達しました。",
                    "color": Colors.Red
                }],
                "ephemeral": true
            });
            return;
        }

        const recognizing: RecognitionSession[] = [];
        try {
            for (const member of recognitionMembers) {
                const session = await createRecognitionSession(engine, member, interaction.guildId as string, textChannel);
                recognizing.push(session);
            }
        } catch (error) {
            console.error("[recognition] Failed to initialize sessions", error);
            await Promise.all(recognizing.map(async (session) => session.dispose()));
            await interaction.reply({
                "content": "エラーが発生しました。",
                "embeds": [{
                    "title": "エラー",
                    "description": "音声認識を開始できませんでした。",
                    "color": Colors.Red
                }],
                "ephemeral": true
            });
            return;
        }

        const onVoiceStateUpdate = async (oldState: VoiceState, newState: VoiceState) => {
            if (nrCheck(oldState.guild.id) || nrCheck(newState.guild.id)) return;
            if (nrCheck(oldState.member?.id as string) || nrCheck(newState.member?.id as string)) return;
            if (oldState.guild.id !== interaction.guildId) return;
            if (newState.guild.id !== interaction.guildId) return;

            const recognitionState = voiceChannels.get(interaction.guildId as string)?.recognition;
            if (!recognitionState) return;
            const activeVoiceChannel = voiceChannels.get(interaction.guildId as string)?.channel;

            if (!activeVoiceChannel) return;

            if (!oldState.channel && newState.channel) {
                if (newState.channel.id !== activeVoiceChannel.id) return;
                if (newState.member?.user.bot) return;
                if (recognitionState.recognizing.find((session: RecognitionSession) => session.member.id === newState.member?.id)) return;
                if ((await textChannel.fetchWebhooks()).size >= 10) {
                    await interaction.followUp({
                        "content": "エラーが発生しました。",
                        "embeds": [{
                            "title": "エラー",
                            "description": "Webhookの上限に達しました。",
                            "color": Colors.Red
                        }]
                    });
                    return;
                }
                try {
                    const session = await createRecognitionSession(recognitionState.engine, newState.member as GuildMember, interaction.guildId as string, textChannel);
                    recognitionState.recognizing.push(session);
                    await interaction.followUp({
                        "content": "音声認識を更新しました。",
                        "embeds": [{
                            "title": "音声認識",
                            "description": "音声認識を更新しました。",
                            "color": Colors.Green
                        }]
                    });
                } catch (error) {
                    console.error("[recognition] Failed to add member", error);
                    await interaction.followUp({
                        "content": "エラーが発生しました。",
                        "embeds": [{
                            "title": "エラー",
                            "description": "音声認識の追加に失敗しました。",
                            "color": Colors.Red
                        }]
                    });
                }
            }

            if (oldState.channel && !newState.channel) {
                if (oldState.channel.id !== activeVoiceChannel.id) return;
                if (oldState.member?.user.bot) return;
                await removeRecognitionMember(interaction.guildId as string, oldState.member?.id as string);
                await interaction.followUp({
                    "content": "音声認識を更新しました。",
                    "embeds": [{
                        "title": "音声認識",
                        "description": "音声認識を更新しました。",
                        "color": Colors.Green
                    }]
                });
            }
        };

        client.on("voiceStateUpdate", onVoiceStateUpdate);
        state.recognition = {
            engine,
            onVoiceStateUpdate,
            recognizing,
        };
        state.player.play(soundEffects.enable());
        await interaction.reply({
            "content": "音声認識を開始しました。",
            "embeds": [{
                "title": "音声認識",
                "description": `音声認識を開始しました。(エンジン: ${engine.toUpperCase()})`,
                "color": Colors.Green
            }, {
                "title": "お知らせ",
                "description": "現在、VoiceJPは副サーバーでの音声認識を行っています。\nそのため、音声認識の精度が低下する可能性があります。\nご了承ください。",
                "color": Colors.Yellow
            }]
        });
    }
});

client.on("interactionCreate", async interaction => {
    if (nrCheck(interaction.user.id) || nrCheck(interaction.guildId as string)) return;
    if (!interaction.isCommand()) return;
    if (!interaction.member) {
        await interaction.reply("申し訳ございませんが、DMでは使用できません。");
        return;
    }
    if (interactionCommands.has(interaction.commandName)) {
        const command = interactionCommands.get(interaction.commandName);
        if (command !== undefined) {
            command(interaction as ChatInputCommandInteraction);
        } else {
            await interaction.reply({
                "content": "エラーが発生しました。",
                "embeds": [{
                    "title": "エラー",
                    "description": "コマンドが見つかりません。",
                    "color": Colors.Red
                }],
                "ephemeral": true
            });
        }
    }
});

client.on("interactionCreate", async interaction => {
    if (nrCheck(interaction.user.id) || nrCheck(interaction.guildId as string)) return;
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith("help-")) {
        const page = Number(interaction.customId.split("-")[1]);
        await interaction.update({
            content: "VoiceJPの使い方を表示します。",
            embeds: [await helpPages[page]()],
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`help-${page - 1}`)
                            .setLabel("前へ")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId(`help-${page + 1}`)
                            .setLabel("次へ")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === helpPages.length - 1)
                    )
            ]
        });
    }
});

client.on("guildCreate", async (guild) => {
    if (nrCheck(guild.id)) {
        await guild.leave();
    }
    guild.systemChannel?.send({
        "content": "VoiceJPを追加していただきありがとうございます。",
        "embeds": [
            new EmbedBuilder()
                .setTitle("VoiceJPを追加していただきありがとうございます")
                .setDescription(`VoiceJPは、日本語で音声読み上げと文字起こしができるDiscordアプリです。\n\n詳しい使い方は、</help:${(await client.application?.commands.fetch())?.find((command) => command.name === "help")?.id}>をご覧いただくか、[公式ウェブサイト](https://voicejp.renorari.net/)をご覧ください。`)
                .setColor(Colors.LuminousVividPink)
                .setImage(client.user?.banner as string)
                .setFooter({
                    "text": "VoiceJP"
                })
        ]
    });
});

client.login(token);

process.on("uncaughtException", function (error) {
    console.error(error);
});