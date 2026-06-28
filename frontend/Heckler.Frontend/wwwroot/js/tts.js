window.speakJoke = function(text, dotNetHelper) {
    if (!('speechSynthesis' in window)) {
        setTimeout(function() {
            dotNetHelper.invokeMethodAsync('AudioEndedCallback');
        }, Math.max(3000, text.length * 50));
        return;
    }

    try {
        window.speechSynthesis.cancel(); // Clear any queued speech

        var msg = new SpeechSynthesisUtterance(text);
        var voices = [];
        try {
            voices = window.speechSynthesis.getVoices() || [];
        } catch (e) {
            console.error("Failed to get voices", e);
        }

        if (voices.length > 0) {
            var preferredVoice = voices.find(function(v) {
                return v && typeof v.lang === 'string' && v.lang.startsWith('en') && 
                    (v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Male') || v.name.includes('Guy') || v.name.includes('Brian'));
            });
            if (preferredVoice) {
                msg.voice = preferredVoice;
            }
        }

        msg.rate = 0.95;
        msg.pitch = 0.9;

        // Safety fallback timer to prevent infinite freezing if the browser refuses to speak or trigger events
        var durationEstimate = Math.max(4000, text.length * 75); // 75ms per character estimate
        var safetyTimeout = setTimeout(function() {
            console.warn("SpeechSynthesis timed out. Invoking fallback safety callback.");
            window.speechSynthesis.cancel();
            dotNetHelper.invokeMethodAsync('AudioEndedCallback');
        }, durationEstimate + 5000); // give 5 seconds buffer

        msg.onend = function() {
            clearTimeout(safetyTimeout);
            dotNetHelper.invokeMethodAsync('AudioEndedCallback');
        };

        msg.onerror = function(e) {
            console.error("SpeechSynthesis onerror fired:", e);
            clearTimeout(safetyTimeout);
            dotNetHelper.invokeMethodAsync('AudioEndedCallback');
        };

        window.speechSynthesis.speak(msg);

    } catch (err) {
        console.error("Error in speakJoke JS wrapper:", err);
        dotNetHelper.invokeMethodAsync('AudioEndedCallback');
    }
};

window.initTTS = function() {
    if ('speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
            var msg = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(msg);
        } catch(e) {
            console.error("Failed to init SpeechSynthesis", e);
        }
    }
};

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = function() {
        try {
            window.speechSynthesis.getVoices();
        } catch(e) {}
    };
}
