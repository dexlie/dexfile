console.clear();
require('./configuration/config');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    jidDecode,
    proto,
    getAggregateVotesInPollMessage,
    getUSyncDevices
} = require("baileys");

function decodeJid(jid = '') {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid) || {}
        return decode.user && decode.server
            ? `${decode.user}@${decode.server}`
            : jid
    }
    return jid
}

const axios = require('axios');
const chalk = require('chalk');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const FileType = require('file-type');
const readline = require('readline');
const PhoneNumber = require('awesome-phonenumber');
const path = require('path');
const NodeCache = require('node-cache');
const { Bot, InputFile } = require('grammy');

const {
    sleep,
    smsg,
    isUrl,
    generateMessageTag,
    getBuffer,
    getSizeMedia,
    fetchJson
} = require('./messagepath/helpers.js');

const {
    isOwner,
    isAdmin,
    isPremium,
    addAdmin,
    delAdmin,
    listAdmin,
    addPremium,
    delPremium,
    listPremiumUsers,
    getPremiumStatusSymbol,
    getBotMode,
    setBotMode,
    getBotModeInfo,
    isFreeMode,
    blockIfNoAccess,
    registerUser,
    getTotalUsers,
    getCooldown,
    canUseCommand,
    setCooldown,
    updateLastUsed
} = require('./messagepath/help.js');

const menuX = new InputFile('./configuration/menuX.jpg');
const menuX2 = new InputFile('./configuration/menuX.jpg');
const superior = new InputFile('./configuration/X.png');

const userCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const joinCheckCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

const ren = new Bot(global.tokens);

let sock;
const clients = new Map();
const sessionRoot = path.join('.', 'session');

if (!fs.existsSync(sessionRoot)) {
    fs.mkdirSync(sessionRoot, { recursive: true });
}

const log = {
    success: (msg) => console.log(chalk.green(`✓ ${msg}`)),
    error: (msg) => console.log(chalk.red(`✗ ${msg}`)),
    warning: (msg) => console.log(chalk.yellow(`⚠ ${msg}`)),
    info: (msg) => console.log(chalk.blue(`ℹ ${msg}`)),
    loading: (msg) => console.log(chalk.cyan(`⟳ ${msg}`)),
    whatsapp: (msg) => console.log(chalk.magenta(`📱 ${msg}`)),
    user: (msg) => console.log(chalk.magenta(`👤 ${msg}`)),
    broadcast: (msg) => console.log(chalk.yellow(`📢 ${msg}`))
};

const userMessageStore = new Map();
const joinCache = new Map();

const broadcastQueue = [];
let isBroadcasting = false;
const broadcastStatus = {
    total: 0,
    success: 0,
    failed: 0,
    active: false,
    startTime: null,
    currentUserId: null
};

function getUsersList() {
    const cacheKey = 'users_list';
    const cached = userCache.get(cacheKey);
    if (cached) return cached;
    
    try {
        const usersPath = path.join(__dirname, './database/users.json');
        if (fs.existsSync(usersPath)) {
            const data = fs.readFileSync(usersPath, 'utf8');
            const users = JSON.parse(data) || [];
            userCache.set(cacheKey, users, 60);
            return users;
        }
    } catch (err) {
        log.error(`Failed to load users: ${err.message}`);
    }
    return [];
}

function addToBroadcastQueue(userId, messageData) {
    broadcastQueue.push({ userId, messageData });
}

