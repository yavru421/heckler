let audioUnlocked = false;

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
        const silentAudio = new Audio();
        silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        silentAudio.play().then(() => silentAudio.pause()).catch(() => {});
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume();
    } catch (e) {}
}

window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('touchstart', unlockAudio, { once: true });
window.addEventListener('click', unlockAudio, { once: true });

let currentAudio = null;

window.audioInterop = {
    unlockAudio: function () {
        unlockAudio();
    },

    stopAllAudio: function() {
        if (currentAudio) {
            try { currentAudio.pause(); currentAudio = null; } catch(e) {}
        }
        if ('speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch(e) {}
        }
    },

    // Play MP3 audio cleanly over URL endpoint with content-type verification
    playAudioUrl: async function (url) {
        window.audioInterop.stopAllAudio();
        return new Promise(async (resolve) => {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const contentType = response.headers.get("content-type") || "";
                    if (contentType.includes("audio")) {
                        const blob = await response.blob();
                        if (blob && blob.size > 200) {
                            const objectUrl = URL.createObjectURL(blob);
                            const audio = new Audio(objectUrl);
                            currentAudio = audio;
                            audio.onended = () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                resolve(true);
                            };
                            audio.onerror = () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                resolve(false);
                            };
                            audio.play().then(() => {}).catch(() => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                resolve(false);
                            });
                            return;
                        }
                    }
                }
            } catch (err) {
                console.warn("Fetch audio endpoint failed:", err);
            }
            resolve(false);
        });
    },

    // Stream /api/tts directly over HTML5 Audio with Web Speech API fallback
    speakText: async function (text, isFemale = false) {
        window.audioInterop.stopAllAudio();
        return new Promise(async (resolve) => {
            try {
                const response = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });

                if (response.ok) {
                    const contentType = response.headers.get("content-type") || "";
                    if (contentType.includes("audio")) {
                        const blob = await response.blob();
                        if (blob && blob.size > 200) {
                            const objectUrl = URL.createObjectURL(blob);
                            const audio = new Audio(objectUrl);
                            currentAudio = audio;
                            audio.onended = () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                resolve(true);
                            };
                            audio.onerror = () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                resolve(false);
                            };
                            audio.play().then(() => {}).catch(() => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                resolve(false);
                            });
                            return;
                        }
                    }
                }
            } catch (err) {
                console.warn("/api/tts failed:", err);
            }

            // Web Speech API fallback
            if ('speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                    const cleanText = text.replace(/\[PAUSE(?::[0-9.]+)?\]/gi, " ").replace(/[#*$_[\](){}]/g, "").replace(/\s+/g, " ").trim();
                    const utterance = new SpeechSynthesisUtterance(cleanText);
                    utterance.rate = 1.0;
                    
                    const voices = window.speechSynthesis.getVoices();
                    if (voices && voices.length > 0) {
                        if (isFemale) {
                            const femaleVoice = voices.find(v => v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("samantha") || v.name.toLowerCase().includes("victoria") || v.name.toLowerCase().includes("karen") || v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("google us english"));
                            if (femaleVoice) utterance.voice = femaleVoice;
                        }
                    }

                    utterance.onend = () => resolve(true);
                    utterance.onerror = () => resolve(false);
                    window.speechSynthesis.speak(utterance);
                    return;
                } catch (e) {
                    console.warn("SpeechSynthesis failed:", e);
                }
            }

            resolve(false);
        });
    }
};
