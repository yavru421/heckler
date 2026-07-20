let mediaRecorder = null;
let audioChunks = [];

window.audioInterop = {
    // 1. Microphone Recording API
    startRecording: async function () {
        audioChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            mediaRecorder.start();
            return true;
        } catch (e) {
            console.error("Error accessing microphone:", e);
            return false;
        }
    },

    stopRecording: function () {
        return new Promise((resolve) => {
            if (!mediaRecorder || mediaRecorder.state === "inactive") {
                resolve("");
                return;
            }
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                // Stop all tracks to release mic
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
                
                // Convert to base64
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = reader.result.split(',')[1];
                    resolve(base64data);
                };
            };
            mediaRecorder.stop();
        });
    },

    // 2. Play Audio BLOB URL
    playAudioUrl: async function (url) {
        return new Promise(async (resolve) => {
            let audioUrlToPlay = url;
            let objectUrlToRevoke = null;

            try {
                const cacheName = 'heckler-audio-v1';
                const cache = await window.caches.open(cacheName);
                const cachedResponse = await cache.match(url);

                if (cachedResponse) {
                    const blob = await cachedResponse.blob();
                    objectUrlToRevoke = URL.createObjectURL(blob);
                    audioUrlToPlay = objectUrlToRevoke;
                } else {
                    const response = await fetch(url);
                    if (response.ok) {
                        const responseToCache = response.clone();
                        try {
                            await cache.put(url, responseToCache);
                        } catch (cacheErr) {
                            console.warn("Failed to write to browser Cache Storage:", cacheErr);
                        }
                        const blob = await response.blob();
                        objectUrlToRevoke = URL.createObjectURL(blob);
                        audioUrlToPlay = objectUrlToRevoke;
                    }
                }
            } catch (err) {
                console.error("Browser caching/fetching audio failed, falling back to direct play:", err);
                audioUrlToPlay = url;
            }

            const audio = new Audio(audioUrlToPlay);

            const cleanup = () => {
                if (objectUrlToRevoke) {
                    try {
                        URL.revokeObjectURL(objectUrlToRevoke);
                    } catch (e) {
                        console.error("Failed to revoke object URL:", e);
                    }
                    objectUrlToRevoke = null;
                }
                resolve();
            };

            audio.onended = cleanup;
            audio.onerror = (e) => {
                console.error("Audio playback error:", e);
                cleanup();
            };

            audio.play().catch(e => {
                console.error("Playback failed:", e);
                cleanup();
            });
        });
    },

    // 3. Text to Speech with [PAUSE] Support
    speakText: function (text, rate = 1.0) {
        return new Promise((resolve) => {
            window.speechSynthesis.cancel();
            const parts = text.split(/\[PAUSE\]/i);
            let index = 0;

            function speakNext() {
                if (index >= parts.length) {
                    resolve();
                    return;
                }
                const part = parts[index].trim();
                if (!part) {
                    index++;
                    setTimeout(speakNext, 800); // 800ms pause for empty sections/PAUSE tags
                    return;
                }

                const utterance = new SpeechSynthesisUtterance(part);
                utterance.rate = rate;
                utterance.onend = () => {
                    index++;
                    setTimeout(speakNext, 500); // Small pause after speech segments
                };
                utterance.onerror = () => {
                    index++;
                    speakNext();
                };
                window.speechSynthesis.speak(utterance);
            }

            speakNext();
        });
    },

    cancelSpeech: function () {
        window.speechSynthesis.cancel();
    },

    // 4. Synthesizer sound effects (Web Audio API)
    playSynthSound: function (type) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        if (type === 'laugh') {
            // Simulated chuckles: burst of short rapid pitch slides
            const now = audioCtx.currentTime;
            for (let i = 0; i < 5; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                
                const startTime = now + i * 0.15;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, startTime);
                osc.frequency.exponentialRampToValueAtTime(450, startTime + 0.1);
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
                
                osc.start(startTime);
                osc.stop(startTime + 0.15);
            }
        } else if (type === 'boo') {
            // Simulated low-pitch crowd boo
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(90, audioCtx.currentTime + 1.2);
            
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
            gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.8);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
            
            osc.start();
            osc.stop(audioCtx.currentTime + 1.2);
        } else if (type === 'clap') {
            // Simulated clap: high frequency noise burst
            const bufferSize = audioCtx.sampleRate * 0.1;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000;
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            
            noise.start();
            noise.stop(audioCtx.currentTime + 0.1);
        }
    }
};