async function startBroadcastProcessor() {
    if (isBroadcasting) return;
    
    isBroadcasting = true;
    
    while (broadcastQueue.length > 0) {
        const batch = broadcastQueue.splice(0, 10);
        
        await Promise.allSettled(
            batch.map(async ({ userId, messageData }) => {
                broadcastStatus.currentUserId = userId;
                
                try {
                    await sleep(50);
                    
                    if (messageData.type === 'text') {
                        await ren.api.sendMessage(userId, messageData.text, {
                            parse_mode: messageData.parse_mode || 'HTML'
                        });
                    }
                    
                    broadcastStatus.success++;
                    log.broadcast(`Sent to ${userId} (${broadcastStatus.success}/${broadcastStatus.total})`);
                    
                } catch (err) {
                    broadcastStatus.failed++;
                    log.error(`Failed to send to ${userId}: ${err.message}`);
                }
                
                broadcastStatus.currentUserId = null;
            })
        );
        
        if (broadcastQueue.length > 0) {
            await sleep(100);
        }
    }
    
    isBroadcasting = false;
    broadcastStatus.active = false;
    
    if (broadcastStatus.startTime) {
        const endTime = Date.now();
        const duration = Math.floor((endTime - broadcastStatus.startTime) / 1000);
        
        const ownerId = global.owner?.[0];
        if (ownerId) {
            try {
                await ren.api.sendMessage(
                    ownerId,
                    `<pre>📢 Broadcast Completed</pre>
                    
<b>📊 Broadcast Report:</b>
• Total Users: ${broadcastStatus.total}
• Success: ${broadcastStatus.success}
• Failed: ${broadcastStatus.failed}
• Duration: ${duration} seconds
• Completion: ${Math.round((broadcastStatus.success / broadcastStatus.total) * 100)}%

<i>Broadcast process finished</i>`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                log.error(`Failed to notify owner: ${err.message}`);
            }
        }
        
        broadcastStatus.total = 0;
        broadcastStatus.success = 0;
        broadcastStatus.failed = 0;
        broadcastStatus.startTime = null;
    }
}

async function processBroadcast(messageData, ctx) {
    try {
        const users = getUsersList();
        if (users.length === 0) {
            await ctx.reply(`❌ No users found in database`, { parse_mode: 'HTML' });
            return;
        }
        
        broadcastStatus.total = users.length;
        broadcastStatus.success = 0;
        broadcastStatus.failed = 0;
        broadcastStatus.active = true;
        broadcastStatus.startTime = Date.now();
        
        const ownerId = ctx.from.id;
        await ctx.reply(
            `<pre>🚀 Starting Broadcast</pre>
            
<b>📊 Broadcast Info:</b>
• Total Users: ${users.length}
• Message Type: ${messageData.type}
• Status: Processing...

<i>Broadcast will run in background</i>`,
            { parse_mode: 'HTML' }
        );
        
        for (const userId of users) {
            addToBroadcastQueue(userId, messageData);
        }
        
        setTimeout(() => startBroadcastProcessor(), 100);
        
        await ctx.reply(
            `✅ Broadcast started with ${users.length} users.
The process will run in the background.

Use /bcstatus to check progress.`,
            { parse_mode: 'HTML' }
        );
        
    } catch (err) {
        log.error(`Broadcast error: ${err.message}`);
        await ctx.reply(`❌ Broadcast failed: ${err.message}`, { parse_mode: 'HTML' });
    }
}

async function deletePreviousMessages(ctx, uid) {
    try {
        const previousMessages = userMessageStore.get(uid) || [];
       
        const toDelete = previousMessages.slice(-10);
        for (const msgId of toDelete) {
            await ctx.api.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        userMessageStore.set(uid, []);
    } catch (err) {
        log.error(`Failed to delete previous messages: ${err.message}`);
    }
}

function saveMessageId(uid, messageId) {
    const messages = userMessageStore.get(uid) || [];
    messages.push(messageId);
    
    if (messages.length > 10) {
        messages.splice(0, messages.length - 10);
    }
    userMessageStore.set(uid, messages);
}

function getSessionPathForUser(uid) {
    return path.join(sessionRoot, String(uid));
}

async function checkSessionExistsForUser(uid) {
    try {
        await fs.promises.access(getSessionPathForUser(uid));
        return true;
    } catch {
        return false;
    }
}

async function deleteSessionForUser(uid) {
    try {
        await fs.promises.rm(getSessionPathForUser(uid), { recursive: true, force: true });
        log.success(`WhatsApp session deleted for user: ${uid}`);
        return true;
    } catch (err) {
        log.error(`Failed to delete session for ${uid}: ${err.message}`);
        return false;
    }
}

async function initWhatsappForUser(telegramuid, notifyUser = true, retryCount = 0) {
    const MAX_RETRIES = 5;
    const RECONNECT_DELAY = 5000;
    const uid = String(telegramuid);
    const sessionPath = getSessionPathForUser(uid);

    try {
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: false,
            markOnlineOnConnect: false,
        });

        const store = makeInMemoryStore({ logger: pino({ level: 'silent' }).child({ stream: 'store' }) });
        store.bind(sock.ev);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages?.[0];
                if (!mek?.message || mek.key?.remoteJid === 'status@broadcast') return;

                mek.message = mek.message.ephemeralMessage?.message || mek.message;
                const m = smsg(sock, mek, store);

                if (m.isGroup) await sock.groupMetadata(m.chat).catch(() => null);

                await require('./main')(sock, m, chatUpdate, store);
            } catch (err) {
                console.log('Message Error:', err);
            }
        });

        // Utility methods
        sock.getFile = async (PATH, save) => {
            let data = Buffer.isBuffer(PATH) ? PATH
                      : /^data:.*;base64,/.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64')
                      : /^https?:\/\//.test(PATH) ? await getBuffer(PATH)
                      : fs.existsSync(PATH) ? fs.readFileSync(PATH)
                      : Buffer.alloc(0);

            const type = await FileType.fromBuffer(data) || { mime: 'application/octet-stream', ext: 'bin' };
            const filename = path.join(__filename, '../' + Date.now() + '.' + type.ext);

            if (save) await fs.promises.writeFile(filename, data);
            return { filename, size: await getSizeMedia(data), ...type, data };
        };

        sock.downloadMediaMessage = async (message) => {
            try {
                const messageType = message.mtype?.replace(/Message/i, '') || message.msg?.mimetype?.split('/')[0];
                const stream = await downloadContentFromMessage(message, messageType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                return buffer;
            } catch {
                return Buffer.alloc(0);
            }
        };

        sock.sendText = (jid, text, quoted = '', options = {}) => sock.sendMessage(jid, { text, ...options }, { quoted });
        sock.setStatus = async (status) => {
            try {
                await sock.query({
                    tag: 'iq',
                    attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'status' },
                    content: [{ tag: 'status', attrs: {}, content: Buffer.from(status, 'utf-8') }],
                });
            } catch (err) { log.error(`Failed to set status: ${err.message}`); }
        };

        clients.set(uid, { sock, status: 'connecting', sessionPath, reconnecting: false });

        sock.ev.on('connection.update', async ({ connection, lastDisconnect } = {}) => {
            const client = clients.get(uid);
            if (!client) return;

            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const disconnectReason = DisconnectReason[reason] || reason || 'unknown';
                log.warning(`WA (${uid}) disconnected: ${disconnectReason}`);
                client.status = 'closed';

                if ([DisconnectReason.loggedOut, 401, 403].includes(reason)) {
                    await deleteSessionForUser(uid).catch(() => {});
                    clients.delete(uid);
                    try { await ren.api.sendMessage(telegramuid, "🚫 *WhatsApp session removed*\nYour session was logged out/banned. Use /addbot.", { parse_mode: 'Markdown' }); } catch {}
                } else if (!client.reconnecting && retryCount < MAX_RETRIES) {
                    client.reconnecting = true;
                    setTimeout(() => initWhatsappForUser(telegramuid, notifyUser, retryCount + 1), RECONNECT_DELAY);
                } else if (retryCount >= MAX_RETRIES) {
                    await deleteSessionForUser(uid).catch(() => {});
                    clients.delete(uid);
                    try { await ren.api.sendMessage(telegramuid, "🚫 *WhatsApp session deleted automatically*\nUnable to reconnect. Use /addbot.", { parse_mode: 'Markdown' }); } catch {}
                }
            } else if (connection === 'open') {
                client.status = 'open';
                log.whatsapp(`✅ WhatsApp Connected for user ${uid}!`);
                if (notifyUser) {
                    try { await ren.api.sendMessage(telegramuid, `✅ *WhatsApp paired successfully.*`, { parse_mode: 'Markdown' }); } catch {}
                }
            }
        });

        return sock;
    } catch (err) {
        log.error(`Failed to init WhatsApp for user ${uid}: ${err.message}`);
        return null;
    }
}

function logMessage(ctx) {
    const chatType = ctx.chat?.type || 'unknown';
    const username = ctx.from?.username || ctx.from?.first_name || 'Unknown';
    const text = ctx.message?.text || 'No text';
    
    console.log(chalk.cyan(`[TG] ${chatType} | @${username}: ${text}`));
}

// Fungsi untuk mendapatkan last message ID
function getLastMessageId(uid) {
    const messages = userMessageStore.get(uid) || [];
    return messages.length > 0 ? messages[messages.length - 1] : null;
}

