// require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, DiscordAPIError, ActivityType } = require('discord.js');
const { token } = require('./config.json');

// create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], allowedMentions: { repliedUser: false } });

// scary exec zone
const { promisify } = require('node:util');
const { exec } = require('node:child_process');
const execPromise = promisify(exec);

// funny kernel string
const kernelversion = '6.13.3-arch1-1';

// silly statuses
const customStatus = [
    'still cleaning up the viruses that you had left',
    'powered by ffmpeg',
    'running on a i7-3770k',
    'feel free to donate https://ko-fi.com/danielah05',
    'written in x86 assembly',
    'https://moonlight-mod.github.io/',
    'try running steam in offline mode',
    'number 1 #nerd-room fan',
    'screaming in pain',
    'if this bot is ever offline my pc/internet died or im playing fortnite',
    'green is my pepper',
    'plural systems rock <3',
    'http://daniela.lol/',
    'this status is 33 characters long',
    'reiserfs: the last commit',
    `running ${kernelversion}`,
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
async function processVideo(videourl, message, video) {
    console.log('do fancy video conversion stuff');
    // currently uses crf 30, will probably remove eventually
    const result = await execPromise(`ffmpeg -y -i "${videourl}" -c:v h264 -crf 30 -c:a copy "./temp/${video}"`);
    if (result.stderr) {
        // console.log(`ffmpeg log:\n${result.stderr}`);
        console.log('ffmpeg has finished');
    }
}

// detect when a new message is posted and check if it has a video attached
client.on('messageCreate', async (message) => {
    // avoid reading videos posted by the bot
    if (message.author.bot) return;
    let videoindex = 0;
    let videoname = '';
    // video detection code (attachments)
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
            // check if file is actually a video or not, if it isnt, dont bother using ffprobe on it
            if (!(attachment.contentType.includes('video'))) {
                console.log('this attachment is not a video, ignoring');
                return;
            }
            console.log(`attachment type: ${attachment.contentType}`);
            console.log(`attachment size: ${attachment.size}`);
            console.log(`attachment spoiler: ${attachment.spoiler}`);
            console.log(`attachment proxyurl: ${attachment.proxyURL}`);

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
                    console.log(`replied "white flag" to message: ${message.url}`);
                    return;
                }
                console.log('a hevc video has hit the text channel');
                videoname = `${message.id}_h264_${videoindex}.mp4`;
                if (attachment.spoiler) {
                    console.log('make video spoilered');
                    videoname = `SPOILER_${message.id}_h264_${videoindex}.mp4`;
                }
                await processVideo(attachment.proxyURL, message, videoname);
                await message.reply({ content: '<a:s_:1341653443462299700><a:u_:1341653473095057481><a:c_:1341653485812187179><a:c_:1341653485812187179><a:e_:1341653495585177600><a:s_:1341653443462299700><a:s_:1341653443462299700><a:exma_:1341653538178203710>', files: [`./temp/${videoname}`] });
                console.log(`success! replied converted video to message: ${message.url}`);

                // clean up
                execPromise(`rm ./temp/${videoname}`);
            }
            else {
                console.log('not hevc, ignoring');
            }
            videoindex++;
        }
        catch (e) {
            // final video is too big to post
            if (e instanceof DiscordAPIError && e.code == 40005) {
                await message.reply('bummer, the final converted video ended up being too big to post :(');
                console.log(`failure! replied sad response to message: ${message.url}`);
                execPromise(`rm ./temp/${videoname}`);
            }
            console.error(e);
        }
    }
    for (const embed of message.embeds) {
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
            console.log(`embed found in ${message.url}`);

            // provider check, if its null that means the embedded link is a discord video
            if (!(embed.provider == null)) {
                console.log('embed is from a provider outside of discord, ignoring');
                return;
            }

            // if its not a video embed, give up or else our code errors
            if (!(embed.video)) {
                console.log('this embed is not a video, ignoring');
                return;
            };

            // fetch embed proxyurl and grab needed information out of it
            const response = (await fetch(embed.video.proxyURL, { method: 'HEAD', redirect: 'manual' }));
            const contentsize = await response.headers.get('content-length');
            const contenttype = await response.headers.get('content-type');
            // check message with regex to check if final video should be spoilered or not
            const spoilerregex = /\|\|.*https?:\/\/.*\|\|/s;
            const hasspoiler = spoilerregex.test(message.content);

            // check if file is actually a video or not, if it isnt, dont bother using ffprobe on it
            if (!(contenttype.includes('video'))) {
                console.log('this embed is not a video, ignoring');
                return;
            }

            console.log(`embed type: ${contenttype}`);
            console.log(`embed size: ${contentsize}`);
            console.log(`embed spoiler: ${hasspoiler}`);
            console.log(`embed proxyurl: ${embed.video.proxyURL}`);

            // ffprobe command to check if a video is hevc or not, if it isnt dont bother with video processing
            console.log('ffprobing to check codec...');
            const result = await execPromise(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${embed.video.proxyURL}"`);
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
                if (contentsize > fileSize) {
                    console.log('video is TOO big, lets fuck off');
                    await message.reply('this videos file size surpasses the maximum (non nitro) user file size limit, a conversion can unfortunately not be done :(');
                    console.log(`replied "white flag" to message: ${message.url}`);
                    return;
                }
                console.log('a hevc video has hit the text channel');
                videoname = `${message.id}_h264_${videoindex}.mp4`;
                if (hasspoiler) {
                    console.log('make video spoilered');
                    videoname = `SPOILER_${message.id}_h264_${videoindex}.mp4`;
                }
                await processVideo(embed.video.proxyURL, message, videoname);
                await message.reply({ content: '<a:s_:1341653443462299700><a:u_:1341653473095057481><a:c_:1341653485812187179><a:c_:1341653485812187179><a:e_:1341653495585177600><a:s_:1341653443462299700><a:s_:1341653443462299700><a:exma_:1341653538178203710>', files: [`./temp/${videoname}`] });
                console.log(`success! replied converted video to message: ${message.url}`);

                // clean up
                execPromise(`rm ./temp/${videoname}`);
            }
            else {
                console.log('not hevc, ignoring');
            }
            videoindex++;
        }
        catch (e) {
            // final video is too big to post
            if (e instanceof DiscordAPIError && e.code == 40005) {
                await message.reply('bummer, the final converted video ended up being too big to post :(');
                console.log(`failure! replied sad response to message: ${message.url}`);
                execPromise(`rm ./temp/${videoname}`);
            }
            console.error(e);
        }
    }
});

// log in with bot token
client.login(token);

