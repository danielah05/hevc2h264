// require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, DiscordAPIError, ActivityType, PermissionsBitField } = require('discord.js');

// require fs for file deletion
const fs = require('fs');
const fsPromises = fs.promises;

// create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], allowedMentions: { repliedUser: false } });

// scary exec zone
const { promisify } = require('node:util');
const { exec } = require('node:child_process');
const execPromise = promisify(exec);

// bot specific files
const { token } = require('./config.json');
const customStatus = require('./status.json');

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

    // create temp folder if it doesnt exist already
    if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');

    setInterval(() => {
        client.user.setActivity(customStatus[Math.floor(Math.random() * customStatus.length)], {
            type: ActivityType.Custom,
        });
    }, 60000);
});

// ffprobe code
async function ffprobeVideo(videourl, contentsize, message, fileSize, videoindex, hasspoiler) {
    // ffprobe command to check if a video is hevc or not, if it isnt dont bother with video processing
    console.log('ffprobing to check codec...');
    const result = await execPromise(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videourl}"`);
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
            // message react to indicate that the video is too big to try to convert
            await message.react('<:exclamation:1348456255051661403>');
            console.log(`reacted "white flag" to message: ${message.url}`);
            return;
        }
        console.log('a hevc video has hit the text channel');
        // message react with cog to indicate the bot is processing video
        await message.react('<:cog:1348456247510302780>');
        videoname = `${message.id}_h264_${videoindex}.mp4`;
        if (hasspoiler) {
            console.log('make video spoilered');
            videoname = `SPOILER_${message.id}_h264_${videoindex}.mp4`;
        }
        await processVideo(videourl, message, videoname);
        // remove cog react and react with green tick to indicate conversion was successful
        await message.reactions.cache.get('1348456247510302780').remove();
        await message.react('<:tick:1348456270256144394>');
        // await message.reply({ content: '<a:s_:1341653443462299700><a:u_:1341653473095057481><a:c_:1341653485812187179><a:c_:1341653485812187179><a:e_:1341653495585177600><a:s_:1341653443462299700><a:s_:1341653443462299700><a:exma_:1341653538178203710>', files: [`./temp/${videoname}`] });
        await message.reply({ files: [`./temp/${videoname}`] });
        console.log(`success! replied converted video to message: ${message.url}`);

        // clean up
        await fsPromises.rm(`./temp/${videoname}`);
    }
    else {
        console.log('not hevc, ignoring');
    }
}

// process video code
async function processVideo(videourl, message, video) {
    console.log('do fancy video conversion stuff');
    // currently uses crf 30, will probably remove eventually
    const result = await execPromise(`ffmpeg -y -i "${videourl}" -c:v h264 -crf 30 -c:a copy "./temp/${video}"`);
    if (result.stderr) {
        console.log('ffmpeg has finished');
    }
}

// detect when a new message is posted and check if it has a video attached
client.on('messageCreate', async (message) => {
    // check channel permission to see if we can send anything
    if (!(message.channel.permissionsFor(client.user).has(PermissionsBitField.Flags.SendMessages))) return;
    // avoid reading videos posted by the bot
    if (message.author.bot) return;

    // video index number and video name
    let videoindex = 0;
    let videoname;

    // discord bots are restricted by the same file size upload limitation as regular users (10mb)
    let fileSize = 10485670;
    // this code is to detect the current discord servers boost level, if its 2 or 3 we can work with higher file sizes (50mb, 100mb)
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

    // video detection code (attachments)
    for (const attachment of message.attachments.values()) {
        try {
            console.log('\n\n');
            console.log(`attachment found in ${message.url}`);
            console.log(`attachment type: ${attachment.contentType}`);
            // check if file is actually a video or not, if it isnt, dont bother using ffprobe on it
            if (attachment.contentType == null || !(attachment.contentType.includes('video'))) {
                console.log('this attachment is not a video, ignoring');
                return;
            }
            const hasspoiler = attachment.spoiler;
            console.log(`attachment size: ${attachment.size}`);
            console.log(`attachment spoiler: ${hasspoiler}`);
            console.log(`attachment url: ${attachment.url}`);

            // ffprobe command to check if a video is hevc or not, if it isnt dont bother with video processing
            await ffprobeVideo(attachment.url, attachment.size, message, fileSize, videoindex, hasspoiler);

            videoindex++;
        }
        catch (e) {
            // final video is too big to post
            if (e instanceof DiscordAPIError && e.code == 40005) {
                // unreact cog and react with x to indicate bot failed to post video due to file size
                await message.reactions.cache.get('1348456247510302780').remove();
                await message.react('<:cancel:1348456236118573126>');
                console.log(`failure! replied sad response to message: ${message.url}`);
                await fsPromises.rm(`./temp/${videoname}`);
            }
            console.error(e);
        }
    }
    // video detection code (embeds)
    for (const embed of message.embeds) {
        try {
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

            // fetch embed url and grab needed information out of it
            const response = (await fetch(embed.video.url, { method: 'HEAD', redirect: 'manual' }));
            const contentsize = await response.headers.get('content-length');
            const contenttype = await response.headers.get('content-type');
            // check message with regex to check if final video should be spoilered or not
            const spoilerregex = /\|\|.*https?:\/\/.*\|\|/s;
            const hasspoiler = spoilerregex.test(message.content);

            console.log(`embed type: ${contenttype}`);
            console.log(`embed size: ${contentsize}`);
            console.log(`embed spoiler: ${hasspoiler}`);
            console.log(`embed url: ${embed.video.url}`);

            // ffprobe command to check if a video is hevc or not, if it isnt dont bother with video processing
            await ffprobeVideo(embed.video.url, contentsize, message, fileSize, videoindex, hasspoiler);

            videoindex++;
        }
        catch (e) {
            // final video is too big to post
            if (e instanceof DiscordAPIError && e.code == 40005) {
                // unreact cog and react with x to indicate bot failed to post video due to file size
                await message.reactions.cache.get('1348456247510302780').remove();
                await message.react('<:cancel:1348456236118573126>');
                console.log(`failure! replied sad response to message: ${message.url}`);
                await fsPromises.rm(`./temp/${videoname}`);
            }
            console.error(e);
        }
    }
});

// log in with bot token
client.login(token);