// Fungsi untuk edit message (foto dengan caption)
async function editMessageWithPhoto(ctx, uid, caption, replyMarkup) {
    try {
        const lastMsgId = getLastMessageId(uid);
        
        if (lastMsgId) {
            // Coba edit message yang ada
            try {
                await ctx.api.editMessageCaption(ctx.chat.id, lastMsgId, {
                    caption: caption,
                    parse_mode: 'HTML'
                }).catch(() => {});
                
                await ctx.api.editMessageReplyMarkup(ctx.chat.id, lastMsgId, {
                    reply_markup: replyMarkup
                }).catch(() => {});
                return lastMsgId;
            } catch (editError) {
                console.log('Edit message failed, sending new message:', editError.message);
                // Jika edit gagal, kirim message baru
            }
        }
        
        // Kirim message baru
        const sentMessage = await ctx.replyWithPhoto(menuX, {
            caption: caption,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
        
        saveMessageId(uid, sentMessage.message_id);
        return sentMessage.message_id;
    } catch (error) {
        console.error('Edit message error:', error);
        // Fallback ke text message
        const sentMessage = await ctx.reply(caption, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
        saveMessageId(uid, sentMessage.message_id);
        return sentMessage.message_id;
    }
}

// Fungsi untuk edit message (text only)
async function editMessageText(ctx, uid, text, replyMarkup) {
    try {
        const lastMsgId = getLastMessageId(uid);
        
        if (lastMsgId) {
            // Coba edit message yang ada
            try {
                await ctx.api.editMessageText(ctx.chat.id, lastMsgId, {
                    text: text,
                    parse_mode: 'HTML'
                }).catch(() => {});
                
                await ctx.api.editMessageReplyMarkup(ctx.chat.id, lastMsgId, {
                    reply_markup: replyMarkup
                }).catch(() => {});
                return lastMsgId;
            } catch (editError) {
                console.log('Edit text message failed, sending new message:', editError.message);
                // Jika edit gagal, kirim message baru
            }
        }
        
        // Kirim message baru
        const sentMessage = await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
        
        saveMessageId(uid, sentMessage.message_id);
        return sentMessage.message_id;
    } catch (error) {
        console.error('Edit text message error:', error);
        return null;
    }
}

ren.use(async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    if (!ctx.from?.id) return next();

    const uid = String(ctx.from.id);
    const username = ctx.from.username
        ? `@${ctx.from.username}`
        : ctx.from.first_name || 'Unknown';

    const isNewUser = registerUser(uid, username);

    if (isNewUser) {
        log.user(`New user registered: ${uid} (${username})`);

        const ownerId = global.ownID?.[0];
        if (ownerId) {
            try {
                await ctx.api.sendMessage(
                    ownerId,
`<b>👤 New User Registered</b>

ID: <code>${uid}</code>
Username: ${username}
Total Users: ${getTotalUsers()}`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {
                log.error(`Notify owner failed: ${e.message}`);
            }
        }
    }

    return next();
});

ren.use(async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    if (!ctx.from?.id) return next();

    const uid = String(ctx.from.id);

    if (joinCache.get(uid)) {
        return next();
    }

    const channels = Array.isArray(global.channels) ? global.channels : [];
    if (!channels.length) return next();

    const notJoined = [];

    for (const ch of channels) {
        try {
            const member = await ctx.api.getChatMember(
                `@${ch.username}`,
                Number(uid)
            );

            if (!member || ['left', 'kicked'].includes(member.status)) {
                notJoined.push(ch);
            }
        } catch {
            notJoined.push(ch);
        }
    }

    if (!notJoined.length) {
        joinCache.set(uid, true);
        return next();
    }

    const keyboard = {
        inline_keyboard: [
            ...notJoined.map(ch => [{
                text: `Join ${ch.name}`,
                url: `https://t.me/${ch.username}`
            }]),
            [{
                text: '✅ I Have Joined',
                callback_data: 'check_join'
            }]
        ]
    };

    await ctx.reply(
`<pre>𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨</pre>

📃 bots specifically designed for <b>bugs via WhatsApps</b>, welcome to <b>e.x.e both</b>, use bots wisely and responsibly, <b>enjoy!!</b>

┌──────
├─── 𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /
├ 
└

You must join all required channels:

${notJoined.map(c => `• ${c.name}`).join('\n')}

After joining, click the button below.`,
        {
            parse_mode: 'HTML',
            reply_markup: keyboard
        }
    );

    return;
});

ren.on('message', async (ctx) => {
    try {
        logMessage(ctx);

        if (!ctx.message?.text) return;
        if (!ctx.message.text.startsWith('/') && ctx.message.text !== 'backmenu') return;

        const [command, ...args] = ctx.message.text.startsWith('/') 
            ? ctx.message.text.slice(1).split(' ')
            : [ctx.message.text];
        const uid = ctx.from.id.toString();

        if (blockIfNoAccess(ctx, uid)) {
            return;
        }

        updateLastUsed(uid);

        switch (command.toLowerCase()) {
            case "start": {
                try {
                    const mainMenuCaption = `<pre>𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨</pre>

📃 bots specifically designed for <b>bugs via WhatsApps</b>, welcome to <b>e.x.e both</b>, use bots wisely and responsibly, <b>enjoy!!</b>

┌──────
├─── 𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /
├ 
└

<i> select the button below </i>`;
                    
                    const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "𝗉𝖺𝗂𝗋 - 𝗆𝖾𝗇𝗎", callback_data: "pair_menu" },
                            { text: "𝗉𝗋𝖾𝗆𝗂𝗎𝗆 - 𝗆𝖾𝗇𝗎", callback_data: "premium_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ],
                    ]
                    };
                    
                    await editMessageWithPhoto(ctx, uid, mainMenuCaption, replyMarkup);
                } catch (error) {
                    console.error('Start command error:', error);
                    // Fallback ke pesan teks jika gambar error
                    const fallbackText = `𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨

📃 bots specifically designed for bugs via WhatsApps, welcome to e.x.e both, use bots wisely and responsibly, enjoy!!

┌──────
├─── 𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /
├ 
└

select the button below`;
                    
                    const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "𝗉𝖺𝗂𝗋 - 𝗆𝖾𝗇𝗎", callback_data: "pair_menu" },
                            { text: "𝗉𝗋𝖾𝗆𝗂𝗎𝗆 - 𝗆𝖾𝗇𝗎", callback_data: "premium_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ],
                    ]
                    };
                    
                    await editMessageText(ctx, uid, fallbackText, replyMarkup);
                }
                break;
            }
            
            case "pair": 
            case "backmenu": {
                const pairMenuCaption = `<pre>𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨</pre>

🚩 <b>𝖢𝗈𝗇𝗇𝖾𝖼𝗍𝗂𝗈𝗇 𝗆𝖾𝗇𝗎</b>, 𝗎𝗌𝖾 𝗍𝗁𝖾 𝖼𝗈𝗆𝗆𝖺𝗇𝖽 𝖻𝖾𝗅𝗈𝗐 𝗍𝗈 𝖼𝗈𝗇𝗇𝖾𝖼𝗍 𝗍𝗁𝖾 𝖶𝖠 𝖻𝗈𝗍, <b>𝗆𝖺𝗑𝗂𝗆𝗎𝗆 𝗂𝗌 3 𝗇𝗎𝗆𝖻𝖾𝗋𝗌</b>

┌──────
├─── Pair 𝖡𝗈𝗍𝗁
┠─ ▢ /addbot +12345678910
┠─ ▢ /delbot +123455678910
┠─ ▢ /mybot
├ 
└

<i> © dexline - exe!.</i>`;
                
                const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "back!.", callback_data: "back_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ]
                    ]
                };
                
                await editMessageWithPhoto(ctx, uid, pairMenuCaption, replyMarkup);
                break;
            }

            case "addbot": {
                try {
                    if (!args[0]) {
                        await ctx.reply(`<pre>
<b>⚠️ Wrong Format!</b>
Example: /addbot +12345678910
</pre>`, { parse_mode: 'HTML' });
                        return;
                    }

                    setCooldown(uid, 30);

                    const phone = args[0].replace(/[^0-9]/g, '');
                    
                    const exists = await checkSessionExistsForUser(uid);
                    if (exists) {
                        const client = clients.get(uid);
                        if (client && client.status === 'open') {
                            await ctx.reply(`
<b>⚠️ You already have</b>
active WhatsApp session
`, { parse_mode: 'HTML' });
                            return;
                        }
                    }

                    const waitMessage = await ctx.reply(`
<b>⏳ Processing...</b>
 Creating pairing code...
`, { parse_mode: 'HTML' });
                    
                    const sock = await initWhatsappForUser(uid, true);
                    
                    const client = clients.get(uid);
                    if (client) {
                        client.waitMessageId = waitMessage.message_id;
                    }

                    await sleep(1000);
                    
                    if (!sock) {
                        await ctx.api.deleteMessage(ctx.chat.id, waitMessage.message_id).catch(() => {});
                        await ctx.reply(`
<b>❌ Failed to initialize</b>
 WhatsApp. Try again later
`, { parse_mode: 'HTML' });
                        return;
                    }

                    try {
                        if (!sock.requestPairingCode) {
                            throw new Error('Pairing code feature not available');
                        }
                        
                        const code = await sock.requestPairingCode(phone);
                        await ctx.api.deleteMessage(ctx.chat.id, waitMessage.message_id).catch(() => {});
                        
                        const pairingMessage = await ctx.reply(
                            `<b>🧩 Pairing Code Ready!</b>

<b>📱 Number:</b> <code>${phone}</code>
<b>🔐 Code:</b> <code>${code}</code>
<pre>
Enter this code in
WhatsApp to connect

Code expires in 60s
</pre>`,
                            { parse_mode: 'HTML' }
                        );

                        if (client) {
                            client.pairingMessageId = pairingMessage.message_id;
                        }

                        setTimeout(async () => {
                            try {
                                const currentClient = clients.get(uid);
                                if (currentClient?.status !== 'open') {
                                    await ctx.api.sendMessage(ctx.chat.id, `
⏰ Pairing Code Expired

 Please request new code
 with /addbot
`, { parse_mode: 'HTML' });
                                    
                                    if (currentClient) {
                                        try { 
                                            if (currentClient.sock?.end) {
                                                await currentClient.sock.end(); 
                                            }
                                        } catch {}
                                        clients.delete(uid);
                                    }
                                }
                            } catch (e) {
                                // ignore
                            }
                        }, 60 * 1000);
                    } catch (err) {
                        await ctx.api.deleteMessage(ctx.chat.id, waitMessage.message_id).catch(() => {});
                        await ctx.reply(`
 ❌ Pairing Failed
 
 Error: ${err.message}
`, { parse_mode: 'HTML' });
                    }
                } catch (err) {
                    log.error(`Pairing failed for ${uid}: ${err.message}`);
                    await ctx.reply(`
 ❌ Pairing Failed
 
 Unexpected error
 occurred
`, { parse_mode: 'HTML' });
                }
                break;
            }
            
            case 'mybot': {
                try {
                    if (!isOwner(uid) && !isAdmin(uid)) {
                        await ctx.reply(`🚫 Owner/Admin Only`, { parse_mode: 'Markdown' });
                        return;
                    }

                    let result = '📌 *Active Pairing List*\n\n';
                    let count = 0;

                    for (const [uid, data] of clients.entries()) {
                        if (data?.status === 'open') {
                            count++;
                            result += `👤 *User ID:* \`${uid}\`\n\n`;
                        }
                    }

                    if (count === 0) {
                        await ctx.reply(`ℹ️ No Active Pairing Found`, { parse_mode: 'Markdown' });
                        return;
                    }

                    await ctx.reply(result, { parse_mode: 'Markdown' });
                } catch (e) {
                    await ctx.reply(`❌ Error getting pairing data`, { parse_mode: 'Markdown' });
                }
                break;
            }

            case 'delbot': {
                try {
                    setCooldown(uid, 30);
                    
                    const targetuid = uid;
                    const sockData = clients.get(targetuid);
                    
                    if (!sockData) {
                        await ctx.reply(`
 ⚠️ No Active WhatsApp
 Session for this user
`, { parse_mode: 'HTML' });
                        return;
                    }

                    if (sockData.sock?.end) {
                        await sockData.sock.end();
                    }

                    await deleteSessionForUser(targetuid);
                    clients.delete(targetuid);

                    await ctx.reply(
                        `✅ WhatsApp Session
 Deleted for user
 ${targetuid}`,
                        { parse_mode: 'HTML' }
                    );
                } catch (err) {
                    await ctx.reply(`❌ Error Deleting Session`, { parse_mode: 'HTML' });
                }
                break;
            }

            case 'mode': {
                try {
                    if (!isOwner(uid) && !isAdmin(uid)) {
                        await ctx.reply(`🚫 Admin/Owner Only`, { parse_mode: 'Markdown' });
                        return;
                    }
                    
                    if (!args[0]) {
                        const modeInfo = getBotModeInfo();
                        await ctx.reply(
`📟 *Bot Mode Info*
• Current Mode: *${modeInfo.mode.toUpperCase()}*
• Changed By: ${modeInfo.changedBy}
• Changed At: ${modeInfo.changedAt}
• Total Users: ${getTotalUsers()}

Usage: /mode [public/private]`,
                            { parse_mode: 'Markdown' }
                        );
                        return;
                    }
                    
                    const newMode = args[0].toLowerCase();
                    if (!['public', 'private'].includes(newMode)) {
                        await ctx.reply(`Invalid mode! Use: /mode public OR /mode private`, { parse_mode: 'Markdown' });
                        return;
                    }
                    
                    const modeData = setBotMode(newMode, uid);
                    await ctx.reply(
`✅ *Bot Mode Updated*
• New Mode: *${modeData.mode.toUpperCase()}*
• Changed By: ${uid}
• Changed At: ${new Date(modeData.changedAt).toLocaleString()}`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (err) {
                    await ctx.reply(`❌ Error changing mode`, { parse_mode: 'Markdown' });
                }
                break;
            }

            case 'premium': {
                try {
                    if (!isOwner(uid) && !isAdmin(uid)) {
                        await ctx.reply(`🚫 Admin/Owner Only`, { parse_mode: 'Markdown' });
                        return;
                    }
                    
                    if (args.length < 2) {
                        const premiumList = listPremiumUsers();
                        await ctx.reply(
`🔖 *Premium Users*
${premiumList}

Usage: /premium add/del <userid> [days]
• /premium add 123456789 30
• /premium del 123456789
• /premium list`,
                            { parse_mode: 'Markdown' }
                        );
                        return;
                    }
                    
                    const action = args[0].toLowerCase();
                    const targetId = args[1];
                    
                    if (action === 'add') {
                        const days = parseInt(args[2]) || 30;
                        addPremium(targetId, days);
                        await ctx.reply(`✅ Added premium for ${targetId} for ${days} days`, { parse_mode: 'Markdown' });
                    } else if (action === 'del') {
                        delPremium(targetId);
                        await ctx.reply(`✅ Removed premium for ${targetId}`, { parse_mode: 'Markdown' });
                    } else if (action === 'list') {
                        const premiumList = listPremiumUsers();
                        await ctx.reply(`🔖 *Premium Users*\n${premiumList}`, { parse_mode: 'Markdown' });
                    } else {
                        await ctx.reply(`Invalid action! Use: add/del/list`, { parse_mode: 'Markdown' });
                    }
                } catch (err) {
                    await ctx.reply(`❌ Error processing premium command`, { parse_mode: 'Markdown' });
                }
                break;
            }

            case 'admin': {
                try {
                    if (!isOwner(uid)) {
                        await ctx.reply(`🚫 Owner Only`, { parse_mode: 'Markdown' });
                        return;
                    }
                    
                    if (args.length < 2) {
                        const adminList = listAdmin();
                        await ctx.reply(
`🫧 *Admin List*
${adminList}

Usage: /admin add/del <userid>
• /admin add 123456789
• /admin del 123456789`,
                            { parse_mode: 'Markdown' }
                        );
                        return;
                    }
                    
                    const action = args[0].toLowerCase();
                    const targetId = args[1];
                    
                    if (action === 'add') {
                        addAdmin(targetId);
                        await ctx.reply(`✅ Added admin ${targetId}`, { parse_mode: 'Markdown' });
                    } else if (action === 'del') {
                        delAdmin(targetId);
                        await ctx.reply(`✅ Removed admin ${targetId}`, { parse_mode: 'Markdown' });
                    } else {
                        await ctx.reply(`Invalid action! Use: add/del`, { parse_mode: 'Markdown' });
                    }
                } catch (err) {
                    await ctx.reply(`❌ Error processing admin command`, { parse_mode: 'Markdown' });
                }
                break;
            }

            case 'stats': {
                try {
                    if (!isOwner(uid) && !isAdmin(uid)) {
                        await ctx.reply(`🚫 Admin/Owner Only`, { parse_mode: 'Markdown' });
                        return;
                    }
                    
                    const totalUsers = getTotalUsers();
                    const activeSessions = Array.from(clients.values()).filter(c => c.status === 'open').length;
                    const modeInfo = getBotModeInfo();
                    
                    await ctx.reply(
`📊 *Bot Statistics*
• Total Users: ${totalUsers}
• Active WA Sessions: ${activeSessions}
• Bot Mode: ${modeInfo.mode.toUpperCase()}
• Premium Users: ${listPremiumUsers().split('\n').length - 1}
• Admin Users: ${listAdmin().split('\n').length - 1}`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (err) {
                    await ctx.reply(`❌ Error getting statistics`, { parse_mode: 'Markdown' });
                }
                break;
            }

            case 'bc': {
                try {
                    if (!isOwner(uid) && !isAdmin(uid)) {
                        await ctx.reply(`🚫 Admin/Owner Only`, { parse_mode: 'Markdown' });
                        return;
                    }

                    if (broadcastStatus.active) {
                        await ctx.reply(
`⚠️ *Broadcast in Progress*

There is already a broadcast running.
Use /bcstatus to check progress or wait for it to finish.`,
                            { parse_mode: 'Markdown' }
                        );
                        return;
                    }

                    const replyMsg = ctx.message.reply_to_message;
                    let messageData = null;
                    const users = getUsersList();
                    
                    if (users.length === 0) {
                        await ctx.reply(`❌ No users found in database`, { parse_mode: 'HTML' });
                        return;
                    }

                    if (replyMsg && replyMsg.text) {
                        messageData = {
                            type: 'text',
                            text: replyMsg.text,
                            parse_mode: 'HTML'
                        };
                    } else if (args.length > 0) {
                        const messageText = args.join(' ');
                        messageData = {
                            type: 'text',
                            text: messageText,
                            parse_mode: 'HTML'
                        };
                    } else {
                        await ctx.reply(
`📢 *Broadcast Command*

Usage: /bc <message>
• Reply to a message: /bc
• Send text: /bc Hello everyone!

<b>Features:</b>
• Text only broadcast
• Queue system (no bot stuck)
• Background processing
• Progress tracking

<i>Total Users: ${getTotalUsers()}</i>`,
                                { parse_mode: 'HTML' }
                        );
                        return;
                    }

                    await processBroadcast(messageData, ctx);
                    
                } catch (err) {
                    await ctx.reply(`❌ Broadcast failed: ${err.message}`, { parse_mode: 'HTML' });
                }
                break;
            }

            case 'bcstatus': {
                try {
                    if (!isOwner(uid) && !isAdmin(uid)) {
                        await ctx.reply(`🚫 Admin/Owner Only`, { parse_mode: 'Markdown' });
                        return;
                    }

                    const users = getUsersList();
                    
                    if (!broadcastStatus.active) {
                        await ctx.reply(
`📊 *Broadcast Status*

• Status: <b>Idle</b>
• Total Users: ${users.length}
• Queue: ${broadcastQueue.length}
• Processor: ${isBroadcasting ? 'Active' : 'Inactive'}

<i>No broadcast is currently running</i>`,
                            { parse_mode: 'HTML' }
                        );
                        return;
                    }

                    const elapsed = Math.floor((Date.now() - broadcastStatus.startTime) / 1000);
                    const progress = broadcastStatus.total > 0 
                        ? Math.round((broadcastStatus.success + broadcastStatus.failed) / broadcastStatus.total * 100) 
                        : 0;
                    
                    await ctx.reply(
`📊 *Broadcast Status*

<b>Status:</b> Active
<b>Progress:</b> ${progress}%
<b>Elapsed:</b> ${elapsed} seconds

<b>📈 Statistics:</b>
• Total: ${broadcastStatus.total}
• Success: ${broadcastStatus.success}
• Failed: ${broadcastStatus.failed}
• Queue: ${broadcastQueue.length}
• Current: ${broadcastStatus.currentUserId || 'None'}

<b>⏱️ Estimated:</b>
• Remaining: ${broadcastStatus.total > 0 
    ? Math.floor((elapsed / (broadcastStatus.success + broadcastStatus.failed)) * (broadcastStatus.total - broadcastStatus.success - broadcastStatus.failed)) 
    : 0} seconds

<i>Broadcast is running in background</i>`,
                        { parse_mode: 'HTML' }
                    );
                    
                } catch (err) {
                    await ctx.reply(`❌ Error getting broadcast status`, { parse_mode: 'HTML' });
                }
                break;
            }
            
            // Tambahkan di file utama setelah command lainnya

case 'setconfig': {
    try {
        if (!isOwner(uid) && !isAdmin(uid)) {
            await ctx.reply(`🚫 Owner/Admin Only`, { parse_mode: 'Markdown' });
            return;
        }

        if (!args[0]) {
            const channels = listChannels();
            const channelCount = channels.length;
            
            let channelsList = '';
            if (channelCount > 0) {
                channelsList = channels.map((ch, index) => 
                    `${index + 1}. ${ch.name} (@${ch.username})`
                ).join('\n');
            } else {
                channelsList = 'No channels configured';
            }

            await ctx.reply(
`⚙️ *Channel Configuration*

<b>Current Channels (${channelCount}):</b>
${channelsList}

<b>Usage:</b>
• /setconfig add <name> <username>
• /setconfig del <username>
• /setconfig list
• /setconfig clear

<b>Examples:</b>
• /setconfig add "Main Channel" dexbots
• /setconfig del dexbots
• /setconfig list

<b>Note:</b> Username tanpa @`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        const action = args[0].toLowerCase();
        
        if (action === 'add') {
            if (args.length < 3) {
                await ctx.reply(
`❌ *Format Salah!*

Gunakan: /setconfig add "Nama Channel" username

Contoh: /setconfig add "Main Channel" dexbots

<b>Note:</b> Nama channel bisa pakai spasi jika diapit tanda kutip`,
                    { parse_mode: 'HTML' }
                );
                return;
            }

            // Handle quoted name
            let name, username;
            if (args[1].startsWith('"') || args[1].startsWith("'")) {
                const quotedText = ctx.message.text.match(/"([^"]+)"|'([^']+)'/);
                if (quotedText) {
                    name = quotedText[1] || quotedText[2];
                    username = args[args.length - 1];
                } else {
                    name = args[1];
                    username = args[2];
                }
            } else {
                name = args[1];
                username = args[2];
            }

            // Remove @ if present
            username = username.replace('@', '');

            const result = addChannel(name, username);
            
            if (result.success) {
                await ctx.reply(
`✅ *Channel Added Successfully*

<b>Name:</b> ${name}
<b>Username:</b> @${username}

User akan diminta untuk join channel ini sebelum menggunakan bot.`,
                    { parse_mode: 'HTML' }
                );
            } else {
                await ctx.reply(`❌ ${result.message}`, { parse_mode: 'HTML' });
            }

        } else if (action === 'del' || action === 'remove') {
            if (!args[1]) {
                await ctx.reply(
`❌ *Format Salah!*

Gunakan: /setconfig del <username>

Contoh: /setconfig del dexbots`,
                    { parse_mode: 'HTML' }
                );
                return;
            }

            const username = args[1].replace('@', '');
            const result = removeChannel(username);
            
            if (result.success) {
                await ctx.reply(
`✅ *Channel Removed Successfully*

<b>Username:</b> @${username}

Channel telah dihapus dari daftar wajib join.`,
                    { parse_mode: 'HTML' }
                );
            } else {
                await ctx.reply(`❌ ${result.message}`, { parse_mode: 'HTML' });
            }

        } else if (action === 'list') {
            const channels = listChannels();
            const channelCount = channels.length;
            
            if (channelCount === 0) {
                await ctx.reply(`📭 *No Channels Configured*\n\nUse /setconfig add to add channels`, { parse_mode: 'Markdown' });
                return;
            }

            let message = `📋 *Channel List (${channelCount})*\n\n`;
            
            channels.forEach((ch, index) => {
                message += `${index + 1}. *${ch.name}*\n   @${ch.username}\n\n`;
            });

            await ctx.reply(message, { parse_mode: 'Markdown' });

        } else if (action === 'clear') {
            // Konfirmasi sebelum menghapus semua
            const confirmKeyboard = {
                inline_keyboard: [
                    [
                        { text: "✅ Ya, Hapus Semua", callback_data: `clear_channels_confirm_${uid}` },
                        { text: "❌ Batal", callback_data: "cancel_clear" }
                    ]
                ]
            };

            await ctx.reply(
`⚠️ *Konfirmasi Hapus Semua Channel*

Anda akan menghapus SEMUA channel yang dikonfigurasi (${listChannels().length} channel).

<b>Perhatian:</b>
• Aksi ini tidak dapat dibatalkan
• User tidak perlu join channel apapun setelah ini
• Anda perlu menambah ulang channel jika diperlukan

Apakah Anda yakin?`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: confirmKeyboard 
                }
            );

        } else if (action === 'test') {
            // Test apakah user sudah join semua channel
            const channels = listChannels();
            
            if (channels.length === 0) {
                await ctx.reply(`ℹ️ Tidak ada channel yang dikonfigurasi`, { parse_mode: 'HTML' });
                return;
            }

            let result = `🧪 *Test Join Status*\n\n`;
            const notJoined = [];

            for (const ch of channels) {
                try {
                    const member = await ctx.api.getChatMember(
                        `@${ch.username}`,
                        Number(uid)
                    );
                    
                    if (!member || member.status === 'left' || member.status === 'kicked') {
                        result += `❌ @${ch.username} - Belum join\n`;
                        notJoined.push(ch);
                    } else {
                        result += `✅ @${ch.username} - Sudah join\n`;
                    }
                } catch (err) {
                    result += `⚠️ @${ch.username} - Error: ${err.message}\n`;
                }
            }

            if (notJoined.length === 0) {
                result += `\n✅ *Semua channel sudah di-join!*`;
            } else {
                result += `\n❌ *Masih ada ${notJoined.length} channel yang belum di-join*`;
            }

            await ctx.reply(result, { parse_mode: 'Markdown' });

        } else {
            await ctx.reply(
`❌ *Invalid Action!*

Available actions: add, del, list, clear, test

Contoh: /setconfig add "Channel Name" username`,
                { parse_mode: 'Markdown' }
            );
        }
        
    } catch (err) {
        await ctx.reply(`❌ Error: ${err.message}`, { parse_mode: 'HTML' });
    }
    break;
}

            case 'bclist': {
                try {
                    if (!isOwner(uid) && !isAdmin(uid)) {
                        await ctx.reply(`🚫 Admin/Owner Only`, { parse_mode: 'Markdown' });
                        return;
                    }

                    const users = getUsersList();
                    const totalUsers = users.length;
                    
                    if (totalUsers === 0) {
                        await ctx.reply(`❌ No users found in database`, { parse_mode: 'HTML' });
                        return;
                    }

                    
                    const displayUsers = users.slice(0, 50);
                    const userList = displayUsers.map((userId, index) => 
                        `${index + 1}. ${userId}`
                    ).join('\n');

                    const hasMore = totalUsers > 50;
                    
                    await ctx.reply(
`👥 *User List*

<b>Total Users:</b> ${totalUsers}
<b>Displaying:</b> ${displayUsers.length} users

<pre>${userList}</pre>

${hasMore ? `\n<i>... and ${totalUsers - 50} more users</i>` : ''}`,
                        { parse_mode: 'HTML' }
                    );
                    
                } catch (err) {
                    await ctx.reply(`❌ Error getting user list`, { parse_mode: 'HTML' });
                }
                break;
            }

            case 'help': {
                const isAdminUser = isAdmin(uid) || isOwner(uid);
                const isPremiumUser = isPremium(uid);
                
                let helpText = `🚩 *Available Commands*
┌──────
├─── User Commands
┠─ ▢ /addbot <number> - Pair WhatsApp account
┠─ ▢  /delbot - Delete your session
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /start - Show main menu
├ 
└
`;

                if (isPremiumUser) {
                    helpText += `\nPremium User: ✅ Active\n`;
                }
                
                if (isAdminUser) {
                    helpText += `┌──────
├─── Admin/Owner Commands:
┠─ ▢ /mybot - List active sessions
┠─ ▢ /mode [public/private] - Change bot mode
┠─ ▢ /premium [add/del/list] - Manage premium
┠─ ▢ /admin [add/del] - Manage admins
┠─ ▢ /stats - Show bot statistics
┠─ ▢ /bc - Broadcast message
┠─ ▢ /bcstatus - Check broadcast status
┠─ ▢ /bclist - List all users
┠─ ▢ /setconfig - Configure channels
├ 
└`;
                }
                
                await ctx.reply(helpText, { parse_mode: 'Markdown' });
                break;
            }

            default:
                break;
        }
    } catch (err) {
        try {
            await ctx.reply(`❌ Internal Error\nPlease try again later`, { parse_mode: 'HTML' });
        } catch {
            // ignore
        }
    }
});

ren.on('callback_query', async (ctx) => {
    try {
        const uid = ctx.from.id.toString();
        const callbackData = ctx.callbackQuery.data;
        
        if (callbackData === 'check_join') {
            const channels = Array.isArray(global.channels) ? global.channels : [];
            if (!channels.length) {
                await ctx.answerCallbackQuery("No channels configured");
                return;
            }
            
            const notJoined = [];
            
            for (const ch of channels) {
                try {
                    const member = await ctx.api.getChatMember(
                        `@${ch.username}`,
                        Number(uid)
                    );
                    
                    if (!member || member.status === 'left' || member.status === 'kicked') {
                        notJoined.push(ch);
                    }
                } catch {
                    notJoined.push(ch);
                }
            }
            
            if (notJoined.length === 0) {
                joinCache.set(uid, true);
                joinCheckCache.set(`join_${uid}`, true, 3600);
                await ctx.answerCallbackQuery("✅ Success! You can now use the bot.");
                
                try {
                    const mainMenuCaption = `<pre>𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨</pre>

📃 bots specifically designed for <b>bugs via WhatsApps</b>, welcome to <b>e.x.e both</b>, use bots wisely and responsibly, <b>enjoy!!</b>

┌──────
├─── 𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /
├ 
└

<i> select the button below </i>`;
                    
                    const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "𝗉𝖺𝗂𝗋 - 𝗆𝖾𝗇𝗎", callback_data: "pair_menu" },
                            { text: "𝗉𝗋𝖾𝗆𝗂𝗎𝗆 - 𝗆𝖾𝗇𝗎", callback_data: "premium_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ],
                    ]
                    };
                    
                    await editMessageWithPhoto(ctx, uid, mainMenuCaption, replyMarkup);
                } catch (error) {
                    console.error('Callback check_join error:', error);
                    const fallbackText = `𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨

📃 bots specifically designed for bugs via WhatsApps, welcome to e.x.e both, use bots wisely and responsibly, enjoy!!

┌──────
├─── 𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /
├ 
└

select the button below`;
                    
                    const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "𝗉𝖺𝗂𝗋 - 𝗆𝖾𝗇𝗎", callback_data: "pair_menu" },
                            { text: "𝗉𝗋𝖾𝗆𝗂𝗎𝗆 - 𝗆𝖾𝗇𝗎", callback_data: "premium_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ],
                    ]
                    };
                    
                    await editMessageText(ctx, uid, fallbackText, replyMarkup);
                }
            } else {
                await ctx.answerCallbackQuery("❌ You haven't joined all channels yet!");
            }
            return;
        }
        
        if (callbackData === 'pair_menu') {
            if (blockIfNoAccess(ctx, uid) && !isFreeMode()) {
                await ctx.answerCallbackQuery("Access denied! Premium required.");
                return;
            }
            
            try {
                const pairMenuCaption = `<pre>𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨</pre>

📟 <b>𝖢𝗈𝗇𝗇𝖾𝖼𝗍𝗂𝗈𝗇 𝗆𝖾𝗇𝗎</b>, 𝗎𝗌𝖾 𝗍𝗁𝖾 𝖼𝗈𝗆𝗆𝖺𝗇𝖽 𝖻𝖾𝗅𝗈𝗐 𝗍𝗈 𝖼𝗈𝗇𝗇𝖾𝖼𝗍 𝗍𝗁𝖾 𝖶𝖠 𝖻𝗈𝗍, <b>𝗆𝖺𝗑𝗂𝗆𝗎𝗆 𝗂𝗌 3 𝗇𝗎𝗆𝖻𝖾𝗋𝗌</b>

┌──────
├─── Pair 𝖡𝗈𝗍𝗁
┠─ ▢ /addbot +12345678910
┠─ ▢ /delbot +123455678910
┠─ ▢ /mybot
├ 
└

<i> © dexline - exe!.</i>`;
                
                const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "back!.", callback_data: "back_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ]
                    ]
                };
                
                await editMessageWithPhoto(ctx, uid, pairMenuCaption, replyMarkup);
                await ctx.answerCallbackQuery();
            } catch (error) {
                console.error('Pair menu error:', error);
                const fallbackText = `𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨

📟 CONNECTION MENU, use the command below to connect the WA bot, maximum is 3 numbers

┌──────
├─── Pair 𝖡𝗈𝗍𝗁
┠─ ▢ /addbot +12345678910
┠─ ▢ /delbot +123455678910
┠─ ▢ /mybot
├ 
└

© dexline - exe!.`;
                
                const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "back!.", callback_data: "back_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ]
                    ]
                };
                
                await editMessageText(ctx, uid, fallbackText, replyMarkup);
                await ctx.answerCallbackQuery();
            }
            
        } else if (callbackData === 'back_menu') {
            try {
                const mainMenuCaption = `<pre>𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨</pre>

📃 bots specifically designed for <b>bugs via WhatsApps</b>, welcome to <b>e.x.e both</b>, use bots wisely and responsibly, <b>enjoy!!</b>

┌──────
├─── 𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /
├ 
└

<i> select the button below </i>`;

                
                const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "𝗉𝖺𝗂𝗋 - 𝗆𝖾𝗇𝗎", callback_data: "pair_menu" },
                            { text: "𝗉𝗋𝖾𝗆𝗂𝗎𝗆 - 𝗆𝖾𝗇𝗎", callback_data: "premium_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ],
                    ]
                };
                
                await editMessageWithPhoto(ctx, uid, mainMenuCaption, replyMarkup);
                await ctx.answerCallbackQuery();
            } catch (error) {
                console.error('Back menu error:', error);
                const fallbackText = `𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨

📃 bots specifically designed for bugs via WhatsApps, welcome to e.x.e both, use bots wisely and responsibly, enjoy!!

┌──────
├─── 𝖨𝗇𝖿𝗈 𝖡𝗈𝗍𝗁
┠─ ▢ 𝖽𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋: 𝗍.𝗆𝖾/𝖽𝖾𝗑𝗈𝖿𝖿𝖼
┠─ ▢ 𝗏𝖾𝗋𝗌𝗂𝗈𝗇: 2.0
┠─ ▢ 𝗉𝗋𝖾𝖿𝗂𝗑: /
├ 
└

select the button below`;
                
                const replyMarkup = {
                    inline_keyboard: [
                        [
                            { text: "𝗉𝖺𝗂𝗋 - 𝗆𝖾𝗇𝗎", callback_data: "pair_menu" },
                            { text: "𝗉𝗋𝖾𝗆𝗂𝗎𝗆 - 𝗆𝖾𝗇𝗎", callback_data: "premium_menu" }
                        ],
                        [
                            { text: "𝗈𝗐𝗇𝖾𝗋 - 𝖻𝗈𝗍𝗁", url: "https://t.me/dexoffc" }
                        ],
                    ]
                };
                
                await editMessageText(ctx, uid, fallbackText, replyMarkup);
                await ctx.answerCallbackQuery();
            }
            
        } else if (callbackData === 'premium_menu') {
            try {
                const isPremiumUser = isPremium(uid);
                const isAdminUser = isAdmin(uid) || isOwner(uid);
                
                let premiumCaption = `<pre>𖣂᳟⤻𝐄͓͛𝐗𝐄 ( 𖣂 ) 𝐁͢𝐎𝐓ʺ⃜͜᭨</pre>

┌──────
├─── <b>Your Status:</b>
┠─ ▢ User ID: ${uid}
┠─ ▢ Premium: ${isPremiumUser ? '✅ Active' : '🔒 Not Active'}
┠─ ▢ Admin: ${isAdminUser ? '✅ Yes' : '❌ No'}
├ 
├─── <b>Available Commands:</b>
┠─ ▢ /mybot - List active sessions
┠─ ▢ /stats - Show bot statistics
├ 
└
`;
                
                if (isAdminUser) {
                    premiumCaption += `
• /mode [public/private] - Change bot mode
• /premium [add/del/list] - Manage premium
• /admin [add/del] - Manage admins
• /bc - Broadcast to all users
• /bcstatus - Check broadcast status
• /bclist - List all users`;
                }
                
                if (!isPremiumUser && !isFreeMode()) {
                    premiumCaption += `

<pre>📃 𝗣𝗿𝗲𝗺𝗶𝘂𝗺 𝗺𝗼𝗱𝗲 𝗮𝗰𝘁𝗶𝘃𝗲</pre>
<b>[ # ] 𝖯𝖱𝖨𝖢𝖤 𝖫𝖨𝖲𝖳 𝖠𝖢𝖢𝖤𝖲 𝖯𝖱𝖤𝖬</b>
  - $3 𝖴𝖲𝖣𝖳 - 30 𝖽𝖺𝗒 / 𝖬𝗈𝗇𝗍𝗁
  - $10 𝖴𝖲𝖣𝖳 - 𝖴𝗇𝗅𝗂𝗆𝗂𝗍𝖾𝖽 / 𝖫𝗂𝖿𝖾𝗍𝗂𝗆𝖾 
  - $30 𝖴𝖲𝖣𝖳 - 𝗇𝗈 𝖾𝗇𝖼𝗋𝗒𝗉𝗍 𝖿𝗂𝗅𝖾
  
<pre>Want to Upgrade Your Access</pre>
<b>Click the ORDER button below to buy</b>`;
                    
                    const replyMarkup = {
                        inline_keyboard: [
                            [
                                { text: "Order Premium", url: "https://t.me/dexoffc" }
                            ],
                            [
                                { text: "back!.", callback_data: "back_menu" }
                            ]
                        ]
                    };
                    
                    await editMessageText(ctx, uid, premiumCaption, replyMarkup);
                } else {
                    const replyMarkup = {
                        inline_keyboard: [
                            [
                                { text: "back!.", callback_data: "back_menu" }
                            ],
                            [
                                { text: "𝗉𝖺𝗂𝗋 - 𝗆𝖾𝗇𝗎", callback_data: "pair_menu" }
                            ]
                        ]
                    };
                    
                    await editMessageWithPhoto(ctx, uid, premiumCaption, replyMarkup);
                }
                await ctx.answerCallbackQuery();
            } catch (error) {
                console.error('Premium menu error:', error);
                await ctx.answerCallbackQuery("Error loading premium menu!");
            }
        }
        
    } catch (err) {
        console.error('Callback query handler error:', err);
        try {
            await ctx.answerCallbackQuery("Error occurred!");
        } catch (e) {
            console.error('Even answerCallbackQuery failed:', e);
        }
    }
});

