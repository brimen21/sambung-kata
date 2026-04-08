require("dotenv").config()

const { 
Client,
GatewayIntentBits,
SlashCommandBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
EmbedBuilder,
Events,
ChannelType,
AttachmentBuilder
} = require("discord.js")

const fs = require("fs")

const TOKEN = process.env.TOKEN

/* =========================
DATABASE SYSTEM
========================= */

const DB_FOLDER = "./database"

if(!fs.existsSync(DB_FOLDER)){
fs.mkdirSync(DB_FOLDER)
}

const LOG_DB = DB_FOLDER + "/logs.json"
const PLAYER_DB = DB_FOLDER + "/players.json"
const GAME_DB = DB_FOLDER + "/games.json"

if(!fs.existsSync(LOG_DB)) fs.writeFileSync(LOG_DB,"[]")
if(!fs.existsSync(PLAYER_DB)) fs.writeFileSync(PLAYER_DB,"{}")
if(!fs.existsSync(GAME_DB)) fs.writeFileSync(GAME_DB,"[]")

function readJSON(path){
return JSON.parse(fs.readFileSync(path))
}

function writeJSON(path,data){
fs.writeFileSync(path,JSON.stringify(data,null,2))
}

function saveLog(type,data={}){

const logs = readJSON(LOG_DB)

logs.push({
time:new Date().toISOString(),
type,
data
})

writeJSON(LOG_DB,logs)

}

function updatePlayer(id,win=false){

const players = readJSON(PLAYER_DB)

if(!players[id]){
players[id] = {
games:0,
wins:0,
lose:0
}
}

players[id].games++

if(win) players[id].wins++
else players[id].lose++

writeJSON(PLAYER_DB,players)

}

function saveGame(data){

const games = readJSON(GAME_DB)

games.push({
time:new Date().toISOString(),
...data
})

writeJSON(GAME_DB,games)

}

/* =========================
TRANSCRIPT SYSTEM
========================= */

const transcripts = new Map()

function addTranscript(channelId,user,msg){

if(!transcripts.has(channelId)){
transcripts.set(channelId,[])
}

transcripts.get(channelId).push({
time: new Date().toISOString().replace("T"," ").split(".")[0],
user,
msg
})

}

function generateTranscript(channel,guild){

const data = transcripts.get(channel.id) || []

let text = `TRANSCRIPT FOR ${channel.name}\n`
text += `Server: ${guild.name}\n`
text += `Generated: ${new Date().toISOString()}\n\n`

for(const m of data){
text += `[${m.time}] ${m.user}: ${m.msg}\n`
}

return text
}

/* =========================
CLIENT
========================= */

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
})

/* =========================
LOAD KBBI
========================= */

const kbbiData = JSON.parse(
fs.readFileSync("./kbbi_73000.json")
)

const kbbi = new Set(kbbiData.words.map(w=>w.toLowerCase()))

/* =========================
MULTI GAME STORAGE
========================= */

const games = new Map()

function createGame(channelId){
return {
active:false,
player1:null,
player2:null,
turn:null,
lastLetter:null,
used:[],
timer:null,
channel:channelId,
round:1,
wrong:{},
life:{}
}
}

/* =========================
UTILITY
========================= */

function randomLetter(){
const huruf="abcdefghijklmnopqrstuvwxyz"
return huruf[Math.floor(Math.random()*huruf.length)]
}

function kataValid(word){
return kbbi.has(word.toLowerCase())
}

function ambilHuruf(word,round){
let max = Math.min(3, Math.floor(round/3)+1)
let jumlah = Math.floor(Math.random()*max)+1
return word.slice(-jumlah)
}

function aiWord(letter,used){
const list = kbbiData.words.filter(
w=>w.startsWith(letter) && !used.includes(w)
)
if(list.length===0) return null
return list[Math.floor(Math.random()*list.length)]
}

/* =========================
READY
========================= */

client.once("clientReady",async()=>{

console.log("🎮 SAMBUNG KATA ONLINE")

const cmd = new SlashCommandBuilder()
.setName("sambungkata")
.setDescription("Buka menu game sambung kata")

await client.application.commands.set([cmd])

})

