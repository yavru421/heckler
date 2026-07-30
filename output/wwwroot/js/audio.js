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
let progressCallbackRef = null;

window.audioInterop = {
    unlockAudio: function () {
        unlockAudio();
    },

    registerProgressCallback: function (dotNetRef) {
        progressCallbackRef = dotNetRef;
    },

    stopAllAudio: function() {
        if (currentAudio) {
            try { currentAudio.pause(); currentAudio = null; } catch(e) {}
        }
        if ('speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch(e) {}
        }
        if (progressCallbackRef) {
            try { progressCallbackRef.invokeMethodAsync('UpdateAudioProgress', 0.0); } catch(e) {}
        }
    },

    // Play MP3 audio cleanly over URL endpoint with fallback to speech synthesis / TTS
    playAudioUrl: async function (url, fallbackText = "", isFemale = false, performer = "") {
        window.audioInterop.stopAllAudio();
        let success = false;
        try {
            const response = await fetch(url);
            if (response.ok) {
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("audio") || contentType.includes("octet-stream") || response.status === 200) {
                    const blob = await response.blob();
                    if (blob && blob.size > 200) {
                        return new Promise((resolve) => {
                            const objectUrl = URL.createObjectURL(blob);
                            const audio = new Audio(objectUrl);
                            currentAudio = audio;
                            audio.ontimeupdate = () => {
                                if (audio.duration > 0 && progressCallbackRef) {
                                    try { progressCallbackRef.invokeMethodAsync('UpdateAudioProgress', audio.currentTime / audio.duration); } catch(e) {}
                                }
                            };
                            audio.onended = () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                if (progressCallbackRef) {
                                    try { progressCallbackRef.invokeMethodAsync('UpdateAudioProgress', 1.0); } catch(e) {}
                                }
                                resolve(true);
                            };
                            audio.onerror = async () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                if (fallbackText) {
                                    const spoken = await window.audioInterop.speakText(fallbackText, isFemale, performer);
                                    resolve(spoken);
                                } else {
                                    resolve(false);
                                }
                            };
                            audio.play().then(() => {}).catch(async () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                if (fallbackText) {
                                    const spoken = await window.audioInterop.speakText(fallbackText, isFemale, performer);
                                    resolve(spoken);
                                } else {
                                    resolve(false);
                                }
                            });
                        });
                    }
                }
            }
        } catch (err) {
            console.warn("Fetch audio endpoint failed, falling back to TTS:", err);
        }

        if (fallbackText) {
            return await window.audioInterop.speakText(fallbackText, isFemale, performer);
        }
        return false;
    },

    apiBaseUrl: "",

    setApiBaseUrl: function (url) {
        window.audioInterop.apiBaseUrl = url || "";
    },

    // Stream /api/tts directly over HTML5 Audio with Web Speech API fallback
    speakText: async function (text, isFemale = false, performer = "") {
        window.audioInterop.stopAllAudio();
        if (!text) return false;
        const femaleFlag = Boolean(isFemale === true || (typeof isFemale === 'string' && isFemale.toLowerCase() === 'true') || (performer && performer.toLowerCase().includes('sarah')));
        const ttsEndpoint = (window.audioInterop.apiBaseUrl ? window.audioInterop.apiBaseUrl.replace(/\/$/, '') : '') + '/api/tts';
        
        return new Promise(async (resolve) => {
            try {
                const response = await fetch(ttsEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text, performer: performer || (femaleFlag ? "SpicySarah" : "NeonMike") })
                });

                if (response.ok) {
                    const contentType = response.headers.get("content-type") || "";
                    if (contentType.includes("audio") || contentType.includes("octet-stream") || response.status === 200) {
                        const blob = await response.blob();
                        if (blob && blob.size > 200) {
                            const objectUrl = URL.createObjectURL(blob);
                            const audio = new Audio(objectUrl);
                            currentAudio = audio;
                            audio.ontimeupdate = () => {
                                if (audio.duration > 0 && progressCallbackRef) {
                                    try { progressCallbackRef.invokeMethodAsync('UpdateAudioProgress', audio.currentTime / audio.duration); } catch(e) {}
                                }
                            };
                            audio.onended = () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                                if (progressCallbackRef) {
                                    try { progressCallbackRef.invokeMethodAsync('UpdateAudioProgress', 1.0); } catch(e) {}
                                }
                                resolve(true);
                            };
                            audio.onerror = () => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                            };
                            audio.play().then(() => {}).catch(() => {
                                URL.revokeObjectURL(objectUrl);
                                if (currentAudio === audio) currentAudio = null;
                            });
                            return;
                        }
                    }
                }
            } catch (err) {
                console.warn("/api/tts failed, attempting Web Speech API fallback:", err);
            }

            // Web Speech API fallback
            if ('speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                    }
                    const cleanText = text.replace(/\[PAUSE(?::[0-9.]+)?\]/gi, " ").replace(/[#*$_[\](){}]/g, "").replace(/\s+/g, " ").trim();
                    const utterance = new SpeechSynthesisUtterance(cleanText);
                    utterance.rate = 1.0;
                    utterance.volume = 1.0;
                    utterance.pitch = 1.0;
                    
                    const setVoice = () => {
                        const voices = window.speechSynthesis.getVoices();
                        if (voices && voices.length > 0) {
                            if (femaleFlag) {
                                const femaleVoice = voices.find(v => v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("samantha") || v.name.toLowerCase().includes("victoria") || v.name.toLowerCase().includes("karen") || v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("google us english"));
                                if (femaleVoice) utterance.voice = femaleVoice;
                            }
                        }
                    };
                    setVoice();
                    if ('onvoiceschanged' in window.speechSynthesis) {
                        window.speechSynthesis.onvoiceschanged = setVoice;
                    }

                    let durationEstimateMs = Math.max(2000, (cleanText.split(' ').length / 2.5) * 1000);
                    let startTime = Date.now();
                    let interval = setInterval(() => {
                        let elapsed = Date.now() - startTime;
                        let progress = Math.min(1.0, elapsed / durationEstimateMs);
                        if (progressCallbackRef) {
                            try { progressCallbackRef.invokeMethodAsync('UpdateAudioProgress', progress); } catch(e) {}
                        }
                        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
                            window.speechSynthesis.resume();
                        }
                        if (progress >= 1.0) clearInterval(interval);
                    }, 250);

                    utterance.onend = () => {
                        clearInterval(interval);
                        if (progressCallbackRef) {
                            try { progressCallbackRef.invokeMethodAsync('UpdateAudioProgress', 1.0); } catch(e) {}
                        }
                        resolve(true);
                    };
                    utterance.onerror = (err) => {
                        console.warn("SpeechSynthesis utterance error:", err);
                        clearInterval(interval);
                        resolve(false);
                    };
                    window.speechSynthesis.speak(utterance);
                    window.speechSynthesis.resume();
                    return;
                } catch (e) {
                    console.warn("SpeechSynthesis failed:", e);
                }
            }

            resolve(false);
        });
    },

    // Synthesized Sound Effects for Audience Soundboard Reactions
    playSynthSound: function (type) {
        try {
            unlockAudio();
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            
            const now = ctx.currentTime;
            if (type === 'laugh') {
                [0, 0.12, 0.24, 0.36].forEach((delay) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(300 + Math.random() * 80, now + delay);
                    osc.frequency.exponentialRampToValueAtTime(450 + Math.random() * 100, now + delay + 0.08);
                    gain.gain.setValueAtTime(0.3, now + delay);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.1);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + delay);
                    osc.stop(now + delay + 0.1);
                });
            } else if (type === 'clap') {
                [0, 0.05, 0.11, 0.18, 0.26, 0.35, 0.45].forEach((delay) => {
                    const bufferSize = ctx.sampleRate * 0.06;
                    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                    const output = buffer.getChannelData(0);
                    for (let i = 0; i < bufferSize; i++) {
                        output[i] = Math.random() * 2 - 1;
                    }
                    const whiteNoise = ctx.createBufferSource();
                    whiteNoise.buffer = buffer;
                    const filter = ctx.createBiquadFilter();
                    filter.type = 'bandpass';
                    filter.frequency.value = 1000 + Math.random() * 400;
                    const gain = ctx.createGain();
                    gain.gain.setValueAtTime(0.2, now + delay);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.05);
                    whiteNoise.connect(filter);
                    filter.connect(gain);
                    gain.connect(ctx.destination);
                    whiteNoise.start(now + delay);
                });
            } else if (type === 'boo') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.8);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.8);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.8);
            }
        } catch (e) {
            console.warn("Synth sound failed:", e);
        }
    }
};