ren.catch((err) => {
    log.error(`Global error: ${err.error?.message || err.message}`);
});

(async () => {
    try {
        console.log(chalk.cyan('─────────────────────────────────────────'));
        console.log(chalk.cyan('Starting SX BOT...'));
        console.log(chalk.cyan('─────────────────────────────────────────'));

        process.on('unhandledRejection', () => {});
        process.on('uncaughtException', () => {});

        const sessionFolders = fs.existsSync(sessionRoot)
            ? fs.readdirSync(sessionRoot)
            : [];

        if (sessionFolders.length > 0) {
            log.loading(`Found ${sessionFolders.length} saved WhatsApp session(s). Reconnecting...`);

           
            setTimeout(async () => {
                for (const userId of sessionFolders) {
                    try {
                        log.whatsapp(`Reconnecting WhatsApp session for user ${userId}`);
                        await initWhatsappForUser(userId, false);
                        await sleep(500); 
                    } catch (err) {
                       
                    }
                }
            }, 2000); 
        } else {
            log.info('No saved WhatsApp sessions found. Starting fresh.');
        }

        await ren.start({
            onStart: (info) => {
                console.log(chalk.green(`Telegram Bot started: @${info.username}`));
                console.log(chalk.green('Bot is ready and receiving updates'));
                console.log(chalk.cyan('─────────────────────────────────────────'));
                console.log(chalk.yellow(`Total Users: ${getTotalUsers()}`));
                console.log(chalk.yellow(`Broadcast System: ✅ Ready`));
            },
            allowed_updates: ['message', 'callback_query'],
            drop_pending_updates: true 
        });

    } catch (err) {
        console.error(chalk.red('FATAL ERROR'));
        console.error(err);
        process.exit(1);
    }
})();