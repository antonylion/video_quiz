let currentUrl; // Declare a variable to store the URL
let videoId;
let videoTranscripts;
let session;
let myPrompt;

function retrieveTranscript() {
    const YT_INITIAL_PLAYER_RESPONSE_RE =
        /ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s+(?:meta|head)|<\/script|\n)/;
    let player = window.ytInitialPlayerResponse;
    if (!player || videoId !== player.videoDetails.videoId) {
        fetch('https://www.youtube.com/watch?v=' + videoId)
            .then(function (response) {
                return response.text();
            })
            .then(function (body) {
                const playerResponse = body.match(YT_INITIAL_PLAYER_RESPONSE_RE);
                if (!playerResponse) {
                    console.warn('Unable to parse playerResponse');
                    return;
                }
                player = JSON.parse(playerResponse[1]);
                const metadata = {
                    title: player.videoDetails.title,
                    duration: player.videoDetails.lengthSeconds,
                    author: player.videoDetails.author,
                    views: player.videoDetails.viewCount,
                };
                // Get the tracks
                const tracks = player.captions.playerCaptionsTracklistRenderer.captionTracks;

                // Get the transcript
                fetch(tracks[0].baseUrl + '&fmt=json3')
                    .then(function (response) {
                        return response.json();
                    })
                    .then(function (transcript) {
                        const result = { transcript: transcript, metadata: metadata };

                        const parsedTranscript = transcript.events
                            // Remove invalid segments
                            .filter(function (x) {
                                return x.segs;
                            })

                            // Concatenate into single long string
                            .map(function (x) {
                                return x.segs
                                    .map(function (y) {
                                        return y.utf8;
                                    })
                                    .join(' ');
                            })
                            .join(' ')

                            // Remove invalid characters
                            .replace(/[\u200B-\u200D\uFEFF]/g, '')

                            // Replace any whitespace with a single space
                            .replace(/\s+/g, ' ');

                        //console.log('EXTRACTED_TRANSCRIPT', parsedTranscript);
                        videoTranscripts = parsedTranscript;
                    });
            });
    }
}

// Find the videoId of the YouTube video on the current page
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentTab = tabs[0]; // Get the active tab
    if (currentTab && currentTab.url) {
        currentUrl = currentTab.url; // Save the URL in the variable
        //console.log("Current URL:", currentUrl); // Log the URL to the console
        const urlObj = new URL(currentUrl);
        videoId = urlObj.searchParams.get('v');
        //console.log("Video ID:", videoId);

        // Call retrieveTranscript automatically once videoId is set
        if (videoId) {
            retrieveTranscript(); // Call the function
        } else {
            console.warn("No video ID found in the URL.");
        }
    } else {
        console.log("No active tab found or URL is unavailable.");
    }
});

// Define a function to create the session
async function createSession() {
    try {
        const newSession = await chrome.aiOriginTrial.languageModel.create({
            monitor(m) {
              m.addEventListener("downloadprogress", (e) => {
                console.log(`Downloaded ${e.loaded} of ${e.total} bytes.`);
              });
            },
          });          
        //console.log('Session created successfully:', session);
        return newSession; // Return the session if needed elsewhere
    } catch (error) {
        console.error('Error creating session:', error);
    }
}

// Define the function that will prompt the session and handle your logic
async function runSessionPrompt() {
    try {
        // Ensure the session is created before calling the prompt
        session = await createSession();  // Await the session creation
        console.log('Session:', session);
        
        const myPrompt = 'The following are the trascripts of a YouTube video. Can you ask me one specific question (without saying nothing else) about these transcripts to see if I correctly understood the video?' + videoTranscripts;
        
        // Now call the session.prompt with the prompt you want to pass
        const response = await session.prompt(myPrompt);  // Call the prompt method
        console.log(response);  // Log the response from the prompt

        // Insert the response into the HTML element with ID 'responseContainer'
        document.getElementById("responseContainer").innerHTML = response;
        
    } catch (error) {
        console.error('Error running session prompt:', error);
    }
}

runSessionPrompt();