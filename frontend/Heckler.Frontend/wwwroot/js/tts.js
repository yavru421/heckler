window.audioCache = {};

window.prefetchJokeAudio = function(jokeId) {
    if (window.audioCache[jokeId]) return;
    
    var audio = new Audio('/api/jokes/' + jokeId + '/audio');
    audio.preload = 'auto';
    audio.load();
    window.audioCache[jokeId] = audio;
};

window.speakJoke = function(jokeId, dotNetHelper) {
    var audio = window.audioCache[jokeId] || new Audio('/api/jokes/' + jokeId + '/audio');
    
    var cleanup = function() {
        delete window.audioCache[jokeId];
        dotNetHelper.invokeMethodAsync('AudioEndedCallback');
    };

    audio.onended = cleanup;
    
    audio.onerror = function(e) {
        console.error("Audio playback error:", e);
        cleanup();
    };
    
    audio.play().catch(function(e) {
        console.error("Audio play error:", e);
        cleanup();
    });
};

window.initTTS = function() {
    // Initialize empty audio cache
    window.audioCache = {};
    
    // Play a tiny silent audio to unlock AudioContext in browsers
    try {
        var silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        silentAudio.play().catch(function(){});
    } catch(e) {}
};
