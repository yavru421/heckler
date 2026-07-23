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

window.audioInterop = {
    unlockAudio: function () {
        unlockAudio();
    },

    // Play MP3 audio cleanly over URL endpoint
    playAudioUrl: async function (url) {
        return new Promise((resolve) => {
            const audio = new Audio(url);
            audio.onended = () => resolve(true);
            audio.onerror = (e) => {
                console.warn("MP3 Audio endpoint failed/empty, falling back to TTS:", e);
                resolve(false);
            };
            audio.play().catch(e => {
                console.warn("MP3 Audio playback failed, falling back to TTS:", e);
                resolve(false);
            });
        });
    },

    // Stream /api/tts directly over HTML5 Audio (new Audio())
    speakText: async function (text) {
        return new Promise(async (resolve) => {
            try {
                const response = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });

                if (response.ok) {
                    const blob = await response.blob();
                    if (blob && blob.size > 200) {
                        const objectUrl = URL.createObjectURL(blob);
                        const audio = new Audio(objectUrl);
                        audio.onended = () => {
                            URL.revokeObjectURL(objectUrl);
                            resolve(true);
                        };
                        audio.onerror = () => {
                            URL.revokeObjectURL(objectUrl);
                            resolve(false);
                        };
                        audio.play().catch(() => {
                            URL.revokeObjectURL(objectUrl);
                            resolve(false);
                        });
                        return;
                    }
                }
            } catch (err) {
                console.warn("/api/tts failed:", err);
            }
            resolve(false);
        });
    }
};

