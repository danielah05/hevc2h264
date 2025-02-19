// require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, DiscordAPIError, ActivityType } = require('discord.js');
const { token } = require('./config.json');

// create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], allowedMentions: { repliedUser: false } });

// scary exec zone
const { promisify } = require('node:util');
const { exec } = require('node:child_process');
const execPromise = promisify(exec);

// silly statuses
const customStatus = [
    'still cleaning up the viruses that you had left',
    'powered by ffmpeg',
    'running on a i7-3770k',
    'give me money so this bot process shit faster https://ko-fi.com/danielah05',
    'written in x86 assembly',
    'https://moonlight-mod.github.io/',
    'try running steam in offline mode',
    'number 1 #nerd-room fan',
    'screaming in pain',
    'if this bot is ever offline my pc/internet died or im playing fortnite',
];

// bot boot message
client.once(Events.ClientReady, readyClient => {
	console.log(`
██╗  ██╗███████╗██╗   ██╗ ██████╗██████╗ ██╗  ██╗██████╗  ██████╗ ██╗  ██╗
██║  ██║██╔════╝██║   ██║██╔════╝╚════██╗██║  ██║╚════██╗██╔════╝ ██║  ██║
███████║█████╗  ██║   ██║██║      █████╔╝███████║ █████╔╝███████╗ ███████║
██╔══██║██╔══╝  ╚██╗ ██╔╝██║     ██╔═══╝ ██╔══██║██╔═══╝ ██╔═══██╗╚════██║
██║  ██║███████╗ ╚████╔╝ ╚██████╗███████╗██║  ██║███████╗╚██████╔╝     ██║
╚═╝  ╚═╝╚══════╝  ╚═══╝   ╚═════╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝      ╚═╝
             still cleaning up the viruses that you had left\n
logged in as ${readyClient.user.tag}`);

    setInterval(() => {
        client.user.setActivity(customStatus[Math.floor(Math.random() * customStatus.length)], {
            type: ActivityType.Custom,
        });
    }, 60000);
});

// process video code
async function processVideo(videourl, message, attachment) {
    console.log('do fancy video conversion stuff');
    // currently uses crf 30, will probably remove eventually
    const result = await execPromise(`ffmpeg -y -i "${videourl}" -c:v h264 -crf 30 -c:a copy "./temp/${attachment.name.replaceAll('"', '\\"')}"`);
    if (result.stderr) {
        // console.log(`ffmpeg log:\n${result.stderr}`);
        console.log('ffmpeg has finished');
    }
}

// detect when a new message is posted and check if it has a video attached
client.on('messageCreate', async (message) => {
    // avoid reading videos posted by the bot
    if (message.author.bot) return;
    // video detection code
    for (const attachment of message.attachments.values()) {
        try {
            // file size magic stuff! dont bother converting a video if its too big in the first place!
            let fileSize = 10485670;
            // this code is to detect the current discord servers boost level, if its 2 or 3 we can work with a higher file size
            if (message.guild) {
                switch (message.guild.premiumTier) {
                    case 2:
                        fileSize = 52428800;
                        break;
                    case 3:
                        fileSize = 104857600;
                        break;
                }
            }

            console.log('\n\n');
            console.log(`attachment found in ${message.url}`);
            console.log(`attachment type: ${attachment.contentType}`);
            console.log(`attachment size: ${attachment.size}`);
            console.log(`attachment proxyurl: ${attachment.proxyURL}`);
            // check if file is actually a video or not, if it isnt, dont bother using ffprobe on it
            if (!(attachment.contentType.includes('video'))) {
                console.log('this attachment is not a video, ignoring');
                return;
            }
            // ffprobe command to check if a video is hevc or not, if it isnt dont bother with video processing
            console.log('ffprobing to check codec...');
            const result = await execPromise(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${attachment.proxyURL}"`);
            if (result.error) {
                console.log(`error: ${result.error.message}`);
                return;
            }
            if (result.stderr) {
                console.log(`stderr: ${result.stderr}`);
                return;
            }
            // video is hevc? time to do some ffmpeg magic
            if (result.stdout.includes('hevc')) {
                if (attachment.size > fileSize) {
                    console.log('video is TOO big, lets fuck off');
                    await message.reply('this videos file size surpasses the maximum (non nitro) user file size limit, a conversion can unfortunately not be done :(');
                    console.log(`replied "white flag" to message: "${message.url}"`);
                    return;
                }
                console.log('a hevc video has hit the text channel');
                await processVideo(attachment.proxyURL, message, attachment);
                await message.reply({ content: '<a:s_:1341653443462299700><a:u_:1341653473095057481><a:c_:1341653485812187179><a:c_:1341653485812187179><a:e_:1341653495585177600><a:s_:1341653443462299700><a:s_:1341653443462299700><a:exma_:1341653538178203710>', files: [`./temp/${attachment.name}`] });
                console.log(`success! replied converted video to message: "${message.url}"`);

                // clean up
                execPromise(`rm ./temp/${attachment.name}`);
            }
            else {
                console.log('not hevc, ignoring');
                return;
            }
        }
        catch (e) {
            // final video is too big to post
            if (e instanceof DiscordAPIError && e.code == 40005) {
                await message.reply('bummer, the final converted video ended up being too big to post :(');
                console.log(`failure! replied sad response to message: "${message.url}"`);
                execPromise(`rm ./temp/${attachment.name}`);
            }
            console.error(e);
        }
    }
});

// log in with bot token
client.login(token);

