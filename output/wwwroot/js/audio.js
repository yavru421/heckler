let mediaRecorder = null;
let audioChunks = [];
let segmentedAudioCtx = null;
let audioUnlocked = false;

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
        const silentAudio = new Audio();
        silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        silentAudio.play().then(() => {
            silentAudio.pause();
        }).catch(() => {});

        if (window.speechSynthesis) {
            window.speechSynthesis.resume();
        }
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

                if (cachedResponse && cachedResponse.ok) {
                    const blob = await cachedResponse.blob();
                    if (blob && blob.size > 100) {
                        objectUrlToRevoke = URL.createObjectURL(blob);
                        audioUrlToPlay = objectUrlToRevoke;
                    } else {
                        await cache.delete(url);
                        audioUrlToPlay = url;
                    }
                } else {
                    if (cachedResponse && !cachedResponse.ok) {
                        await cache.delete(url);
                    }
                    const response = await fetch(url);
                    if (response.ok) {
                        const blob = await response.blob();
                        if (blob && blob.size > 100) {
                            try {
                                await cache.put(url, response.clone());
                            } catch (cacheErr) {
                                console.warn("Failed to write to browser Cache Storage:", cacheErr);
                            }
                            objectUrlToRevoke = URL.createObjectURL(blob);
                            audioUrlToPlay = objectUrlToRevoke;
                        } else {
                            resolve(false);
                            return;
                        }
                    } else {
                        resolve(false);
                        return;
                    }
                }
            } catch (err) {
                console.error("Browser caching/fetching audio failed, falling back to direct play:", err);
                audioUrlToPlay = url;
            }

            const audio = new Audio();

            const cleanup = () => {
                if (objectUrlToRevoke) {
                    try {
                        URL.revokeObjectURL(objectUrlToRevoke);
                    } catch (e) {
                        console.error("Failed to revoke object URL:", e);
                    }
                    objectUrlToRevoke = null;
                }
            };

            audio.onended = () => {
                cleanup();
                resolve(true);
            };

            audio.onerror = (e) => {
                console.warn("Audio playback error:", e);
                cleanup();
                resolve(false);
            };

            audio.src = audioUrlToPlay;
            audio.play().catch(e => {
                console.warn("Playback failed:", e);
                cleanup();
                resolve(false);
            });
        });
    },

    // 3. Text to Speech with Cloudflare Neural AI + [PAUSE] Support
    speakText: async function (text, rate = 1.0) {
        return new Promise(async (resolve) => {
            try {
                const response = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });

                if (response.ok) {
                    const blob = await response.blob();
                    if (blob && blob.size > 500) {
                        const objectUrl = URL.createObjectURL(blob);
                        const audio = new Audio(objectUrl);
                        audio.playbackRate = rate;
                        audio.onended = () => {
                            URL.revokeObjectURL(objectUrl);
                            resolve();
                        };
                        audio.onerror = () => {
                            URL.revokeObjectURL(objectUrl);
                            this.fallbackSpeakText(text, rate).then(resolve);
                        };
                        audio.play().catch(() => {
                            URL.revokeObjectURL(objectUrl);
                            this.fallbackSpeakText(text, rate).then(resolve);
                        });
                        return;
                    }
                }
            } catch (err) {
                console.warn("Cloudflare Neural TTS failed, using fallback:", err);
            }

            this.fallbackSpeakText(text, rate).then(resolve);
        });
    },

    fallbackSpeakText: function (text, rate = 1.0) {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) { resolve(); return; }
            window.speechSynthesis.cancel();
            const parts = text.split(/\[PAUSE(?::[0-9.]+)?\]/i);
            let index = 0;

            function speakNext() {
                if (index >= parts.length) {
                    resolve();
                    return;
                }
                const part = parts[index];
                const pauseVal = parts[index + 1];
                index += 2;

                const trimmed = part ? part.trim() : "";
                let delay = 500;
                if (index <= parts.length) {
                    delay = pauseVal !== undefined ? (parseFloat(pauseVal) * 1000 || 1000) : 1000;
                }

                if (!trimmed) {
                    setTimeout(speakNext, delay);
                    return;
                }

                const utterance = new SpeechSynthesisUtterance(trimmed);
                utterance.rate = rate;
                utterance.onend = () => setTimeout(speakNext, delay);
                utterance.onerror = () => speakNext();
                window.speechSynthesis.speak(utterance);
            }

            speakNext();
        });
    },

    cancelSpeech: function () {
        window.speechSynthesis.cancel();
    },

    // 3.5 Segmented Joke Playback
    playSegmentedJoke: async function (baseUrl, jokeId, segmentsJson, rate) {
        this.cancelSegmentedPlayback();
        
        segmentedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const segments = JSON.parse(segmentsJson);
        let speechIndex = 0;

        return new Promise(async (resolve) => {
            for (const segment of segments) {
                if (!segmentedAudioCtx || segmentedAudioCtx.state === 'closed') {
                    resolve();
                    return;
                }

                if (segment.type === 'pause') {
                    await new Promise(r => setTimeout(r, segment.durationMs || 0));
                } else if (segment.type === 'speech') {
                    const audioUrl = `${baseUrl}api/jokes/${jokeId}/audio/segment/${speechIndex}`;
                    
                    try {
                        const response = await fetch(audioUrl);
                        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                        const arrayBuffer = await response.arrayBuffer();
                        
                        if (!segmentedAudioCtx || segmentedAudioCtx.state === 'closed') {
                            resolve();
                            return;
                        }

                        const audioBuffer = await segmentedAudioCtx.decodeAudioData(arrayBuffer);
                        const source = segmentedAudioCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.playbackRate.value = rate;
                        source.connect(segmentedAudioCtx.destination);
                        
                        await new Promise(r => {
                            source.onended = r;
                            source.start(0);
                        });
                    } catch (e) {
                        console.error(`Failed to play segment ${speechIndex}:`, e);
                    }
                    
                    speechIndex++;
                }
            }
            resolve();
        });
    },

    cancelSegmentedPlayback: function () {
        if (segmentedAudioCtx) {
            segmentedAudioCtx.close().catch(console.error);
            segmentedAudioCtx = null;
        }
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
