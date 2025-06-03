// require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, DiscordAPIError, ActivityType, PermissionsBitField, Partials } = require('discord.js');

// require fs for file deletion
const fs = require('fs');
const fsPromises = fs.promises;

// create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], allowedMentions: { repliedUser: false }, partials: [ Partials.Channel, Partials.Message ] });

// scary exec zone
const { promisify } = require('node:util');
const { exec } = require('node:child_process');
const execPromise = promisify(exec);

// bot specific files
const { token } = require('./config.json');
const customStatus = require('./status.json');

// video file specific stuff
const videoindex = 0;
let videoname = '';

// bot boot message
client.once(Events.ClientReady, readyClient => {
    const date = new Date();
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

    if (date.getMonth() == 5) {
        client.user.setActivity('happy pride month ❤️🏳️‍🌈🏳️‍⚧️', { type: ActivityType.Custom });
    }
    else if (date.getMonth() == 4 && date.getDay() == 23) {
        client.user.setActivity('happy schizophrenia awarness day ❤️', { type: ActivityType.Custom });
    }
    else {
        setInterval(() => {
            client.user.setActivity(customStatus[Math.floor(Math.random() * customStatus.length)], {
                type: ActivityType.Custom,
            });
        }, 60000);
    }
});

// add reaction
async function addReact(message, messageID, reactionID) {
    if (message.guild) {
        if (message.channel.permissionsFor(client.user).has(PermissionsBitField.Flags.AddReactions)) await messageID.react(reactionID);
    }
    else {
        await messageID.react(reactionID);
    }
}

// remove reaction
async function removeReact(message, messageID, reactionID) {
    // i do not think it is possible to remove reacts in a dm, i might be wrong on that but for now we only remove reacts in servers if we have permission
    if (message.guild) {
        if (message.channel.permissionsFor(client.user).has(PermissionsBitField.Flags.ManageMessages)) await messageID.reactions.cache.get(reactionID).remove();
    }
}

// attachment checking code
async function attachmentCheck(message, messageID, fileSize, videoIndex, doForce) {
    for (const attachment of message.attachments.values()) {
        try {
            console.log('\n\n');
            console.log(`attachment found in ${messageID.url}`);
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
            await ffprobeVideo(attachment.url, attachment.size, attachment.contentType, messageID, fileSize, videoIndex, hasspoiler, doForce);

            videoIndex++;
        }
        catch (e) {
            // final video is too big to post
            if (e instanceof DiscordAPIError && e.code == 40005) {
                // unreact cog and react with x to indicate bot failed to post video due to file size
                await removeReact(message, messageID, '1348456247510302780');
                await addReact(message, messageID, '<:cancel:1348456236118573126>');
                console.log(`failure! replied sad response to message: ${messageID.url}`);
                await fsPromises.rm(`./temp/${videoname}`);
            }
            // message no longer exists after video was processed
            else if (e instanceof DiscordAPIError && e.code == 10008) {
                console.log('the message was deleted before we could do anything :/, cleaning up');
                if (fs.existsSync(`./temp/${videoname}`)) await fsPromises.rm(`./temp/${videoname}`);
            }
            console.error(e);
        }
    }
}

// embed checking code
async function embedCheck(message, messageID, fileSize, videoIndex, doForce) {
    for (const embed of message.embeds) {
        try {
            console.log('\n\n');
            console.log(`embed found in ${messageID.url}`);

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
            const hasspoiler = spoilerregex.test(messageID.content);

            console.log(`embed type: ${contenttype}`);
            console.log(`embed size: ${contentsize}`);
            console.log(`embed spoiler: ${hasspoiler}`);
            console.log(`embed url: ${embed.video.url}`);

            // ffprobe command to check if a video is hevc or not, if it isnt dont bother with video processing
            await ffprobeVideo(embed.video.url, contentsize, contenttype, messageID, fileSize, videoIndex, hasspoiler, doForce);

            videoIndex++;
        }
        catch (e) {
            // final video is too big to post
            if (e instanceof DiscordAPIError && e.code == 40005) {
                // unreact cog and react with x to indicate bot failed to post video due to file size
                await removeReact(message, message, '1348456247510302780');
                await addReact(message, message, '<:cancel:1348456236118573126>');
                console.log(`failure! replied sad response to message: ${message.url}`);
                await fsPromises.rm(`./temp/${videoname}`);
            }
            // message no longer exists after video was processed
            else if (e instanceof DiscordAPIError && e.code == 10008) {
                console.log('the message was deleted before we could do anything :/, cleaning up');
                if (fs.existsSync(`./temp/${videoname}`)) await fsPromises.rm(`./temp/${videoname}`);
            }
            console.error(e);
        }
    }
}

