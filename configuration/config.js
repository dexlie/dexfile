const fs = require('fs')

/* wa bot config */
global.connect = true
global.pub = true 
global.owner = ['123456789'] 
global.prefa = ['','!','.',',','🗿']

/* telegram bot config */
global.tokens = "8490363632:AAHY66FRZD5FyZLAlWx-uLXH7VO3V09L8Yo"
global.ownID = "5750404560";
global.channels = [  
    { name: "Main Channel", username: "offcialexe" },
    { name: "Group Chat", username: "exepublic" }
];

global.cooldown = {
    min: 5,
    max: 60,
    default: 30
};


global.ownerIDtoString = function() {
    return global.owner[0] || "5750404560";
};

let file = require.resolve(__filename)
require('fs').watchFile(file, () => { 
    require('fs').unwatchFile(file)
    console.log('\x1b[0;32m'+__filename+' \x1b[1;32mupdated!\x1b[0m')
    delete require.cache[file]
    require(file)
})