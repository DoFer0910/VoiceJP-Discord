# VoiceJP - 日本語通話専用Discordアプリ

VoiceJPは、通話の文字起こしやテキストの音声読み上げができる、通話専用BOTです。

## VoiceJPは通話マジシャン

Discordの通話の困ったを解決します

- 🎤声が出せないけど通話したい
- 🎧通話はできないけど、話に参加したい
- 📝通話で話したことを文字に起こしたい

そんな時にVoiceJPが使えます！  
VoiceJPは、通話の文字起こしとテキスト読み上げをすることができます。

## VoiceJPの2つの相互機能

### 通話の音声を文字起こし

通話で話したことをユーザーごとに文字に起こし、指定したチャンネルに送信します。  
この機能を使うことで、議事録の作成も簡単にできます。

### テキストチャンネルを読み上げ

指定したチャンネルにメッセージが送信された時に、通話でそれを読み上げます。  
この機能を使うことで、通話で声が出せない人でも通話に参加することができます。

## 通話特化のDiscordアプリだから簡単

VoiceJPは誰でも簡単に使えるDiscordアプリです。  
使うコマンドは3つだけ!

1. 参加させる - /join
1. 音声読み上げ - /speech synthesis
1. 文字起こし - /speech recognition (engine オプションで Vosk / Whisper を選択できます)

詳しい使い方は、公式ホームページの使い方または、/helpをご覧ください！  
[使い方 - 公式ホームページ](https://voicejp.renorari.net/howtouse/)  
[BOTを導入する](https://voicejp.renorari.net/invite/)

## 環境変数

`.env` には最低限以下の値を設定してください。

| 変数名 | 説明 | デフォルト |
| --- | --- | --- |
| `TOKEN` | Discord Bot Token | - |
| `WHISPER_MODEL` | 使用するWhisperモデル名。自動ダウンロード対象になります。 | `large-v3-turbo` |
| `WHISPER_LANGUAGE` | Whisperに強制する言語コード。 | `ja` |
| `WHISPER_WITH_CUDA` | Whisper推論でCUDAを利用するかどうか。`true` にするとGPUが利用されます。 | `false` |

Whisperエンジンを利用しない場合は `WHISPER_*` の値を設定しなくても動作します（デフォルト値が利用されます）。

## 音声認識エンジンについて

- **Vosk**: 既定の軽量音声認識エンジンです。CPUのみで動作し、リアルタイム性を重視する場合に向いています。
- **Whisper**: `/speech recognition` コマンドの `engine` に `whisper` を指定すると使用できます。OpenAI Whisper を利用し、高精度な文字起こしが可能です。
	- Whisperを有効化するには FFmpeg が PATH で利用できる必要があります。
	- モデルは初回実行時にダウンロードされます。GPUを使用する場合は `WHISPER_WITH_CUDA=true` を設定してください。
