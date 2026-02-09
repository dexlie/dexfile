const chalk = require('chalk')

/**
 * Log incoming messages / commands
 */
function logMessage({
    m,
    body,
    pushname,
    prefix,
    command
}) {
    const time = new Date().toLocaleString('id-ID')
    const chatType = m.isGroup ? 'GROUP' : 'PRIVATE'
    const chatId = m.chat
    const userId = m.sender
    const username = pushname || 'No Name'
    const messageType = m.mtype
    const messageText = command ? `${prefix}${command}` : body || '[NO TEXT]'

    console.log(
        '\n' +
        chalk.red.bold('┌─────────── NEW MESSAGE ───────────')
    )
    console.log(
        chalk.white('│ 🕒 Time      : ') +
        chalk.cyan(time)
    )
    console.log(
        chalk.white('│ 👤 Number   : ') +
        chalk.yellow(userId)
    )
    console.log(
        chalk.white('│ 🏷 Name  : ') +
        chalk.yellow(username)
    )
    console.log(
        chalk.white('│ 💬 Chat Type : ') +
        chalk.magenta(chatType)
    )
    console.log(
        chalk.white('│ 🆔 ChatID    : ') +
        chalk.magenta(chatId)
    )
    console.log(
        chalk.white('│ 🧩 Msg Type  : ') +
        chalk.blue(messageType)
    )
    console.log(
        chalk.white('│ ✉️ Message   : ') +
        chalk.green(messageText)
    )
    console.log(
        chalk.red.bold('└────────────────────────────────────\n')
    )
}

module.exports = {
    logMessage
}