/* =========================
SLASH COMMAND
========================= */

client.on(Events.InteractionCreate, async interaction=>{

if(!interaction.isChatInputCommand()) return

if(interaction.commandName==="sambungkata"){

const row = new ActionRowBuilder()
.addComponents(
new ButtonBuilder()
.setCustomId("create_game")
.setLabel("🎮 Create Game Channel")
.setStyle(ButtonStyle.Success)
)

const embed = new EmbedBuilder()
.setColor("Blue")
.setTitle("🎮 GAME SAMBUNG KATA")
.setDescription(`
Klik tombol di bawah untuk membuat channel game.

Mode tersedia:
👥 Player vs Player
🤖 Player vs AI
𝐵𝑦𝐹𝑖𝑖𝐶𝑟𝑢𝑧ℎ
`)

await interaction.reply({
embeds:[embed],
components:[row]
})

}

})

/* =========================
BUTTON SYSTEM
========================= */

client.on(Events.InteractionCreate, async interaction=>{

if(!interaction.isButton()) return

/* CREATE GAME */

if(interaction.customId==="create_game"){

await interaction.deferReply({ flags:64 })

const channel = await interaction.guild.channels.create({
name:`sambungkata-${interaction.user.username}`,
type:ChannelType.GuildText,
parent:"1480481879135092808"
})

saveLog("GAME_CREATED",{user:interaction.user.tag})

transcripts.set(channel.id,[])

const game = createGame(channel.id)
games.set(channel.id,game)

const row = new ActionRowBuilder()
.addComponents(
new ButtonBuilder()
.setCustomId("join")
.setLabel("👥 Join Game")
.setStyle(ButtonStyle.Success),

new ButtonBuilder()
.setCustomId("ai")
.setLabel("🤖 Lawan AI")
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("close_channel")
.setLabel("❌ Close Game")
.setStyle(ButtonStyle.Danger)
)

const embed = new EmbedBuilder()
.setColor("Green")
.setTitle("🎮 Game Sambung Kata")
.setDescription("Klik tombol untuk bergabung ke game.")

await channel.send({
embeds:[embed],
components:[row]
})

await interaction.editReply({
content:`✅ Channel game dibuat: ${channel}`
})

}

/* JOIN GAME */

if(interaction.customId==="join"){

const game = games.get(interaction.channel.id)
if(!game) return

await interaction.deferReply()

saveLog("PLAYER_JOIN",{user:interaction.user.tag})

if(!game.player1){

game.player1=interaction.user.id
return interaction.editReply("✅ Player 1 joined")

}

if(!game.player2){

game.player2=interaction.user.id

game.life[game.player1]=3
game.life[game.player2]=3

game.active=true
game.turn=game.player1
game.lastLetter=randomLetter()

const embed = new EmbedBuilder()
.setColor("Yellow")
.setTitle("🎮 Game Dimulai")
.setDescription(`
Huruf awal: **${game.lastLetter}**

❤️ Nyawa: 3
Giliran: <@${game.turn}>
`)

await interaction.editReply({embeds:[embed]})

startTimer(game,interaction.channel)

}

}

/* AI MODE */

if(interaction.customId==="ai"){

const game = games.get(interaction.channel.id)
if(!game) return

await interaction.deferReply()

game.player1=interaction.user.id
game.player2="AI"

game.life[game.player1]=3
game.active=true
game.turn=interaction.user.id
game.lastLetter=randomLetter()

const embed = new EmbedBuilder()
.setColor("Purple")
.setTitle("🤖 Mode AI")
.setDescription(`
Huruf awal: **${game.lastLetter}**

❤️ Nyawa: 3
Waktu menjawab: 20 detik
`)

await interaction.editReply({embeds:[embed]})

startTimer(game,interaction.channel)

}

/* CLOSE CHANNEL */

if(interaction.customId==="close_channel"){

const text = generateTranscript(interaction.channel,interaction.guild)
const fileName = `transcript-${interaction.channel.name}.txt`
fs.writeFileSync(fileName,text)

const attachment = new AttachmentBuilder(fileName)

const logChannel = await client.channels.fetch("1480972420524278073")

logChannel.send({
content:`📁 Transcript Game SambungKata\nChannel: ${interaction.channel.name}`,
files:[attachment]
})

games.delete(interaction.channel.id)

await interaction.reply("🗑 Channel akan ditutup")

setTimeout(()=>{
interaction.channel.delete().catch(()=>{})
},2000)

}

})

