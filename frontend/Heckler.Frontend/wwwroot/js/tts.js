window.audioCache = {};
window.activeAudio = null;

window.prefetchJokeAudio = function(jokeId) {
    if (window.audioCache[jokeId]) return;
    
    var audio = new Audio('/api/jokes/' + jokeId + '/audio');
    audio.preload = 'auto';
    audio.load();
    window.audioCache[jokeId] = audio;
};

window.speakJoke = function(jokeId, dotNetHelper) {
    // If audio is already playing, interrupt it first
    if (window.activeAudio) {
        try {
            window.activeAudio.pause();
            window.activeAudio.onended = null;
        } catch(e) {}
    }

    var audio = window.audioCache[jokeId] || new Audio('/api/jokes/' + jokeId + '/audio');
    window.activeAudio = audio;
    
    var cleanup = function() {
        if (window.activeAudio === audio) {
            window.activeAudio = null;
        }
        delete window.audioCache[jokeId];
        dotNetHelper.invokeMethodAsync('AudioEndedCallback');
    };

    audio.onended = cleanup;
    
    audio.onerror = function(e) {
        console.error("Audio playback error:", e);
        cleanup();
    };
    
    // Connect to visualizer
    if (window.audioCtx && window.analyser) {
        try {
            var source = window.audioCtx.createMediaElementSource(audio);
            source.connect(window.analyser);
            window.analyser.connect(window.audioCtx.destination);
        } catch(e) {}
    }

    audio.play().catch(function(e) {
        console.error("Audio play error:", e);
        cleanup();
    });
};

window.initTTS = function() {
    window.audioCache = {};
    
    // Play a tiny silent audio to unlock AudioContext in browsers
    try {
        var silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        silentAudio.play().catch(function(){});
        
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.analyser = window.audioCtx.createAnalyser();
        window.analyser.fftSize = 256;
        var bufferLength = window.analyser.frequencyBinCount;
        var dataArray = new Uint8Array(bufferLength);
        
        function updateVisualizer() {
            requestAnimationFrame(updateVisualizer);
            window.analyser.getByteFrequencyData(dataArray);
            var sum = 0;
            for(var i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            var average = sum / bufferLength;
            // Set a CSS variable on the body so the UI can react
            document.body.style.setProperty('--audio-level', (average / 255));
        }
        updateVisualizer();
        
    } catch(e) {}
};

// Extension: manual interrupt of TTS audio streams
if (!window.audioSentiment) {
    window.audioSentiment = {};
}
window.audioSentiment.interruptPlayback = function() {
    if (window.activeAudio) {
        try {
            window.activeAudio.pause();
            // Nullify onended callback to prevent double trigger of next joke sequence
            window.activeAudio.onended = null;
        } catch(e) {}
        window.activeAudio = null;
    }
};