// ffprobe code
async function ffprobeVideo(videourl, contentsize, contenttype, message, fileSize, videoIndex, hasspoiler, doForce) {
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

    // ik the entire point is to force convert, but also doing this would just be insanely silly and a waste of processing power
    if (contenttype.includes('mp4') && result.stdout.includes('h264') && doForce) {
        console.log('>using force on an mp4 h264 video');
        await message.reply({ files: ['./assets/kind message from daniela.mp3'] });
        return;
    }

    // video is hevc? (or we are force converting?) time to do some ffmpeg magic
    if (result.stdout.includes('hevc') || doForce) {
        if (contentsize > fileSize) {
            console.log('video is TOO big, lets fuck off');
            // message react to indicate that the video is too big to try to convert
            await addReact(message, message, '<:exclamation:1348456255051661403>');
            console.log(`reacted "white flag" to message: ${message.url}`);
            return;
        }
        console.log('a hevc video has hit the text channel');
        // message react with cog to indicate the bot is processing video
        addReact(message, message, '<:cog:1348456247510302780>');
        videoname = `${message.id}_h264_${videoIndex}.mp4`;
        if (hasspoiler) {
            console.log('make video spoilered');
            videoname = `SPOILER_${message.id}_h264_${videoIndex}.mp4`;
        }
        await processVideo(videourl, videoname);
        // remove cog react and react with green tick to indicate conversion was successful
        removeReact(message, message, '1348456247510302780');
        addReact(message, message, '<:tick:1348456270256144394>');
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
async function processVideo(videourl, video) {
    console.log('do fancy video conversion stuff');
    // currently uses crf 30, will probably remove eventually
    const result = await execPromise(`ffmpeg -y -i "${videourl}" -c:v h264 -crf 30 -c:a copy "./temp/${video}"`);
    if (result.stderr) {
        console.log('ffmpeg has finished');
    }
}

// detect when a new message is posted and check if it has a video attached
client.on('messageCreate', async (message) => {
    // avoid reading videos posted by the bot
    if (message.author.bot) return;

    // discord bots are restricted by the same file size upload limitation as regular users (10mb)
    let fileSize = 10485670;

    if (message.guild) {
        // check channel permission to see if we can send anything
        if (!(message.channel.permissionsFor(client.user).has(PermissionsBitField.Flags.SendMessages))) return;

        // this code is to detect the current discord servers boost level, if its 2 or 3 we can work with higher file sizes (50mb, 100mb)
        switch (message.guild.premiumTier) {
            case 2:
                fileSize = 52428800;
                break;
            case 3:
                fileSize = 104857600;
                break;
        }
    }

    // message command to force convert videos
    if (message.content == '^force') {
        console.log('\n\n');
        console.log(`force command used in ${message.url}`);

        // wrap this in a "try catch" cuz the way u fetch message stuff can cause errors
        try {
            // if a video was found all of this should execute fine
            const repliedTo = await message.channel.messages.fetch(message.reference.messageId);

            attachmentCheck(repliedTo, repliedTo, fileSize, videoindex, true);
            embedCheck(repliedTo, repliedTo, fileSize, videoindex, true);

            // forwarded message
            for (const snapshot of repliedTo.messageSnapshots.values()) {
                try {
                    // video detection (attachments)
                    attachmentCheck(snapshot, repliedTo, fileSize, videoindex, true);
                    // video detection (embeds)
                    embedCheck(snapshot, repliedTo, fileSize, videoindex, true);
                }
                catch (e) {
                    console.error(e);
                }
            }
            return;
        }
        catch {
            // nothing was found
            console.log('message was not replying to anything LOL');
            await message.reply('no video found, please reply to the video u want to forcefully convert by right clicking on the message, clicking reply and then send the command again');
            return;
        }
    }

    // timeout here, embeds fucking suck and theres a race condition pretty much which causes the bot to miss embeds sometimes, so we just wait 3 seconds (yes i know, thats a lot, but sometimes embeds take a bit) because i dont know how else to fix this
    await new Promise(resolve => setTimeout(resolve, 3000));
    // video detection (attachments)
    attachmentCheck(message, message, fileSize, videoindex, false);
    // video detection (embeds)
    embedCheck(message, message, fileSize, videoindex, false);

    // forwarded message
    for (const snapshot of message.messageSnapshots.values()) {
        try {
            // video detection (attachments)
            attachmentCheck(snapshot, message, fileSize, videoindex, false);
            // video detection (embeds)
            embedCheck(snapshot, message, fileSize, videoindex, false);
        }
        catch (e) {
            console.error(e);
        }
    }
});

// log in with bot token
client.login(token);