/* =========================
GAME MESSAGE
========================= */

client.on("messageCreate", async msg=>{

const game = games.get(msg.channel.id)
if(!game) return
if(!game.active) return
if(msg.author.bot) return
if(msg.author.id!==game.turn) return

addTranscript(msg.channel.id,msg.author.tag,msg.content)

const word = msg.content.toLowerCase()

if(!word.startsWith(game.lastLetter))
return msg.reply(`❌ Kata harus mulai huruf **${game.lastLetter}**`)

if(!kataValid(word))
return msg.reply("❌ Kata tidak ada di KBBI")

if(game.used.includes(word))
return msg.reply("❌ Kata sudah dipakai")

game.used.push(word)

saveLog("WORD_PLAYED",{user:msg.author.tag,word})

game.lastLetter = ambilHuruf(word,game.round)

game.round++

clearTimeout(game.timer)

/* AI TURN */

if(game.player2==="AI"){

const ai = aiWord(game.lastLetter,game.used)

if(!ai){
endGame(game,msg.channel,msg.author.id)
return
}

game.used.push(ai)

addTranscript(msg.channel.id,"AI",ai)

game.lastLetter=ambilHuruf(ai,game.round)

const embed = new EmbedBuilder()
.setColor("Purple")
.setTitle("🤖 AI Menjawab")
.setDescription(`AI: **${ai}**`)

msg.channel.send({embeds:[embed]})

startTimer(game,msg.channel)

return

}

/* SWITCH PLAYER */

game.turn = game.turn===game.player1 ? game.player2 : game.player1

const embed = new EmbedBuilder()
.setColor("Orange")
.setTitle("🔄 Giliran")
.setDescription(`
Huruf berikutnya: **${game.lastLetter}**

Giliran: <@${game.turn}>
❤️ Nyawa: **${game.life[game.turn]}**
`)

msg.channel.send({embeds:[embed]})

startTimer(game,msg.channel)

})

/* =========================
TIMER
========================= */

function startTimer(game,channel){

clearTimeout(game.timer)

game.timer=setTimeout(()=>{

game.life[game.turn]--

channel.send(`
⏱ Waktu habis!

💔 <@${game.turn}> kehilangan 1 nyawa
❤️ Nyawa tersisa: **${game.life[game.turn]}**
`)

if(game.life[game.turn] <= 0){

channel.send(`💀 <@${game.turn}> kehabisan nyawa!`)

endGame(
game,
channel,
game.turn===game.player1?game.player2:game.player1
)

return
}

game.turn = game.turn===game.player1 ? game.player2 : game.player1

channel.send(`
🔄 Giliran berpindah

Huruf: **${game.lastLetter}**
Giliran: <@${game.turn}>
`)

startTimer(game,channel)

},20000)

}

/* =========================
END GAME
========================= */

function endGame(game,channel,winner){

game.active=false

saveLog("GAME_END",{winner})

saveGame({
winner,
channel:channel.name
})

if(game.player1!=="AI") updatePlayer(game.player1,winner===game.player1)
if(game.player2!=="AI") updatePlayer(game.player2,winner===game.player2)

const row = new ActionRowBuilder()
.addComponents(
new ButtonBuilder()
.setCustomId("close_channel")
.setLabel("🗑 Close Channel")
.setStyle(ButtonStyle.Danger)
)

const embed = new EmbedBuilder()
.setColor("Gold")
.setTitle("🏆 Game Selesai")
.setDescription(`<@${winner}> menang!`)

channel.send({
embeds:[embed],
components:[row]
})

clearTimeout(game.timer)

games.delete(channel.id)

}

/* =========================
LOGIN
========================= */

client.login(TOKEN)